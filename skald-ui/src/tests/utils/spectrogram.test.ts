// E9 (roadmap 0.2 §9.4 item 3) — the spectrogram mode's pure helpers, tested
// without a canvas: the ring-buffer column index, the log-frequency row->bin
// lookup, and the fixed colour palette.
import { describe, it, expect } from 'vitest';
import { binsForLogFrequencyRows, nextSpectrogramColumn, SPECTROGRAM_PALETTE } from '../../utils/spectrogram';

describe('nextSpectrogramColumn', () => {
    it('advances by one column per frame', () => {
        expect(nextSpectrogramColumn(0, 4)).toBe(1);
        expect(nextSpectrogramColumn(1, 4)).toBe(2);
        expect(nextSpectrogramColumn(2, 4)).toBe(3);
    });

    it('wraps back to 0 instead of growing past the canvas width', () => {
        expect(nextSpectrogramColumn(3, 4)).toBe(0);
    });

    it('never divides by zero for a collapsed (0-width) canvas', () => {
        expect(nextSpectrogramColumn(0, 0)).toBe(0);
    });
});

describe('binsForLogFrequencyRows', () => {
    it('returns one bin index per row', () => {
        const bins = binsForLogFrequencyRows(100, 1024, 48000);
        expect(bins.length).toBe(100);
    });

    it('puts the highest frequency (Nyquist) at row 0, the top of the canvas', () => {
        const bins = binsForLogFrequencyRows(100, 1024, 48000);
        // sampleRate/2 = 24000 Hz, binWidth = 24000/1024 ~= 23.44 Hz/bin — the
        // top row should land on (or within one bin of) the last bin.
        expect(bins[0]).toBeGreaterThanOrEqual(1022);
    });

    it('puts the lowest frequency near the bottom row, not spread across the whole axis', () => {
        const bins = binsForLogFrequencyRows(100, 1024, 48000, 20);
        // 20 Hz / 23.44 Hz-per-bin ~= bin 0 or 1 — nowhere near the top bins a
        // LINEAR mapping would have put it (row*10 or so).
        expect(bins[99]).toBeLessThanOrEqual(2);
    });

    it('is monotonically non-increasing top to bottom (log axis, not scrambled)', () => {
        const bins = binsForLogFrequencyRows(50, 1024, 48000);
        for (let y = 1; y < bins.length; y++) {
            expect(bins[y]).toBeLessThanOrEqual(bins[y - 1]);
        }
    });

    it('is empty for a zero-height canvas, not a crash', () => {
        expect(binsForLogFrequencyRows(0, 1024, 48000).length).toBe(0);
    });
});

describe('SPECTROGRAM_PALETTE', () => {
    it('has exactly 256 entries, one per byte value', () => {
        expect(SPECTROGRAM_PALETTE.length).toBe(256);
    });

    it('is black at silence and a hot colour at full scale', () => {
        expect(SPECTROGRAM_PALETTE[0]).toBe('rgb(0,0,0)');
        expect(SPECTROGRAM_PALETTE[255]).toBe('rgb(255,30,0)');
    });

    it('every entry is a valid rgb(...) string usable as a canvas fillStyle', () => {
        for (const entry of SPECTROGRAM_PALETTE) {
            expect(entry).toMatch(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/);
        }
    });
});
