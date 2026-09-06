// Roadmap G1 (§9.12 item 1) — the 24-bit PCM writer the offline bounce ends in.
//
// A WAV header is four numbers that must agree with each other (byte rate,
// block align, the RIFF size, the data size) and one that must agree with the
// payload (bits per sample). Get any of them wrong and the file still "exists"
// — every player just reads it as noise, silence, or half speed, which is
// exactly the kind of defect that survives a green suite. So the gate here is
// a real decode: parse the bytes back out of the produced file the way a
// player would, and compare against what went in.
//
// Layout mirrors skald-backend/acceptance/wav.odin::write_wav16 chunk for
// chunk (RIFF / WAVE / fmt  / data, canonical 44-byte header, PCM format 1),
// widened from 16 to 24 bits. That file is the repo's existing reference for
// "what a Skald WAV looks like"; a second, differently-shaped header would be
// a second answer to a settled question.
import { describe, it, expect } from 'vitest';
import { encodeWav24, WAV_HEADER_BYTES } from '../../audio/wavEncoder';

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

const u32 = (bytes: Uint8Array, offset: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

const u16 = (bytes: Uint8Array, offset: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

/** Read frame `i`'s two channels back as floats, the way a player would. */
const decodeFrame = (bytes: Uint8Array, i: number): { l: number; r: number } => {
    const at = (off: number): number => {
        // 24-bit little-endian two's complement: sign-extend the top byte.
        const raw = bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
        const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
        return signed / 8388607;
    };
    const base = WAV_HEADER_BYTES + i * 6;
    return { l: at(base), r: at(base + 3) };
};

describe('encodeWav24 — header', () => {
    it('produces a canonical 44-byte PCM header whose five size fields agree with the payload', () => {
        const frames = 100;
        const wav = encodeWav24(new Float32Array(frames), new Float32Array(frames), 48000);

        expect(wav.length).toBe(WAV_HEADER_BYTES + frames * 6);
        expect(ascii(wav, 0, 4)).toBe('RIFF');
        // "everything after the first 8 bytes"
        expect(u32(wav, 4)).toBe(wav.length - 8);
        expect(ascii(wav, 8, 4)).toBe('WAVE');
        expect(ascii(wav, 12, 4)).toBe('fmt ');
        expect(u32(wav, 16)).toBe(16); // PCM fmt chunk size
        expect(u16(wav, 20)).toBe(1); // format tag: PCM
        expect(u16(wav, 22)).toBe(2); // stereo
        expect(u32(wav, 24)).toBe(48000);
        expect(u32(wav, 28)).toBe(48000 * 6); // byte rate = rate x channels x bytes
        expect(u16(wav, 32)).toBe(6); // block align = channels x bytes
        expect(u16(wav, 34)).toBe(24); // bits per sample — the whole point of G1
        expect(ascii(wav, 36, 4)).toBe('data');
        expect(u32(wav, 40)).toBe(frames * 6);
    });

    it('carries the sample rate it was handed, not a hardcoded 48k', () => {
        const wav = encodeWav24(new Float32Array(4), new Float32Array(4), 44100);
        expect(u32(wav, 24)).toBe(44100);
        expect(u32(wav, 28)).toBe(44100 * 6);
    });

    it('an empty render is still a valid (silent) file, not a truncated one', () => {
        const wav = encodeWav24(new Float32Array(0), new Float32Array(0), 48000);
        expect(wav.length).toBe(WAV_HEADER_BYTES);
        expect(u32(wav, 40)).toBe(0);
        expect(u32(wav, 4)).toBe(WAV_HEADER_BYTES - 8);
    });

    it('refuses channels of different lengths rather than emitting a file whose stereo image drifts', () => {
        expect(() => encodeWav24(new Float32Array(8), new Float32Array(9), 48000)).toThrow(/length/i);
    });
});

describe('encodeWav24 — samples', () => {
    it('round-trips each channel to within one 24-bit step, and keeps left and right distinct', () => {
        const left = new Float32Array([0, 0.5, -0.5, 0.25, 1, -1]);
        const right = new Float32Array([1, -0.25, 0.125, -0.75, 0, 0.3333]);
        const wav = encodeWav24(left, right, 48000);

        const step = 1 / 8388607;
        for (let i = 0; i < left.length; i++) {
            const got = decodeFrame(wav, i);
            expect(Math.abs(got.l - left[i])).toBeLessThanOrEqual(step);
            expect(Math.abs(got.r - right[i])).toBeLessThanOrEqual(step);
        }
    });

    it('clamps out-of-range and non-finite samples instead of wrapping them into the opposite polarity', () => {
        // A sample above +1 that wraps rather than clamps reads back as a
        // full-scale NEGATIVE spike — an audible click in an otherwise clean
        // bounce, and the classic integer-overflow failure of a naive writer.
        const left = new Float32Array([2, -2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
        const right = new Float32Array([-2, 2, 0, 0, 0]);
        const wav = encodeWav24(left, right, 48000);

        expect(decodeFrame(wav, 0).l).toBeCloseTo(1, 5);
        expect(decodeFrame(wav, 1).l).toBeCloseTo(-1, 5);
        // Non-finite becomes SILENCE, not full scale: that is what E5's
        // DC-blocker/limiter backstop already does with a NaN/Inf sample on
        // the live bus, and clamping an infinity to +1 here would invent a
        // full-scale click the preview of the same patch never made.
        expect(decodeFrame(wav, 2).l).toBe(0);
        expect(decodeFrame(wav, 3).l).toBe(0);
        expect(decodeFrame(wav, 4).l).toBe(0);
        expect(decodeFrame(wav, 0).r).toBeCloseTo(-1, 5);
    });

    it('writes the low byte first (little-endian), which is what makes the file readable at all', () => {
        // 0.5 -> round(0.5 * 8388607) = 4194304 = 0x400000: low byte 0x00,
        // mid 0x00, high 0x40. A big-endian writer would put 0x40 first.
        const wav = encodeWav24(new Float32Array([0.5]), new Float32Array([0]), 48000);
        expect(wav[WAV_HEADER_BYTES]).toBe(0x00);
        expect(wav[WAV_HEADER_BYTES + 1]).toBe(0x00);
        expect(wav[WAV_HEADER_BYTES + 2]).toBe(0x40);
    });
});
