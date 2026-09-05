/*
================================================================================
| FILE: skald-ui/src/utils/meter.ts                                            |
|                                                                              |
| Peak-meter arithmetic for the transport dock (roadmap packet B10), kept     |
| pure so the two traps the roadmap names are testable without a browser:    |
| the clip decision is made on FLOAT samples (getByteTimeDomainData is 8-bit |
| and tops out at 0 dBFS, so a byte-driven clip LED could never light), and  |
| the peak hold falls at a known rate so a transient stays readable.         |
================================================================================
*/

/** E5 (roadmap 9.9): the DC-blocker/limiter's non-finite (NaN/Inf) flush
 *  counts, read from the generated `skald_get_nonfinite_count` /
 *  `skald_get_asset_nonfinite_count` exports. `total` folds in the master-bus
 *  backstop, which has no single asset to attribute to; `perAsset` is indexed
 *  the same way the worklet addresses assets elsewhere (note-on, set-param). */
export interface NonfiniteCounts {
    total: number;
    perAsset: number[];
}

/** The two analysers the engine taps, one per channel — an AnalyserNode
 *  downmixes to mono, so a single tap would hide a one-sided over.
 *
 *  `nonfiniteCounts` rides along on this same object (rather than a new prop
 *  threaded through app.tsx) so PeakMeter can poll it every rAF tick exactly
 *  the way it already polls the audio buffers below — a ref mutated in place
 *  by useWasmAudioEngine's port.onmessage handler, not React state, because
 *  a warning that can change dozens of times a second has no business forcing
 *  a re-render on every tick. */
export interface StereoAnalysers {
    left: AnalyserNode;
    right: AnalyserNode;
    nonfiniteCounts?: { current: NonfiniteCounts };
}

/** 0 dBFS. A sample at or beyond full scale is an over. */
export const CLIP_THRESHOLD = 1.0;
/** Bottom of the bar. */
export const METER_FLOOR_DB = -60;
/** How fast the hold tick falls once the signal drops below it. */
export const HOLD_DECAY_DB_PER_SECOND = 20;

/** Largest absolute sample. A non-finite sample (NaN/Inf from the DSP) is
 *  reported as Infinity: it is a fault, and a meter that read it as 0 would
 *  show silence for a patch that is actually broken.
 *
 *  E5 (roadmap 9.9): since the backend's DC-blocker/limiter now flushes every
 *  NaN/Inf to 0 before it leaves the wasm module (both at the per-asset stage
 *  and the master-bus backstop — codegen_project.odin::emit_soft_limit_proc),
 *  this Infinity path is no longer reachable through ordinary playback; a
 *  fault now reaches the UI through NonfiniteCounts instead (see below), not
 *  through an out-of-range sample landing on this analyser tap. Left in place
 *  as a defensive floor, not the detection path any more. */
export const peakOf = (samples: Float32Array): number => {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (!Number.isFinite(a)) return Infinity;
        if (a > max) max = a;
    }
    return max;
};

export const toDbfs = (peak: number): number => (peak <= 0 ? -Infinity : 20 * Math.log10(peak));

/** 0..1 bar fill for a linear peak, floor at METER_FLOOR_DB, pinned at 1 for an over. */
export const meterFill = (peak: number, floorDb = METER_FLOOR_DB): number => {
    const db = toDbfs(peak);
    if (db <= floorDb) return 0;
    if (db >= 0) return 1;
    return (db - floorDb) / -floorDb;
};

/** Peak hold: jumps up to a louder peak at once, otherwise falls at `decay` dB/s. */
export const advanceHold = (prevHoldDb: number, peakDb: number, dtSeconds: number, decay = HOLD_DECAY_DB_PER_SECOND): number =>
    Math.max(peakDb, prevHoldDb - decay * dtSeconds);

export const isClipping = (peak: number): boolean => peak >= CLIP_THRESHOLD;

/** E9 (roadmap 9.4 item 3): stereo phase correlation over one analysis
 *  window. +1 means L and R carry identical signal (fully mono-compatible);
 *  -1 means R is L inverted — a mix that cancels to silence the moment a
 *  game (or a phone speaker) sums it to mono, the exact fault this meter
 *  exists to catch; 0 means the channels are unrelated. This is cosine
 *  similarity of the two buffers, not Pearson's r: by the time a signal
 *  reaches this tap it has already been through the backend's own DC
 *  blocker (codegen_project.odin's `skald_dc_block`, E5), so subtracting a
 *  second, independently-computed running mean here would just be a second
 *  DC estimate that can disagree with the first — the SKB-002 shape, one
 *  layer up. Guards against the 0/0 a silent channel would produce (NaN
 *  reads as a fault everywhere else in this file; here it is simply "no
 *  correlation to report", the same as true silence). */
export const correlation = (l: Float32Array, r: Float32Array): number => {
    const n = Math.min(l.length, r.length);
    let sumLR = 0;
    let sumLL = 0;
    let sumRR = 0;
    for (let i = 0; i < n; i++) {
        const a = l[i];
        const b = r[i];
        sumLR += a * b;
        sumLL += a * a;
        sumRR += b * b;
    }
    const denom = Math.sqrt(sumLL * sumRR);
    return denom === 0 ? 0 : sumLR / denom;
};
