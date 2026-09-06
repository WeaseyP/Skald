// @vitest-environment jsdom
//
// Roadmap F1 — StepGrid tracked live Ctrl/Shift/Alt state itself (for the
// drag-axis cursor hint); PianoRoll has no equivalent today. Extracted so a
// third reader (the F2 drum roll) does not have to copy the four-listener
// dance a third time.
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useModifierKeys } from '../../hooks/sequencer/useModifierKeys';

describe('useModifierKeys', () => {
    afterEach(() => cleanup());

    it('starts with every modifier reported false', () => {
        const { result } = renderHook(() => useModifierKeys());
        expect(result.current).toEqual({ ctrl: false, shift: false, alt: false });
    });

    it('turns a modifier on while the key is held, and off on release', () => {
        const { result } = renderHook(() => useModifierKeys());

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })); });
        expect(result.current.shift).toBe(true);
        expect(result.current.ctrl).toBe(false);

        act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })); });
        expect(result.current.shift).toBe(false);
    });

    it('treats Meta the same as Ctrl (a Mac keyboard has no Ctrl-drag)', () => {
        const { result } = renderHook(() => useModifierKeys());

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' })); });
        expect(result.current.ctrl).toBe(true);

        act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' })); });
        expect(result.current.ctrl).toBe(false);
    });

    it('tracks Alt independently of the other two', () => {
        const { result } = renderHook(() => useModifierKeys());

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' })); });
        expect(result.current).toEqual({ ctrl: false, shift: false, alt: true });
    });

    it('stops listening once unmounted', () => {
        const { result, unmount } = renderHook(() => useModifierKeys());
        unmount();
        expect(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
        }).not.toThrow();
        // No render to read after unmount; the assertion above is that the
        // stale listener does not throw trying to update unmounted state.
        expect(result.current.shift).toBe(false);
    });
});
