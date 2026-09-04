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

/** The two analysers the engine taps, one per channel — an AnalyserNode
 *  downmixes to mono, so a single tap would hide a one-sided over. */
export interface StereoAnalysers {
    left: AnalyserNode;
    right: AnalyserNode;
}

/** 0 dBFS. A sample at or beyond full scale is an over. */
export const CLIP_THRESHOLD = 1.0;
/** Bottom of the bar. */
export const METER_FLOOR_DB = -60;
/** How fast the hold tick falls once the signal drops below it. */
export const HOLD_DECAY_DB_PER_SECOND = 20;

/** Largest absolute sample. A non-finite sample (NaN/Inf from the DSP) is
 *  reported as Infinity: it is a fault, and a meter that read it as 0 would
 *  show silence for a patch that is actually broken. */
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
