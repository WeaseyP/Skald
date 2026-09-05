// @vitest-environment jsdom
//
// F-B08-9 (§6.21): the oscilloscope sized its time-domain buffer from
// frequencyBinCount (fftSize/2) instead of fftSize, so the waveform was drawn
// from only the first HALF of the analysis window. getByteTimeDomainData
// fills as many samples as the array holds — a 1024-length array on a
// 2048-fftSize analyser silently returns half the window.
//
// E9 (roadmap 0.2 §9.4 item 3): the visualizer expansion. A `mode` prop now
// selects one of oscilloscope / spectrum / spectrogram / correlation (single
// select, replacing the old `showSpectrum`/`showOscilloscope` pair — the
// point of a mode SELECTOR is that exactly one view is showing), plus the
// selector row itself and the two new modes.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AudioVisualizer } from '../../components/Visualization/AudioVisualizer';

const makeFake2dContext = () => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
});

const makeFakeAnalyser = () => ({
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
});

const makeFakeStereoAnalyser = (fftSize = 512) => ({
    fftSize,
    getFloatTimeDomainData: vi.fn(),
});

let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeEach(() => {
    // jsdom has no canvas 2D implementation; the component needs a context or
    // it bails before ever touching the analyser.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        makeFake2dContext() as unknown as CanvasRenderingContext2D
    );
    rafCallback = null;
    rafId = 0;
    // Captures the callback instead of auto-invoking it, so a test can drive
    // the render loop frame-by-frame (needed for the spectrogram wrap test)
    // while every other test still gets exactly one paint from the initial
    // synchronous call inside the effect.
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
        rafCallback = cb;
        return ++rafId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('AudioVisualizer — analyser buffer sizing (F-B08-9)', () => {
    it('reads the oscilloscope from fftSize samples (the full window), not frequencyBinCount (half)', () => {
        const analyser = makeFakeAnalyser();
        render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="oscilloscope" />);

        expect(analyser.getByteTimeDomainData).toHaveBeenCalledTimes(1);
        const timeArray = analyser.getByteTimeDomainData.mock.calls[0][0] as Uint8Array;
        expect(timeArray).toBeInstanceOf(Uint8Array);
        expect(timeArray.length).toBe(analyser.fftSize); // 2048 — was 1024
    });

    it('reads the spectrum from frequencyBinCount bins', () => {
        const analyser = makeFakeAnalyser();
        render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="spectrum" />);

        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
        const freqArray = analyser.getByteFrequencyData.mock.calls[0][0] as Uint8Array;
        expect(freqArray.length).toBe(analyser.frequencyBinCount); // 1024
    });
});

describe('AudioVisualizer — mode selector', () => {
    it('renders one button per mode, marking the active one', () => {
        const analyser = makeFakeAnalyser();
        const { getByTestId } = render(
            <AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="spectrum" onModeChange={vi.fn()} />
        );
        expect(getByTestId('visualizer-mode-oscilloscope')).toBeTruthy();
        expect(getByTestId('visualizer-mode-spectrum').getAttribute('aria-pressed')).toBe('true');
        expect(getByTestId('visualizer-mode-spectrogram').getAttribute('aria-pressed')).toBe('false');
        expect(getByTestId('visualizer-mode-correlation')).toBeTruthy();
    });

    it('clicking a mode button reports that mode, not the currently active one', () => {
        const analyser = makeFakeAnalyser();
        const onModeChange = vi.fn();
        const { getByTestId } = render(
            <AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="oscilloscope" onModeChange={onModeChange} />
        );
        fireEvent.click(getByTestId('visualizer-mode-spectrogram'));
        expect(onModeChange).toHaveBeenCalledWith('spectrogram');
    });

    it('switching the mode prop switches which analyser method the render loop calls', () => {
        const analyser = makeFakeAnalyser();
        const { rerender } = render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="oscilloscope" />);
        expect(analyser.getByteTimeDomainData).toHaveBeenCalledTimes(1);
        expect(analyser.getByteFrequencyData).not.toHaveBeenCalled();

        rerender(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="spectrum" />);
        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
    });
});

describe('AudioVisualizer — spectrogram mode', () => {
    it('advances one column per frame and wraps back to the left edge', () => {
        const analyser = makeFakeAnalyser();
        const ctx = makeFake2dContext();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

        render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="spectrogram" width={4} height={2} />);

        // Frame 1 painted synchronously inside the effect; the column-drawing
        // fillRect calls all share the same x argument for one frame (one
        // call per row, `height` rows).
        const columnXOf = (frameFillRectCalls: unknown[][]) => (frameFillRectCalls[0] as unknown as [number, number])[0];
        const callsBefore = ctx.fillRect.mock.calls.length;
        const firstColumnCalls = ctx.fillRect.mock.calls.slice(callsBefore - 2); // height=2 rows
        const firstX = columnXOf(firstColumnCalls);

        // Advance four more frames (width=4): columns 1, 2, 3, then the 5th
        // column drawn overall wraps back to x=0.
        for (let i = 0; i < 4; i++) {
            expect(rafCallback).not.toBeNull();
            (rafCallback as FrameRequestCallback)(performance.now());
        }

        const allCalls = ctx.fillRect.mock.calls;
        const secondColumnX = allCalls[callsBefore][0];
        const wrappedColumnX = allCalls[allCalls.length - 2][0];

        expect(secondColumnX).toBe(firstX + 1);
        expect(wrappedColumnX).toBe(0); // wrapped after 4 columns on a width=4 canvas
    });
});

describe('AudioVisualizer — correlation mode', () => {
    it('reads both stereo channels into preallocated buffers, not a fresh allocation per frame', () => {
        const analyser = makeFakeAnalyser();
        const left = makeFakeStereoAnalyser();
        const right = makeFakeStereoAnalyser();
        render(
            <AudioVisualizer
                analyser={analyser as unknown as AnalyserNode}
                stereoAnalysers={{ left: left as unknown as AnalyserNode, right: right as unknown as AnalyserNode }}
                mode="correlation"
            />
        );
        expect(left.getFloatTimeDomainData).toHaveBeenCalledTimes(1);
        expect(right.getFloatTimeDomainData).toHaveBeenCalledTimes(1);
        const lBuf = left.getFloatTimeDomainData.mock.calls[0][0] as Float32Array;
        expect(lBuf).toBeInstanceOf(Float32Array);
        expect(lBuf.length).toBe(left.fftSize);
    });

    it('does not touch stereo analysers when none are supplied (no stereo tap wired up)', () => {
        const analyser = makeFakeAnalyser();
        expect(() =>
            render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} stereoAnalysers={null} mode="correlation" />)
        ).not.toThrow();
    });
});

describe('AudioVisualizer — animation loop lifecycle', () => {
    it('cancels its rAF loop on unmount', () => {
        const analyser = makeFakeAnalyser();
        const { unmount } = render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} mode="oscilloscope" />);
        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(rafId);
    });
});
