// @vitest-environment jsdom
//
// Roadmap packet B10 — stereo peak-hold meter with clip LED. Two traps the
// roadmap names are pinned here: the meter must read getFloatTimeDomainData
// (the byte variant is 8-bit and cannot represent anything above 0 dBFS, so a
// clip LED driven by it could never light), and it must read TWO analysers —
// a single AnalyserNode downmixes to mono and would hide a one-sided over.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PeakMeter } from '../../components/Visualization/PeakMeter';

const fakeAnalyser = (samples: number[]) => ({
    fftSize: samples.length,
    getFloatTimeDomainData: vi.fn((out: Float32Array) => { out.set(samples); }),
    getByteTimeDomainData: vi.fn(),
});

beforeEach(() => {
    // One tick only: the component reads once on mount and re-schedules via rAF.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('PeakMeter reads float samples from both channels', () => {
    it('uses getFloatTimeDomainData on each analyser and never the byte variant', () => {
        const left = fakeAnalyser([0.5, -0.25]);
        const right = fakeAnalyser([0.1]);
        render(<PeakMeter analysers={{ left: left as unknown as AnalyserNode, right: right as unknown as AnalyserNode }} />);
        expect(left.getFloatTimeDomainData).toHaveBeenCalled();
        expect(right.getFloatTimeDomainData).toHaveBeenCalled();
        expect(left.getByteTimeDomainData).not.toHaveBeenCalled();
        expect(right.getByteTimeDomainData).not.toHaveBeenCalled();
    });

    it('reports each channel independently — a right-only over lights the LED', () => {
        const left = fakeAnalyser([0.5]);
        const right = fakeAnalyser([0.2, 1.2, -0.4]);
        render(<PeakMeter analysers={{ left: left as unknown as AnalyserNode, right: right as unknown as AnalyserNode }} />);
        expect(screen.getByTestId('peak-meter-left').getAttribute('data-peak-db')).toBe('-6.0');
        expect(screen.getByTestId('peak-meter-right').getAttribute('data-peak-db')).toBe('1.6');
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('true');
    });

    it('does not light the LED below full scale', () => {
        const left = fakeAnalyser([0.99]);
        const right = fakeAnalyser([-0.99]);
        render(<PeakMeter analysers={{ left: left as unknown as AnalyserNode, right: right as unknown as AnalyserNode }} />);
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('false');
    });
});

describe('the clip LED latches until clicked', () => {
    it('stays lit after the over has passed and clears on click', () => {
        let samples = [1.5];
        const analyser = {
            fftSize: 1,
            getFloatTimeDomainData: vi.fn((out: Float32Array) => { out.set(samples); }),
            getByteTimeDomainData: vi.fn(),
        };
        // Capture the rAF callback so a second frame can be driven by hand.
        let frame: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frame = cb; return 1; }));
        render(<PeakMeter analysers={{ left: analyser as unknown as AnalyserNode, right: analyser as unknown as AnalyserNode }} />);
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('true');

        samples = [0.1];
        expect(frame).not.toBeNull();
        frame!(16);
        // The over is gone from the signal; the latch is not.
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('true');

        fireEvent.click(screen.getByTestId('clip-led'));
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('false');
    });
});

describe('with no analysers (stopped)', () => {
    it('renders an idle meter and does not throw', () => {
        render(<PeakMeter analysers={null} />);
        expect(screen.getByTestId('peak-meter-left').getAttribute('data-peak-db')).toBe('-inf');
        expect(screen.getByTestId('clip-led').getAttribute('data-lit')).toBe('false');
    });
});

// Roadmap E5 (§9.9) — the DC-blocker/limiter's non-finite (NaN/Inf) flush
// count reaches here on `analysers.nonfiniteCounts`, a ref mutated in place
// by useWasmAudioEngine's worklet message handler (see meter.ts). Polled the
// same rAF tick the bars/hold already use — no separate subscription.
describe('the non-finite flush warning (roadmap E5)', () => {
    const withCounts = (total: number, perAsset: number[] = [total]) => {
        const left = fakeAnalyser([0.1]);
        const right = fakeAnalyser([0.1]);
        return {
            left: left as unknown as AnalyserNode,
            right: right as unknown as AnalyserNode,
            nonfiniteCounts: { current: { total, perAsset } },
        };
    };

    it('does not render when analysers carries no nonfiniteCounts at all', () => {
        const left = fakeAnalyser([0.1]);
        const right = fakeAnalyser([0.1]);
        render(<PeakMeter analysers={{ left: left as unknown as AnalyserNode, right: right as unknown as AnalyserNode }} />);
        expect(screen.queryByTestId('nonfinite-warning')).toBeNull();
    });

    it('does not render while the count is zero', () => {
        render(<PeakMeter analysers={withCounts(0, [])} />);
        expect(screen.queryByTestId('nonfinite-warning')).toBeNull();
    });

    it('renders the count once it is nonzero', () => {
        render(<PeakMeter analysers={withCounts(3, [3])} />);
        expect(screen.getByTestId('nonfinite-warning').textContent).toContain('3');
    });

    it('picks up a live change to the ref between animation frames, without a fresh render() call', () => {
        let frame: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frame = cb; return 1; }));
        const analysers = withCounts(0, []);
        render(<PeakMeter analysers={analysers} />);
        expect(screen.queryByTestId('nonfinite-warning')).toBeNull();

        // The worklet message handler mutates the SAME object in place —
        // nothing here re-renders the component.
        analysers.nonfiniteCounts.current = { total: 2, perAsset: [2] };
        expect(frame).not.toBeNull();
        act(() => { frame!(16); });

        expect(screen.getByTestId('nonfinite-warning').textContent).toContain('2');
    });

    it('clears when playback stops (analysers becomes null)', () => {
        const { rerender } = render(<PeakMeter analysers={withCounts(4, [4])} />);
        expect(screen.getByTestId('nonfinite-warning')).toBeTruthy();

        rerender(<PeakMeter analysers={null} />);
        expect(screen.queryByTestId('nonfinite-warning')).toBeNull();
    });
});
