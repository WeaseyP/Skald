/*
================================================================================
| FILE: skald-ui/src/hooks/sequencer/useStepPaintInteraction.ts                |
|                                                                              |
| The paint/erase pointer gesture: mousedown opens it, the pointer entering    |
| further cells continues it, and any mouseup in the window closes it. This    |
| lived twice — StepGrid's `interactionRef` (paint always adds, right-button   |
| erase always removes) and PianoRoll's `isPainting`/`paintMode` (one button   |
| whose continuing mode is decided by whatever the FIRST cell touched          |
| implied) — each with its own window mouseup listener. `start` takes the      |
| mode explicitly so both policies are expressible without a second machine.   |
================================================================================
*/
import { useCallback, useEffect, useRef } from 'react';

export type PaintMode = 'paint' | 'erase';

export interface UseStepPaintInteractionArgs {
    /**
     * Whether `key` already holds an event. Consulted on every apply — never
     * cached — so a continuing drag only ever adds where nothing was, or
     * removes where something was, which is what lets a paint gesture skip a
     * cell it has already painted and an erase gesture skip one that is
     * already empty.
     */
    hasEventAt: (key: string) => boolean;
    onPaint: (key: string) => void;
    onErase: (key: string) => void;
}

export interface StepPaintInteraction {
    /** Apply once at `key` and keep the gesture open for `continueAt`. */
    start: (mode: PaintMode, key: string) => void;
    /**
     * Apply once, without opening a gesture. B5-x2: a stranded (out-of-range)
     * note can be deleted by a direct click, but a drag must not be allowed
     * to sweep across the disabled boundary and take other cells with it.
     */
    applyOnce: (mode: PaintMode, key: string) => void;
    /**
     * Continue the open gesture onto `key`. A no-op if no gesture is open, or
     * if `key` is the same one the gesture last touched — `hasEventAt` is
     * read from props that may not have re-rendered yet after the previous
     * apply (PianoRoll's `track.notes`, updated only once the parent
     * processes the callback), so re-applying to an unchanged key would
     * otherwise toggle it a second time before the data catches up.
     */
    continueAt: (key: string) => void;
    /** Close the gesture without applying anything to `key`. */
    cancel: () => void;
    /** Whether a gesture is open, optionally narrowed to one mode. */
    isActive: (mode?: PaintMode) => boolean;
}

export const useStepPaintInteraction = ({
    hasEventAt,
    onPaint,
    onErase,
}: UseStepPaintInteractionArgs): StepPaintInteraction => {
    const stateRef = useRef<{ mode: PaintMode; lastKey: string } | null>(null);

    useEffect(() => {
        const handleGlobalMouseUp = () => { stateRef.current = null; };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const apply = useCallback((mode: PaintMode, key: string) => {
        if (mode === 'paint') {
            if (!hasEventAt(key)) onPaint(key);
        } else {
            if (hasEventAt(key)) onErase(key);
        }
    }, [hasEventAt, onPaint, onErase]);

    const start = useCallback((mode: PaintMode, key: string) => {
        stateRef.current = { mode, lastKey: key };
        apply(mode, key);
    }, [apply]);

    const applyOnce = useCallback((mode: PaintMode, key: string) => {
        apply(mode, key);
    }, [apply]);

    const continueAt = useCallback((key: string) => {
        const state = stateRef.current;
        if (!state || state.lastKey === key) return;
        state.lastKey = key;
        apply(state.mode, key);
    }, [apply]);

    const cancel = useCallback(() => { stateRef.current = null; }, []);

    const isActive = useCallback((mode?: PaintMode) =>
        stateRef.current !== null && (mode === undefined || stateRef.current.mode === mode),
    []);

    return { start, applyOnce, continueAt, cancel, isActive };
};
