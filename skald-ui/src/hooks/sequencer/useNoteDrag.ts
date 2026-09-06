/*
================================================================================
| FILE: skald-ui/src/hooks/sequencer/useNoteDrag.ts                            |
|                                                                              |
| The grab -> preview -> commit-on-mouseup drag for a note's own fields. Lived |
| twice: StepGrid's `dragState` (duration/velocity/probability, chosen by      |
| which modifier key is held) and PianoRoll's `resizeDrag` (duration only, via |
| a corner handle, cancellable with Escape). Both moved on mousemove, both     |
| committed exactly once on mouseup — never on every intermediate move — which |
| is what makes a drag of any length one undo entry upstream                   |
| (useSequencerState.ts::updateNote's pushHistory gesture key). `valueFor`     |
| carries the one real difference (which axis maps to which field, and how)   |
| as a prop rather than a second copy of the state machine around it.         |
================================================================================
*/
import { useCallback, useEffect, useState } from 'react';

export interface NoteDragConfig<Field extends string> {
    trackId: string;
    step: number;
    /** Which chord member was grabbed — without it a commit could land on
     * whichever member happens to sort first (SKB-025). */
    notePitch: number;
    field: Field;
    initialValue: number;
    startX: number;
    startY: number;
}

export interface NoteDragState<Field extends string> extends NoteDragConfig<Field> {
    currentValue: number;
}

export interface UseNoteDragArgs<Field extends string> {
    /**
     * Turns a mouse delta since grab into a new value for `field`, already
     * clamped to whatever range that field allows. StepGrid's three axes and
     * PianoRoll's single fixed-duration handle are both just this function.
     */
    valueFor: (field: Field, initialValue: number, deltaX: number, deltaY: number) => number;
    /** Fires exactly once, on mouseup, with the drag's final value. */
    onCommit: (trackId: string, step: number, field: Field, value: number, notePitch: number) => void;
    /**
     * PianoRoll's resize handle cancels on Escape (E2) and drops the state
     * without ever calling onCommit. StepGrid's modifier-drag never grew
     * that behaviour, so it stays opt-in rather than becoming a silent new
     * feature of the shared hook.
     */
    cancelOnEscape?: boolean;
}

export interface NoteDragApi<Field extends string> {
    /** The in-progress drag, or null between drags. */
    state: NoteDragState<Field> | null;
    /** Grab a note's field and open the preview. */
    start: (config: NoteDragConfig<Field>) => void;
}

export const useNoteDrag = <Field extends string>({
    valueFor,
    onCommit,
    cancelOnEscape = false,
}: UseNoteDragArgs<Field>): NoteDragApi<Field> => {
    const [state, setState] = useState<NoteDragState<Field> | null>(null);

    const start = useCallback((config: NoteDragConfig<Field>) => {
        setState({ ...config, currentValue: config.initialValue });
    }, []);

    // Dependency is `state !== null`, not `state` — the effect only needs to
    // (re)subscribe when a drag opens or closes, not on every pixel of
    // movement; keying on the object itself would tear the listeners down
    // and rebuild them on each mousemove.
    useEffect(() => {
        if (!state) return;

        const handleMove = (e: MouseEvent) => {
            setState(prev => {
                if (!prev) return prev;
                const value = valueFor(prev.field, prev.initialValue, e.clientX - prev.startX, prev.startY - e.clientY);
                return { ...prev, currentValue: value };
            });
        };

        const handleUp = () => {
            setState(prev => {
                if (prev) onCommit(prev.trackId, prev.step, prev.field, prev.currentValue, prev.notePitch);
                return null;
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (cancelOnEscape && e.key === 'Escape') setState(null);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        if (cancelOnEscape) window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            if (cancelOnEscape) window.removeEventListener('keydown', handleKeyDown);
        };
    }, [state !== null, onCommit, valueFor, cancelOnEscape]);

    return { state, start };
};
