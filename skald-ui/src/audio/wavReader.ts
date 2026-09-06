/*
================================================================================
| FILE: skald-ui/src/audio/wavReader.ts                                       |
|                                                                              |
| Dependency-free RIFF/WAVE reader (roadmap G4, §9.20) — the counterpart to   |
| wavEncoder.ts's writer. Imports a single-cycle .wav exported from a         |
| wavetable synth (Serum, Vital, etc.) and resamples it to the                |
| SINGLE_CYCLE_LENGTH-sample table skald-backend/core/param_utils.odin::      |
| decode_custom_wavetable compiles into a static Odin float array.            |
|                                                                              |
| Reads PCM 8/16/24/32-bit and IEEE float32, mono or the first channel of a   |
| multi-channel file — never the browser's <audio>/AudioContext decode, which |
| is unavailable in the web server and in a headless test run. If a 'smpl'    |
| chunk carries a loop, that range IS the cycle; otherwise the whole file is  |
| treated as one cycle. Everything downstream (codegen, the acceptance        |
| fixture, this file's own tests) depends on tableToBase64/base64ToTable      |
| agreeing byte-for-byte with the Odin decoder — see that proc's comment for  |
| why there are two implementations of this exact byte layout instead of one. |
================================================================================
*/

/** What the Odin side compiles into a static `[2048]f32` array. */
export const SINGLE_CYCLE_LENGTH = 2048;

export interface DecodedWav {
    sampleRate: number;
    channels: number;
    /** Channel 0 only, normalized to -1..1 floats regardless of source bit depth. */
    samples: Float32Array;
    /** Sample-accurate loop range from a canonical 'smpl' chunk's FIRST loop record, if present. */
    loop?: { start: number; end: number };
}

const readAscii = (view: DataView, offset: number, len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
};

/**
 * Parse a RIFF/WAVE file into its first channel as floats. Throws on
 * anything that is not a well-formed WAV this importer can read (missing
 * `fmt `/`data`, or a bit depth/format tag combination outside PCM 8/16/24/32
 * and IEEE float32) — the caller (the Import dialog) surfaces the message,
 * rather than this silently returning silence for a file it could not parse.
 */
export const decodeWav = (bytes: Uint8Array): DecodedWav => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
        throw new Error('decodeWav: not a RIFF/WAVE file');
    }

    let offset = 12;
    let fmt: { formatTag: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
    let dataBytes: Uint8Array | null = null;
    let loop: { start: number; end: number } | undefined;

    // Chunks are word-aligned: an odd-sized body is followed by one pad byte
    // not counted in its own size field. Skipping that is what keeps the
    // scan from reading the pad byte as the next chunk's id.
    while (offset + 8 <= bytes.length) {
        const id = readAscii(view, offset, 4);
        const size = view.getUint32(offset + 4, true);
        const body = offset + 8;
        if (id === 'fmt ') {
            fmt = {
                formatTag: view.getUint16(body, true),
                channels: view.getUint16(body + 2, true),
                sampleRate: view.getUint32(body + 4, true),
                bitsPerSample: view.getUint16(body + 14, true),
            };
        } else if (id === 'data') {
            dataBytes = bytes.subarray(body, body + size);
        } else if (id === 'smpl' && size >= 36 + 24) {
            // Canonical 'smpl' chunk: 9 u32 header fields (manufacturer,
            // product, samplePeriod, unityNote, pitchFraction, smpteFormat,
            // smpteOffset, numSampleLoops @ +28, samplerData), then
            // numSampleLoops loop records of 6 u32 each starting at +36. Only
            // the FIRST loop's start/end (frame indices) matter here.
            const numLoops = view.getUint32(body + 28, true);
            if (numLoops > 0) {
                const rec = body + 36;
                loop = { start: view.getUint32(rec + 8, true), end: view.getUint32(rec + 12, true) };
            }
        }
        offset = body + size + (size % 2);
    }

    if (!fmt) throw new Error('decodeWav: missing fmt chunk');
    if (!dataBytes) throw new Error('decodeWav: missing data chunk');

    const bytesPerSample = fmt.bitsPerSample / 8;
    const frameBytes = bytesPerSample * fmt.channels;
    if (frameBytes <= 0) throw new Error(`decodeWav: unsupported bit depth ${fmt.bitsPerSample}`);
    const frames = Math.floor(dataBytes.length / frameBytes);
    const dataView = new DataView(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength);
    const samples = new Float32Array(frames);
    const isFloat = fmt.formatTag === 3;

    for (let i = 0; i < frames; i++) {
        const o = i * frameBytes; // channel 0 only — later channels are skipped
        let v: number;
        if (isFloat && fmt.bitsPerSample === 32) {
            v = dataView.getFloat32(o, true);
        } else if (!isFloat && fmt.bitsPerSample === 8) {
            // 8-bit PCM is the one unsigned WAV format (0..255, centered at 128).
            v = (dataView.getUint8(o) - 128) / 128;
        } else if (!isFloat && fmt.bitsPerSample === 16) {
            v = dataView.getInt16(o, true) / 32768;
        } else if (!isFloat && fmt.bitsPerSample === 24) {
            const b0 = dataView.getUint8(o);
            const b1 = dataView.getUint8(o + 1);
            const b2 = dataView.getUint8(o + 2);
            let sample = b0 | (b1 << 8) | (b2 << 16);
            if (sample & 0x800000) sample -= 0x1000000; // sign-extend
            v = sample / 8388608;
        } else if (!isFloat && fmt.bitsPerSample === 32) {
            v = dataView.getInt32(o, true) / 2147483648;
        } else {
            throw new Error(`decodeWav: unsupported format (tag ${fmt.formatTag}, ${fmt.bitsPerSample}-bit)`);
        }
        samples[i] = v;
    }

    return { sampleRate: fmt.sampleRate, channels: fmt.channels, samples, loop };
};

/**
 * Resample an arbitrary-length single cycle to exactly SINGLE_CYCLE_LENGTH
 * samples by linear interpolation, remove DC offset, and normalize peak
 * amplitude to 1.0. `sampleRate` is accepted (not just the cycle) to keep
 * this signature symmetric with decodeWav's output and available to a future
 * caller that wants to reason about the cycle's implied pitch; the resample
 * math itself only needs the cycle's own length.
 *
 * The interpolation WRAPS at the end of the cycle back to index 0 — this is
 * one PERIOD of a periodic waveform, not a finite clip, so the last sample
 * must blend toward the first the same way skald_wavetable_sample_custom's
 * phase accumulator wraps at 1.0 (codegen_project.odin::
 * emit_custom_wavetable_sample_proc). A resampler that clamped at the last
 * sample instead would bake an audible seam into every imported table.
 */
export const singleCycleTable = (cycle: Float32Array, _sampleRate: number): Float32Array => {
    const n = cycle.length;
    const out = new Float32Array(SINGLE_CYCLE_LENGTH);
    if (n === 0) return out;

    for (let i = 0; i < SINGLE_CYCLE_LENGTH; i++) {
        const pos = (i / SINGLE_CYCLE_LENGTH) * n;
        const i0 = Math.floor(pos) % n;
        const i1 = (i0 + 1) % n;
        const frac = pos - Math.floor(pos);
        out[i] = cycle[i0] + (cycle[i1] - cycle[i0]) * frac;
    }

    let mean = 0;
    for (const v of out) mean += v;
    mean /= SINGLE_CYCLE_LENGTH;

    let peak = 0;
    for (let i = 0; i < SINGLE_CYCLE_LENGTH; i++) {
        out[i] -= mean;
        peak = Math.max(peak, Math.abs(out[i]));
    }
    if (peak > 0) {
        for (let i = 0; i < SINGLE_CYCLE_LENGTH; i++) out[i] /= peak;
    }
    return out;
};

/**
 * decodeWav + loop-range extraction + singleCycleTable, the whole Import
 * action's transform in one call. A loop end at or before its start is
 * treated as absent (a malformed or degenerate smpl chunk) rather than
 * producing a negative- or zero-length cycle.
 */
export const importWavAsTable = (bytes: Uint8Array): Float32Array => {
    const decoded = decodeWav(bytes);
    const cycle =
        decoded.loop && decoded.loop.end > decoded.loop.start
            ? decoded.samples.subarray(decoded.loop.start, decoded.loop.end)
            : decoded.samples;
    return singleCycleTable(cycle, decoded.sampleRate);
};

/**
 * Little-endian float32 x SINGLE_CYCLE_LENGTH -> base64. This exact byte
 * layout is what skald-backend/core/param_utils.odin::decode_custom_wavetable
 * decodes — the two are mirrors of each other (transcribed case by case, not
 * shared code, per CLAUDE.md's "one reader" rule applied across languages),
 * so a change to one's byte order must change the other's comment at least.
 */
export const tableToBase64 = (table: Float32Array): string => {
    const bytes = new Uint8Array(table.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < table.length; i++) view.setFloat32(i * 4, table[i], true);
    // Chunked to avoid a call-stack blowup from String.fromCharCode(...bytes)
    // on a large array — 2048 samples is only 8KB today, but this scales.
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

/** The inverse of tableToBase64 — how the node card's waveform preview reads a stored table back. */
export const base64ToTable = (b64: string): Float32Array => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const out = new Float32Array(Math.floor(bytes.length / 4));
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
};
