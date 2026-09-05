/*
================================================================================
| FILE: skald-ui/src/utils/spectrogram.ts                                     |
|                                                                              |
| Pure helpers for AudioVisualizer's spectrogram mode (roadmap 9.4 item 3),   |
| kept out of the component so the three things a scrolling waterfall gets    |
| wrong can be pinned without mocking a canvas: the ring-buffer column index  |
| must wrap instead of growing without bound, the row->bin lookup must read   |
| a LOG frequency axis (a linear one buries the whole musical range in the    |
| bottom few pixels), and the colour map must be a fixed table, not a         |
| `rgb(...)` string built fresh for every one of the ~30,000 cells/second a   |
| 300x100 spectrogram repaints at 60 fps (SKB-053's per-sample worklet        |
| allocation bug, one level up).                                             |
================================================================================
*/

/** Ring-buffer column index for a scrolling waterfall: advances by one column
 *  per frame and wraps back to 0 rather than growing without bound — the
 *  newest column overwrites the oldest at the left edge once a full width has
 *  been drawn. `width <= 0` returns 0 rather than dividing by zero (a
 *  visualizer collapsed to nothing is not a crash). */
export const nextSpectrogramColumn = (current: number, width: number): number =>
    (width <= 0 ? 0 : (current + 1) % width);

/** Row -> FFT bin lookup for a log-frequency vertical axis, computed once per
 *  (height, freqBinCount, sampleRate) rather than once per frame. Row 0 is
 *  the TOP of the canvas (`sampleRate/2`, the Nyquist ceiling); the last row
 *  is the bottom (`minFreq`) — the conventional reading direction for a
 *  frequency axis, high at top. A linear mapping (row/height * freqBinCount)
 *  would spend most of its vertical pixels on frequencies above 10 kHz and
 *  compress the entire musical range — where basically everything a sound
 *  designer is patching actually lives — into a sliver near the bottom. */
export const binsForLogFrequencyRows = (
    height: number,
    freqBinCount: number,
    sampleRate: number,
    minFreq = 20,
): Int32Array => {
    const rowCount = Math.max(0, Math.floor(height));
    const bins = new Int32Array(rowCount);
    if (rowCount === 0 || freqBinCount <= 0) return bins;
    const maxFreq = sampleRate / 2;
    const binWidth = maxFreq / freqBinCount;
    for (let y = 0; y < rowCount; y++) {
        const frac = rowCount <= 1 ? 0 : y / (rowCount - 1);
        // y=0 -> maxFreq, y=rowCount-1 -> minFreq, geometric (log) interpolation.
        const freq = maxFreq * Math.pow(minFreq / maxFreq, frac);
        const bin = Math.round(freq / binWidth);
        bins[y] = Math.min(freqBinCount - 1, Math.max(0, bin));
    }
    return bins;
};

/** A fixed 256-entry black -> blue -> teal -> yellow -> red heat palette for
 *  an amplitude byte (0-255, as returned by `getByteFrequencyData`). Built
 *  once at module load — see the file comment on why a per-cell template
 *  string is the cost worth avoiding here. */
const PALETTE_STOPS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0],
    [20, 20, 120],
    [0, 160, 160],
    [230, 230, 0],
    [255, 30, 0],
];

const buildPalette = (): string[] => {
    const segments = PALETTE_STOPS.length - 1;
    const palette: string[] = new Array(256);
    for (let v = 0; v < 256; v++) {
        const t = (v / 255) * segments;
        const seg = Math.min(segments - 1, Math.floor(t));
        const localT = t - seg;
        const [r0, g0, b0] = PALETTE_STOPS[seg];
        const [r1, g1, b1] = PALETTE_STOPS[seg + 1];
        const r = Math.round(r0 + (r1 - r0) * localT);
        const g = Math.round(g0 + (g1 - g0) * localT);
        const b = Math.round(b0 + (b1 - b0) * localT);
        palette[v] = `rgb(${r},${g},${b})`;
    }
    return palette;
};

export const SPECTROGRAM_PALETTE: readonly string[] = buildPalette();
