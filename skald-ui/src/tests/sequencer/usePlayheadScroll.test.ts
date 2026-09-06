// @vitest-environment jsdom
//
// Roadmap F1 — StepGrid's narrow-viewport playhead scroll-follow (E13) lived
// only in StepGrid.tsx, so PianoRoll had no way to opt in without copying the
// effect verbatim (the SKB-002 class this hook closes). Tested directly
// against a bare element rather than through either component, so a future
// third reader (roadmap F1's drum roll) has one thing to trust instead of a
// third copy to audit.
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { usePlayheadScroll } from '../../hooks/sequencer/usePlayheadScroll';

describe('usePlayheadScroll', () => {
    const makeEl = (clientWidth: number, scrollLeft = 0) => {
        const el = document.createElement('div');
        Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
        el.scrollLeft = scrollLeft;
        return el;
    };

    it('scrolls the element to keep an off-screen step in view when enabled', () => {
        const el = makeEl(400);
        const ref = createRef<HTMLDivElement>();
        (ref as { current: HTMLDivElement }).current = el;

        const { rerender } = renderHook(
            ({ step }) => usePlayheadScroll(true, ref, step, 40),
            { initialProps: { step: 0 } },
        );
        rerender({ step: 32 });

        // Same arithmetic as scrollLeftForStep(32, 40, 0, 400): step 32 starts
        // at 1280px, centred in a 400px viewport is 1280 - 200.
        expect(el.scrollLeft).toBe(1080);
    });

    it('never touches scrollLeft when disabled — a desktop caller must not fight a scroll position the user set by hand', () => {
        const el = makeEl(400, 120);
        const ref = createRef<HTMLDivElement>();
        (ref as { current: HTMLDivElement }).current = el;

        const { rerender } = renderHook(
            ({ step }) => usePlayheadScroll(false, ref, step, 40),
            { initialProps: { step: 0 } },
        );
        rerender({ step: 32 });

        expect(el.scrollLeft).toBe(120);
    });

    it('leaves the scroll alone while the step is already visible', () => {
        const el = makeEl(400);
        el.scrollLeft = 800;
        const ref = createRef<HTMLDivElement>();
        (ref as { current: HTMLDivElement }).current = el;

        const { rerender } = renderHook(
            ({ step }) => usePlayheadScroll(true, ref, step, 40),
            { initialProps: { step: 20 } },
        );
        rerender({ step: 21 }); // step 21 spans 840..880, inside [800, 1200)

        expect(el.scrollLeft).toBe(800);
    });

    it('does nothing when the ref has no element yet', () => {
        const ref = createRef<HTMLDivElement>();
        expect(() => {
            renderHook(() => usePlayheadScroll(true, ref, 5, 40));
        }).not.toThrow();
    });
});
