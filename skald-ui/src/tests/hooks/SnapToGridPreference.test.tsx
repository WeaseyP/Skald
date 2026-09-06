// @vitest-environment jsdom
//
// E6: the snap-to-grid toggle is a view preference (WAVE-E-BRIEF: "a
// persisted UI preference is fine but is NOT part of the undo document; do
// not push it through pushHistory"). This pins the two things that make it
// one: it survives a reload (localStorage), and defaults to off for a
// profile that has never touched it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSnapToGridPreference } from '../../hooks/nodeEditor/useSnapToGridPreference';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
});

describe('useSnapToGridPreference', () => {
    it('defaults to off for a profile with no stored preference', () => {
        const { result } = renderHook(() => useSnapToGridPreference());
        expect(result.current[0]).toBe(false);
    });

    it('persists a toggle across remounts (a reload, in the app)', () => {
        const { result, unmount } = renderHook(() => useSnapToGridPreference());
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        unmount();

        const { result: afterReload } = renderHook(() => useSnapToGridPreference());
        expect(afterReload.current[0]).toBe(true);
    });

    it('is keyed separately from other localStorage state (does not clobber unrelated keys)', () => {
        localStorage.setItem('unrelated-key', 'untouched');
        const { result } = renderHook(() => useSnapToGridPreference());
        act(() => result.current[1](true));
        expect(localStorage.getItem('unrelated-key')).toBe('untouched');
    });
});
