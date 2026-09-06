// Roadmap G4 (§9.20) — wavetable import: decode an arbitrary single-cycle
// .wav (Serum/Vital export or a hand-recorded cycle) into the 2048-sample
// Float32Array the codegen side compiles into a static Odin array.
//
// decodeWav is dependency-free RIFF/WAVE parsing — no <audio>/AudioContext
// decode, which would pull in a browser-only API the codegen path (which also
// runs headless, in the web server and in tests) cannot call. Three encoders
// exercise it: G1's own encodeWav24 (24-bit, already trusted — WavEncoder.test.ts
// proves its own round-trip), and two hand-built headers here for 16-bit PCM
// and IEEE float32, the two other shapes decodeWav promises to read.
import { describe, it, expect } from 'vitest';
import { encodeWav24, WAV_HEADER_BYTES } from '../../audio/wavEncoder';
import {
    decodeWav,
    singleCycleTable,
    importWavAsTable,
    tableToBase64,
    base64ToTable,
    SINGLE_CYCLE_LENGTH,
} from '../../audio/wavReader';

const putAscii = (out: Uint8Array, offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
};

/** Hand-built canonical 44-byte header + PCM16 mono data — a shape encodeWav24 never produces. */
const buildPcm16Mono = (samples: number[], sampleRate: number): Uint8Array => {
    const dataBytes = samples.length * 2;
    const out = new Uint8Array(44 + dataBytes);
    const view = new DataView(out.buffer);
    putAscii(out, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    putAscii(out, 8, 'WAVE');
    putAscii(out, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    putAscii(out, 36, 'data');
    view.setUint32(40, dataBytes, true);
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(44 + i * 2, Math.round(samples[i] * 32767), true);
    }
    return out;
};

/** Hand-built IEEE float32 mono WAV — format tag 3, the other shape decodeWav must read. */
const buildFloat32Mono = (samples: number[], sampleRate: number): Uint8Array => {
    const dataBytes = samples.length * 4;
    const out = new Uint8Array(44 + dataBytes);
    const view = new DataView(out.buffer);
    putAscii(out, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    putAscii(out, 8, 'WAVE');
    putAscii(out, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); // IEEE float
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 32, true);
    putAscii(out, 36, 'data');
    view.setUint32(40, dataBytes, true);
    for (let i = 0; i < samples.length; i++) {
        view.setFloat32(44 + i * 4, samples[i], true);
    }
    return out;
};

/** A PCM16 mono WAV with a canonical 'smpl' chunk carrying one loop, inserted between fmt and data. */
const buildPcm16MonoWithLoop = (
    samples: number[],
    sampleRate: number,
    loopStart: number,
    loopEnd: number,
): Uint8Array => {
    const dataBytes = samples.length * 2;
    const smplBodyLen = 36 + 24; // 9 u32 header fields + 1 loop record (6 u32)
    const smplChunkLen = 8 + smplBodyLen;
    const out = new Uint8Array(44 + smplChunkLen + dataBytes);
    const view = new DataView(out.buffer);
    putAscii(out, 0, 'RIFF');
    view.setUint32(4, out.length - 8, true);
    putAscii(out, 8, 'WAVE');
    putAscii(out, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    const o = 36;
    putAscii(out, o, 'smpl');
    view.setUint32(o + 4, smplBodyLen, true);
    // 9 header u32s (manufacturer, product, samplePeriod, unityNote, pitchFraction,
    // smpteFormat, smpteOffset, numSampleLoops, samplerData) — only numSampleLoops matters.
    view.setUint32(o + 8 + 28, 1, true); // numSampleLoops @ +28
    const loopRec = o + 8 + 36;
    view.setUint32(loopRec + 0, 0, true); // cuePointId
    view.setUint32(loopRec + 4, 0, true); // type (forward)
    view.setUint32(loopRec + 8, loopStart, true);
    view.setUint32(loopRec + 12, loopEnd, true);
    view.setUint32(loopRec + 16, 0, true); // fraction
    view.setUint32(loopRec + 20, 0, true); // playCount

    const dataOff = o + smplChunkLen;
    putAscii(out, dataOff, 'data');
    view.setUint32(dataOff + 4, dataBytes, true);
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(dataOff + 8 + i * 2, Math.round(samples[i] * 32767), true);
    }
    return out;
};

describe('decodeWav — 24-bit PCM (via encodeWav24)', () => {
    it('reads back the left channel and the sample rate, ignoring the right', () => {
        const left = new Float32Array([0, 0.5, -0.5, 0.25, 1, -1]);
        const right = new Float32Array([1, -0.25, 0.125, -0.75, 0, 0.3333]);
        const wav = encodeWav24(left, right, 44100);
        const decoded = decodeWav(wav);
        expect(decoded.sampleRate).toBe(44100);
        expect(decoded.channels).toBe(2);
        expect(decoded.samples.length).toBe(left.length);
        const step = 1 / 8388607;
        for (let i = 0; i < left.length; i++) {
            expect(Math.abs(decoded.samples[i] - left[i])).toBeLessThanOrEqual(step * 2);
        }
    });

    it('an empty (header-only) file decodes to zero samples, not an error', () => {
        const wav = encodeWav24(new Float32Array(0), new Float32Array(0), 48000);
        expect(wav.length).toBe(WAV_HEADER_BYTES);
        const decoded = decodeWav(wav);
        expect(decoded.samples.length).toBe(0);
    });
});

describe('decodeWav — 16-bit PCM mono', () => {
    it('round-trips within one 16-bit step', () => {
        const samples = [0, 0.5, -0.5, 0.25, 1, -1];
        const wav = buildPcm16Mono(samples, 48000);
        const decoded = decodeWav(wav);
        expect(decoded.sampleRate).toBe(48000);
        expect(decoded.channels).toBe(1);
        const step = 1 / 32767;
        for (let i = 0; i < samples.length; i++) {
            expect(Math.abs(decoded.samples[i] - samples[i])).toBeLessThanOrEqual(step * 2);
        }
    });
});

describe('decodeWav — IEEE float32 mono', () => {
    it('round-trips exactly (no quantization — float in, float out)', () => {
        const samples = [0, 0.5, -0.5, 0.123456, 1, -1];
        const wav = buildFloat32Mono(samples, 22050);
        const decoded = decodeWav(wav);
        expect(decoded.sampleRate).toBe(22050);
        expect(decoded.channels).toBe(1);
        for (let i = 0; i < samples.length; i++) {
            expect(decoded.samples[i]).toBeCloseTo(samples[i], 6);
        }
    });
});

describe('decodeWav — smpl loop chunk', () => {
    it('reports the loop range from a canonical smpl chunk', () => {
        const samples = new Array(20).fill(0).map((_, i) => Math.sin(i));
        const wav = buildPcm16MonoWithLoop(samples, 48000, 4, 16);
        const decoded = decodeWav(wav);
        expect(decoded.loop).toEqual({ start: 4, end: 16 });
    });

    it('has no loop when there is no smpl chunk', () => {
        const wav = buildPcm16Mono([0, 0.1, 0.2], 48000);
        const decoded = decodeWav(wav);
        expect(decoded.loop).toBeUndefined();
    });
});

describe('singleCycleTable', () => {
    it('resamples an arbitrary-length cycle to exactly SINGLE_CYCLE_LENGTH samples', () => {
        const cycle = new Float32Array([0, 1, 0, -1]); // a 4-sample "square-ish" cycle
        const table = singleCycleTable(cycle, 48000);
        expect(table.length).toBe(SINGLE_CYCLE_LENGTH);
    });

    it('removes DC offset', () => {
        const cycle = new Float32Array([1, 1, 1, 1, 3, 3, 3, 3]); // mean 2, swings +/-1 around it
        const table = singleCycleTable(cycle, 48000);
        let mean = 0;
        for (const v of table) mean += v;
        mean /= table.length;
        expect(Math.abs(mean)).toBeLessThan(0.01);
    });

    it('normalizes peak amplitude to 1.0', () => {
        const cycle = new Float32Array([0, 0.1, 0, -0.1]); // tiny amplitude
        const table = singleCycleTable(cycle, 48000);
        let peak = 0;
        for (const v of table) peak = Math.max(peak, Math.abs(v));
        expect(peak).toBeCloseTo(1.0, 3);
    });

    it('interpolates linearly between the source cycle\'s samples', () => {
        // A ramp 0..1..0..-1 repeating: sampled at 2048 points, the resampled
        // curve must still rise and fall smoothly, not step.
        const cycle = new Float32Array([-1, 0, 1, 0]);
        const table = singleCycleTable(cycle, 48000);
        // After DC removal (mean is already 0) and peak normalization (already
        // 1), index 0 must read the first source sample.
        expect(table[0]).toBeCloseTo(-1, 2);
        // Halfway to the next source sample (index ~ SINGLE_CYCLE_LENGTH/4)
        // must sit between -1 and 0, not jump.
        const quarter = table[Math.floor(SINGLE_CYCLE_LENGTH / 8)];
        expect(quarter).toBeGreaterThan(-1);
        expect(quarter).toBeLessThan(0);
    });

    it('a silent cycle (all zero) does not divide by zero into NaN/Infinity', () => {
        const table = singleCycleTable(new Float32Array(8), 48000);
        for (const v of table) expect(Number.isFinite(v)).toBe(true);
    });
});

describe('importWavAsTable — decode + loop extraction + resample, end to end', () => {
    it('a one-cycle 440Hz-ish sine (no smpl chunk) decodes to one clean cycle', () => {
        const sampleRate = 44100;
        const cycleLen = Math.round(sampleRate / 440); // ~100 samples, one period
        const samples: number[] = [];
        for (let i = 0; i < cycleLen; i++) samples.push(Math.sin((i / cycleLen) * 2 * Math.PI));
        const wav = buildFloat32Mono(samples, sampleRate);

        const table = importWavAsTable(wav);
        expect(table.length).toBe(SINGLE_CYCLE_LENGTH);
        // A sine cycle starts at 0, rises to +1 around a quarter of the way in.
        expect(Math.abs(table[0])).toBeLessThan(0.15);
        const quarterIdx = Math.floor(SINGLE_CYCLE_LENGTH / 4);
        expect(table[quarterIdx]).toBeGreaterThan(0.9);
        const threeQuarterIdx = Math.floor((3 * SINGLE_CYCLE_LENGTH) / 4);
        expect(table[threeQuarterIdx]).toBeLessThan(-0.9);
    });

    it('when a smpl loop is present, only the loop range becomes the cycle (not the whole file)', () => {
        const sampleRate = 48000;
        // A file that is silence, then one clean sine cycle in [10, 10+cycleLen), then silence.
        const cycleLen = 64;
        const samples: number[] = new Array(10).fill(0);
        for (let i = 0; i < cycleLen; i++) samples.push(Math.sin((i / cycleLen) * 2 * Math.PI));
        samples.push(...new Array(10).fill(0));
        const wav = buildPcm16MonoWithLoop(samples, sampleRate, 10, 10 + cycleLen);

        const table = importWavAsTable(wav);
        expect(table.length).toBe(SINGLE_CYCLE_LENGTH);
        // If the whole file (mostly silence) had been used instead of the loop
        // range, the peak would still normalize to 1 but the shape would be
        // dominated by near-zero samples with a brief spike, not a clean sine
        // rising through its first quarter.
        const quarterIdx = Math.floor(SINGLE_CYCLE_LENGTH / 4);
        expect(table[quarterIdx]).toBeGreaterThan(0.8);
    });
});

describe('tableToBase64 / base64ToTable', () => {
    it('round-trips a table exactly (float32 has no lossy re-encode)', () => {
        const table = new Float32Array(SINGLE_CYCLE_LENGTH);
        for (let i = 0; i < table.length; i++) table[i] = Math.sin((i / table.length) * 2 * Math.PI * 3);
        const b64 = tableToBase64(table);
        const back = base64ToTable(b64);
        expect(back.length).toBe(table.length);
        for (let i = 0; i < table.length; i++) expect(back[i]).toBeCloseTo(table[i], 6);
    });

    it('produces little-endian bytes — the same layout skald-backend/core/param_utils.odin::decode_custom_wavetable expects', () => {
        const table = new Float32Array([0.5]);
        const b64 = tableToBase64(table);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        expect(bytes.length).toBe(4);
        const view = new DataView(bytes.buffer);
        expect(view.getFloat32(0, true)).toBeCloseTo(0.5, 6);
    });
});
