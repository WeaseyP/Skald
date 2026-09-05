// @vitest-environment jsdom
//
// Roadmap E13, the sequencer half.
//
// Two things break the dock on a phone and neither is visible on a desktop:
//
//   1. The transport toolbar is one 40px-tall flex row with a fixed 15px gap
//      and no wrap. At 1920px it has room to spare; at 448px the Key/Scale
//      selects and the Loop button are simply outside the window, with no
//      scrollbar and no overflow — unreachable, not merely cramped.
//
//   2. The step grid scrolls horizontally once the pattern is wider than the
//      dock (stepMetrics' width floor). The playhead does not scroll with it,
//      so on a screen that fits four bars of a sixteen-bar pattern the user
//      watches an empty viewport while the pattern plays somewhere off to the
//      right. Following the playhead is gated on the narrow layout: on the
//      desktop, hijacking a scroll position the user just set by hand would
//      be a regression, and there the whole pattern usually fits anyway.
import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { SequencerToolbar } from '../../components/Sequencer/SequencerToolbar';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';
import { scrollLeftForStep, STEP_WIDTH_DEFAULT } from '../../components/Sequencer/stepMetrics';
import { NARROW_QUERY, COARSE_POINTER_QUERY, __resetMediaQueryCache } from '../../hooks/useViewport';

const installMatchMedia = (matching: Record<string, boolean>) => {
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
        matches: matching[query] ?? false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
    } as unknown as MediaQueryList);
    __resetMediaQueryCache();
};

const track: SequencerTrack = {
    id: 'track-1', name: 'Lead', targetNodeId: 'n1', color: '#007acc',
    isMuted: false, isSolo: false, steps: 64, notes: [],
};

afterEach(() => {
    cleanup();
    __resetMediaQueryCache();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    vi.restoreAllMocks();
});

describe('scrollLeftForStep', () => {
    it('leaves the scroll alone while the step is already on screen', () => {
        expect(scrollLeftForStep(2, 40, 0, 400)).toBeNull();
        // The last fully visible column, at the right edge, still counts.
        expect(scrollLeftForStep(9, 40, 0, 400)).toBeNull();
    });

    it('centres a step that has fallen off the right edge', () => {
        // step 20 starts at 800px; a 400px viewport scrolled to 0 cannot see it.
        expect(scrollLeftForStep(20, 40, 0, 400)).toBe(800 - 200);
    });

    it('centres a step that has fallen off the left edge (a loop wrapping to 0)', () => {
        expect(scrollLeftForStep(0, 40, 800, 400)).toBe(0);
    });

    it('never asks for a negative scroll', () => {
        expect(scrollLeftForStep(1, 40, 600, 400)).toBe(0);
    });

    it('says nothing when the viewport has not been measured yet', () => {
        // clientWidth 0 is "before the first layout", not "nothing fits".
        expect(scrollLeftForStep(20, 40, 0, 0)).toBeNull();
    });
});

describe('the step grid on a narrow screen', () => {
    beforeEach(() => installMatchMedia({ [NARROW_QUERY]: true, [COARSE_POINTER_QUERY]: true }));

    it('scrolls the playhead into view as the pattern plays', () => {
        const { rerender } = render(
            <StepGrid tracks={[track]} currentStep={0} steps={64} onToggleStep={vi.fn()} bpm={120} />,
        );
        const scroller = screen.getByTestId('step-grid-scroll');
        // jsdom has no layout: give the scroller a viewport of its own.
        Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true });

        rerender(<StepGrid tracks={[track]} currentStep={32} steps={64} onToggleStep={vi.fn()} bpm={120} />);
        expect(scroller.scrollLeft).toBe(32 * STEP_WIDTH_DEFAULT - 200);
    });
});

describe('the step grid on the desktop (unchanged)', () => {
    beforeEach(() => installMatchMedia({ [NARROW_QUERY]: false, [COARSE_POINTER_QUERY]: false }));

    it('never moves a scroll position the user set by hand', () => {
        const { rerender } = render(
            <StepGrid tracks={[track]} currentStep={0} steps={64} onToggleStep={vi.fn()} bpm={120} />,
        );
        const scroller = screen.getByTestId('step-grid-scroll');
        Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true });
        scroller.scrollLeft = 120;

        rerender(<StepGrid tracks={[track]} currentStep={32} steps={64} onToggleStep={vi.fn()} bpm={120} />);
        expect(scroller.scrollLeft).toBe(120);
    });
});

describe('the transport toolbar', () => {
    const toolbar = () => (
        <ScaleProvider>
            <SequencerToolbar
                isPlaying={false}
                isBuilding={false}
                bpm={120}
                isLooping={false}
                onPlay={vi.fn()}
                onStop={vi.fn()}
                onBpmChange={vi.fn()}
                patternSteps={16}
                onPatternStepsChange={vi.fn()}
                onLoopToggle={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
            />
        </ScaleProvider>
    );

    it('scrolls its controls into reach on a narrow screen instead of clipping them', () => {
        installMatchMedia({ [NARROW_QUERY]: true });
        render(toolbar());
        expect(screen.getByTestId('transport-toolbar').style.overflowX).toBe('auto');
    });

    it('is the same immovable row it always was on the desktop', () => {
        installMatchMedia({ [NARROW_QUERY]: false });
        render(toolbar());
        const el = screen.getByTestId('transport-toolbar');
        expect(el.style.overflowX).toBe('');
        expect(el.style.gap).toBe('15px');
    });
});
