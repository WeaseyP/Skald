// @vitest-environment jsdom
//
// F-B08-9 (§6.21): the oscilloscope sized its time-domain buffer from
// frequencyBinCount (fftSize/2) instead of fftSize, so the waveform was drawn
// from only the first HALF of the analysis window. getByteTimeDomainData
// fills as many samples as the array holds — a 1024-length array on a
// 2048-fftSize analyser silently returns half the window.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AudioVisualizer } from '../../components/Visualization/AudioVisualizer';

const makeFake2dContext = () => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
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

beforeEach(() => {
    // jsdom has no canvas 2D implementation; the component needs a context or
    // it bails before ever touching the analyser.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        makeFake2dContext() as unknown as CanvasRenderingContext2D
    );
    // One render pass only — the component re-schedules itself via rAF.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('AudioVisualizer — analyser buffer sizing (F-B08-9)', () => {
    it('reads the oscilloscope from fftSize samples (the full window), not frequencyBinCount (half)', () => {
        const analyser = makeFakeAnalyser();
        render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} />);

        expect(analyser.getByteTimeDomainData).toHaveBeenCalledTimes(1);
        const timeArray = analyser.getByteTimeDomainData.mock.calls[0][0] as Uint8Array;
        expect(timeArray).toBeInstanceOf(Uint8Array);
        expect(timeArray.length).toBe(analyser.fftSize); // 2048 — was 1024
    });

    it('still reads the spectrum from frequencyBinCount bins (that one was correct)', () => {
        const analyser = makeFakeAnalyser();
        render(<AudioVisualizer analyser={analyser as unknown as AnalyserNode} />);

        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
        const freqArray = analyser.getByteFrequencyData.mock.calls[0][0] as Uint8Array;
        expect(freqArray.length).toBe(analyser.frequencyBinCount); // 1024
    });
});
