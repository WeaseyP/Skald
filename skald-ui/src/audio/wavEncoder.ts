/*
================================================================================
| FILE: skald-ui/src/audio/wavEncoder.ts                                       |
|                                                                              |
| Dependency-free 24-bit PCM stereo RIFF/WAVE writer (roadmap G1, §9.12).      |
|                                                                              |
| Chunk layout is skald-backend/acceptance/wav.odin::write_wav16's, field for  |
| field — canonical 44-byte header, `RIFF`/`WAVE`/`fmt `/`data`, format tag 1  |
| (uncompressed PCM), two channels — widened from 16 to 24 bits per sample.    |
| The Odin writer is native-only (it is how acceptance dumps rendered audio    |
| to disk) and cannot run in the renderer, so the bounce needs its own; what   |
| it must NOT have is its own idea of what a Skald WAV looks like.             |
|                                                                              |
| Nothing here touches the DSP. Everything the bounce hears — master volume,   |
| the DC blocker, the soft limiter — happened inside skald_process before the  |
| samples reached this file (see audio/offlineRender.ts). This is a container  |
| format, not a mix stage, and adding any gain or dither here would be a       |
| second mixdown the export does not have.                                     |
================================================================================
*/

/** Canonical PCM header size: RIFF(12) + fmt (24) + data(8). */
export const WAV_HEADER_BYTES = 44;

/** Channel count and sample width, in the two places the header states them. */
const CHANNELS = 2;
const BITS_PER_SAMPLE = 24;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const BLOCK_ALIGN = CHANNELS * BYTES_PER_SAMPLE;

/** Largest positive value a 24-bit two's-complement sample can hold. */
const FULL_SCALE = 8388607;

/**
 * Float sample to a 24-bit two's-complement integer, clamped.
 *
 * The clamp is not politeness. `skald_soft_limit` keeps the mix inside ±1 in
 * every ordinary case, but a bounce is also the first place a user sees what
 * a pathological patch actually produced — and an out-of-range float that is
 * merely truncated to 24 bits WRAPS: +1.5 becomes a full-scale negative
 * spike, an audible click that looks like a synthesis bug rather than a
 * writer bug. A non-finite sample (the case E5's flush counter exists for)
 * becomes silence for the same reason: `NaN | 0` is 0 in JS only by accident
 * of the operator, and relying on that is how a NaN turns into whatever the
 * next author's arithmetic happens to yield.
 */
const toPcm24 = (x: number): number => {
    if (!Number.isFinite(x)) return 0;
    const clamped = x > 1 ? 1 : x < -1 ? -1 : x;
    const scaled = Math.round(clamped * FULL_SCALE);
    return scaled < -FULL_SCALE - 1 ? -FULL_SCALE - 1 : scaled;
};

const putAscii = (out: Uint8Array, offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
};

/**
 * Encode two equal-length float channels as a 24-bit PCM stereo WAV file.
 *
 * Returns the whole file as bytes; the caller decides where it lands (the
 * Electron `save-wav` channel writes it atomically, the web shim downloads
 * it). Throws when the channels disagree in length rather than emitting a
 * file whose stereo image silently drifts apart partway through.
 */
export const encodeWav24 = (
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
): Uint8Array => {
    if (left.length !== right.length) {
        throw new Error(
            `encodeWav24: channel length mismatch (left ${left.length}, right ${right.length})`,
        );
    }
    const frames = left.length;
    const dataBytes = frames * BLOCK_ALIGN;
    const out = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
    const view = new DataView(out.buffer);

    putAscii(out, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    putAscii(out, 8, 'WAVE');
    putAscii(out, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, CHANNELS, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * BLOCK_ALIGN, true);
    view.setUint16(32, BLOCK_ALIGN, true);
    view.setUint16(34, BITS_PER_SAMPLE, true);
    putAscii(out, 36, 'data');
    view.setUint32(40, dataBytes, true);

    let off = WAV_HEADER_BYTES;
    for (let i = 0; i < frames; i++) {
        const l = toPcm24(left[i]);
        const r = toPcm24(right[i]);
        out[off] = l & 0xff;
        out[off + 1] = (l >> 8) & 0xff;
        out[off + 2] = (l >> 16) & 0xff;
        out[off + 3] = r & 0xff;
        out[off + 4] = (r >> 8) & 0xff;
        out[off + 5] = (r >> 16) & 0xff;
        off += BLOCK_ALIGN;
    }
    return out;
};
