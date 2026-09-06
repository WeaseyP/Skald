// @vitest-environment jsdom
//
// Roadmap F1 — StepGrid's modifier-drag (duration/velocity/probability,
// chosen by which key is held) and PianoRoll's resize-handle drag (duration
// only, via a corner handle) are the same grab -> preview -> commit-on-
// mouseup machine with a different axis policy layered on top. `valueFor`
// carries that policy so both callers keep their own axis rules; `onCommit`
// fires exactly once, on mouseup, which is what makes one drag of any length
// one undo entry (the pushHistory gesture key upstream, in
// useSequencerState.ts::updateNote, coalesces on (trackId, step, notePitch,
// fields) — unaffected by this hook, which never calls pushHistory itself).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useNoteDrag } from '../../hooks/sequencer/useNoteDrag';

type Field = 'duration' | 'velocity';

describe('useNoteDrag', () => {
    afterEach(() => cleanup());

    // Mirrors StepGrid's own axis math: horizontal moves duration (steps of
    // 20px), vertical moves velocity (up = higher), both clamped.
    const valueFor = (field: Field, initialValue: number, deltaX: number, deltaY: number): number => {
        if (field === 'duration') return Math.max(1, Math.min(16, Math.round(initialValue + deltaX / 20)));
        return Math.max(0, Math.min(1, initialValue + deltaY / 100));
    };

    it('has no state before a drag starts', () => {
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit: vi.fn() }));
        expect(result.current.state).toBeNull();
    });

    it('start() opens a preview at the initial value', () => {
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit: vi.fn() }));
        act(() => {
            result.current.start({ trackId: 't1', step: 2, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        expect(result.current.state).toMatchObject({ trackId: 't1', step: 2, notePitch: 60, field: 'duration', currentValue: 1 });
    });

    it('mousemove previews a new value through valueFor without committing', () => {
        const onCommit = vi.fn();
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit }));
        act(() => {
            result.current.start({ trackId: 't1', step: 2, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 })); });

        expect(result.current.state?.currentValue).toBe(4); // 1 + round(60/20)
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('mouseup commits exactly once and clears the preview', () => {
        const onCommit = vi.fn();
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit }));
        act(() => {
            result.current.start({ trackId: 't1', step: 2, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('t1', 2, 'duration', 4, 60);
        expect(result.current.state).toBeNull();
    });

    it('the vertical axis flips sign (up increases the value) via deltaY = startY - clientY', () => {
        const onCommit = vi.fn();
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit }));
        act(() => {
            result.current.start({ trackId: 't1', step: 0, notePitch: 60, field: 'velocity', initialValue: 0.5, startX: 0, startY: 100 });
        });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientY: 50 })); }); // moved UP 50px
        act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

        expect(onCommit).toHaveBeenCalledWith('t1', 0, 'velocity', 1, 60); // clamped at 1
    });

    it('Escape does nothing unless cancelOnEscape is set (StepGrid never had Escape-cancel)', () => {
        const onCommit = vi.fn();
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit }));
        act(() => {
            result.current.start({ trackId: 't1', step: 0, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(result.current.state).not.toBeNull();

        act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
        expect(onCommit).toHaveBeenCalledTimes(1); // committed normally
    });

    it('Escape cancels the drag without committing when cancelOnEscape is set (PianoRoll resize)', () => {
        const onCommit = vi.fn();
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit, cancelOnEscape: true }));
        act(() => {
            result.current.start({ trackId: 't1', step: 0, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 })); });
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(result.current.state).toBeNull();

        act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('starting a second drag resets the preview to the new initial value', () => {
        const { result } = renderHook(() => useNoteDrag<Field>({ valueFor, onCommit: vi.fn() }));
        act(() => {
            result.current.start({ trackId: 't1', step: 0, notePitch: 60, field: 'duration', initialValue: 1, startX: 0, startY: 0 });
        });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 })); });
        act(() => {
            result.current.start({ trackId: 't1', step: 5, notePitch: 64, field: 'velocity', initialValue: 0.2, startX: 10, startY: 10 });
        });
        expect(result.current.state).toMatchObject({ step: 5, notePitch: 64, field: 'velocity', currentValue: 0.2 });
    });
});
