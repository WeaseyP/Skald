// @vitest-environment jsdom
//
// Roadmap F1 — StepGrid's paint/erase pointer state machine (a ref plus a
// window mouseup listener) and PianoRoll's add/remove drag (its own ref, its
// own window mouseup listener) are the same shape wearing two names: a
// gesture opens on mousedown, continues over whatever cell the pointer
// enters next, and closes on the next mouseup anywhere in the window. The
// one real difference is which mode a continuing drag applies — StepGrid's
// erase gesture always removes, its paint gesture always adds; PianoRoll's
// single left-drag picks whichever of those the FIRST cell it touched
// implied and then keeps doing that one thing. `start` takes the mode
// explicitly so both callers can express their own policy without a second
// state machine.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useStepPaintInteraction } from '../../hooks/sequencer/useStepPaintInteraction';

describe('useStepPaintInteraction', () => {
    afterEach(() => cleanup());

    const harness = (initialKeys: string[] = []) => {
        const present = new Set(initialKeys);
        const onPaint = vi.fn((key: string) => present.add(key));
        const onErase = vi.fn((key: string) => present.delete(key));
        const { result } = renderHook(() => useStepPaintInteraction({
            hasEventAt: (key: string) => present.has(key),
            onPaint,
            onErase,
        }));
        return { result, present, onPaint, onErase };
    };

    it('a paint gesture adds to an empty cell and opens for continuation', () => {
        const { result, onPaint } = harness();
        result.current.start('paint', 'a');
        expect(onPaint).toHaveBeenCalledWith('a');
        expect(result.current.isActive('paint')).toBe(true);
    });

    it('a paint gesture does nothing to a cell that already has an event', () => {
        const { result, onPaint } = harness(['a']);
        result.current.start('paint', 'a');
        expect(onPaint).not.toHaveBeenCalled();
    });

    it('an erase gesture removes from an occupied cell and opens for continuation', () => {
        const { result, onErase } = harness(['a']);
        result.current.start('erase', 'a');
        expect(onErase).toHaveBeenCalledWith('a');
        expect(result.current.isActive('erase')).toBe(true);
    });

    it('an erase gesture does nothing to an empty cell', () => {
        const { result, onErase } = harness();
        result.current.start('erase', 'a');
        expect(onErase).not.toHaveBeenCalled();
    });

    it('continuing a paint gesture onto other cells paints each empty one', () => {
        const { result, onPaint } = harness();
        result.current.start('paint', 'a');
        result.current.continueAt('b');
        result.current.continueAt('c');
        expect(onPaint).toHaveBeenCalledTimes(3);
        expect(onPaint.mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c']);
    });

    it('continuing a paint gesture skips a cell that already has an event, but keeps the gesture open for the next one', () => {
        const { result, onPaint } = harness(['b']);
        result.current.start('paint', 'a');
        result.current.continueAt('b'); // already painted elsewhere - no-op
        result.current.continueAt('c');
        expect(onPaint.mock.calls.map(c => c[0])).toEqual(['a', 'c']);
    });

    it('continuing an erase gesture only removes cells that are actually occupied', () => {
        const { result, onErase } = harness(['a', 'c']);
        result.current.start('erase', 'a');
        result.current.continueAt('b'); // empty - no-op
        result.current.continueAt('c');
        expect(onErase.mock.calls.map(c => c[0])).toEqual(['a', 'c']);
    });

    it('does not re-fire for the same cell touched twice in a row (a stale hasEventAt closure read before a re-render must not double the toggle)', () => {
        const { result, onPaint } = harness();
        result.current.start('paint', 'a');
        result.current.continueAt('a');
        result.current.continueAt('a');
        expect(onPaint).toHaveBeenCalledTimes(1);
    });

    it('continueAt is a no-op before any gesture has started', () => {
        const { result, onPaint, onErase } = harness();
        result.current.continueAt('a');
        expect(onPaint).not.toHaveBeenCalled();
        expect(onErase).not.toHaveBeenCalled();
    });

    it('a window mouseup closes the gesture, so a later continueAt does nothing', () => {
        const { result, onPaint } = harness();
        result.current.start('paint', 'a');
        window.dispatchEvent(new MouseEvent('mouseup'));
        result.current.continueAt('b');
        expect(onPaint).toHaveBeenCalledTimes(1);
        expect(result.current.isActive()).toBe(false);
    });

    it('cancel() closes the gesture without touching the data', () => {
        const { result, onPaint, onErase } = harness();
        result.current.start('paint', 'a');
        result.current.cancel();
        expect(result.current.isActive()).toBe(false);
        result.current.continueAt('b');
        expect(onPaint).toHaveBeenCalledTimes(1); // only the initial 'a'
        expect(onErase).not.toHaveBeenCalled();
    });

    it('applyOnce applies the mode but never opens a gesture for continueAt to extend', () => {
        const { result, onErase } = harness(['a']);
        result.current.applyOnce('erase', 'a');
        expect(onErase).toHaveBeenCalledWith('a');
        expect(result.current.isActive()).toBe(false);
        result.current.continueAt('b'); // no gesture open - no-op
        expect(onErase).toHaveBeenCalledTimes(1);
    });

    it('isActive(mode) distinguishes which gesture is open', () => {
        const { result } = harness();
        result.current.start('paint', 'a');
        expect(result.current.isActive('paint')).toBe(true);
        expect(result.current.isActive('erase')).toBe(false);
        expect(result.current.isActive()).toBe(true);
    });
});
