// @vitest-environment jsdom
//
// E9 (roadmap 0.2 §9.4 item 3): which of the four AudioVisualizer modes an
// Output node shows is a view preference, the same class as
// useSnapToGridPreference (E6) — it must survive a reload but must NEVER
// travel with the save file or go through pushHistory (undoing a graph edit
// should not also flip what the scope is showing).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useVisualizerModePreference } from '../../hooks/nodeEditor/useVisualizerModePreference';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
});

describe('useVisualizerModePreference', () => {
    it('defaults to oscilloscope for a profile with no stored preference', () => {
        const { result } = renderHook(() => useVisualizerModePreference());
        expect(result.current[0]).toBe('oscilloscope');
    });

    it('persists a mode change across remounts (a reload, in the app)', () => {
        const { result, unmount } = renderHook(() => useVisualizerModePreference());
        act(() => result.current[1]('spectrogram'));
        expect(result.current[0]).toBe('spectrogram');
        unmount();

        const { result: afterReload } = renderHook(() => useVisualizerModePreference());
        expect(afterReload.current[0]).toBe('spectrogram');
    });

    it('is keyed separately from other localStorage state (does not clobber unrelated keys)', () => {
        localStorage.setItem('unrelated-key', 'untouched');
        const { result } = renderHook(() => useVisualizerModePreference());
        act(() => result.current[1]('correlation'));
        expect(localStorage.getItem('unrelated-key')).toBe('untouched');
    });

    it('ignores a corrupted or foreign stored value and falls back to the default', () => {
        localStorage.setItem('skald.visualizer.mode', 'not-a-real-mode');
        const { result } = renderHook(() => useVisualizerModePreference());
        expect(result.current[0]).toBe('oscilloscope');
    });
});
