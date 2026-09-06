/*
================================================================================
| FILE: skald-ui/src/hooks/sequencer/usePlayheadScroll.ts                      |
|                                                                              |
| Roadmap E13: on a phone the dock shows a few bars of a long pattern, and the |
| playhead used to walk off the right edge and keep going - a blank grid for  |
| most of every loop. Only a narrow layout follows it: on the desktop the      |
| pattern usually fits, and moving a scroll position the user just set by     |
| hand would be a regression, not a feature.                                  |
|                                                                              |
| This lived only in StepGrid.tsx until roadmap F1: PianoRoll had no way to    |
| opt in short of copying the effect verbatim, which is exactly the           |
| disagreeing-second-copy class SKB-002 was written to close.                 |
================================================================================
*/
import { RefObject, useEffect } from 'react';
import { scrollLeftForStep } from '../../components/Sequencer/stepMetrics';

/**
 * Scrolls `ref`'s element horizontally so `currentStep` stays on screen,
 * while `enabled` is true. Disabled entirely otherwise — a caller passes its
 * own "narrow viewport" flag so the desktop path never touches scrollLeft.
 */
export const usePlayheadScroll = <T extends HTMLElement>(
    enabled: boolean,
    ref: RefObject<T | null>,
    currentStep: number,
    stepWidth: number,
): void => {
    useEffect(() => {
        if (!enabled) return;
        const el = ref.current;
        if (!el) return;
        const target = scrollLeftForStep(currentStep, stepWidth, el.scrollLeft, el.clientWidth);
        if (target !== null) el.scrollLeft = target;
    }, [enabled, currentStep, stepWidth, ref]);
};
