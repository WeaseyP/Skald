// @vitest-environment jsdom
//
// SKB-005, packet B4 (d) — "no autosave/recovery". A crash or a closed window
// with unsaved edits used to leave nothing behind at all; the confirm-on-Load
// guard (b) only covers the in-app Load path, not a lost session. This is the
// write-behind (useAutosave) and the storage round trip (write/read/clear)
// its recovery path relies on.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
    AUTOSAVE_KEY,
    readAutosave,
    writeAutosave,
    clearAutosave,
    useAutosave,
} from '../../hooks/nodeEditor/useAutosave';
import { EditorSnapshot } from '../../hooks/nodeEditor/editorSnapshot';

const fakeSnapshot = (bpm: number): EditorSnapshot => ({
    nodes: [{ id: 'n1' }] as unknown as EditorSnapshot['nodes'],
    edges: [],
    tracks: [],
    session: { bpm, patternSteps: 16, masterVolume: 0.8, packageName: 'generated_audio' },
});

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('writeAutosave / readAutosave / clearAutosave — the storage round trip', () => {
    it('reads back exactly what was written, plus a timestamp', () => {
        const snapshot = fakeSnapshot(140);
        writeAutosave(snapshot);

        const record = readAutosave();
        expect(record).not.toBeNull();
        expect(record!.snapshot).toEqual(snapshot);
        expect(typeof record!.savedAt).toBe('number');
    });

    it('returns null when there is nothing stored', () => {
        expect(readAutosave()).toBeNull();
    });

    it('treats corrupt / foreign JSON as absent rather than throwing', () => {
        localStorage.setItem(AUTOSAVE_KEY, '{ not json');
        expect(readAutosave()).toBeNull();

        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ hello: 'world' }));
        expect(readAutosave()).toBeNull();
    });

    it('clearAutosave removes the record so a later read sees nothing', () => {
        writeAutosave(fakeSnapshot(90));
        expect(readAutosave()).not.toBeNull();
        clearAutosave();
        expect(readAutosave()).toBeNull();
    });
});

describe('useAutosave — debounced write-behind', () => {
    it('writes nothing before the debounce window elapses, then writes the captured snapshot', () => {
        vi.useFakeTimers();
        const snapshot = fakeSnapshot(128);
        const captureSnapshot = vi.fn().mockReturnValue(snapshot);

        const { rerender } = renderHook(
            ({ edits }) => useAutosave(captureSnapshot, edits, true),
            { initialProps: { edits: 0 } },
        );
        rerender({ edits: 1 }); // one edit landed

        vi.advanceTimersByTime(1000);
        expect(readAutosave()).toBeNull(); // debounce (2000ms) hasn't elapsed

        vi.advanceTimersByTime(1000);
        expect(readAutosave()!.snapshot).toEqual(snapshot);
    });

    it('collapses a fast burst of edits into exactly one write', () => {
        vi.useFakeTimers();
        const captureSnapshot = vi.fn().mockReturnValue(fakeSnapshot(100));

        const { rerender } = renderHook(
            ({ edits }) => useAutosave(captureSnapshot, edits, true),
            { initialProps: { edits: 0 } },
        );
        // Three edits in quick succession — each one restarts the debounce
        // timer instead of scheduling its own write.
        rerender({ edits: 1 });
        vi.advanceTimersByTime(500);
        rerender({ edits: 2 });
        vi.advanceTimersByTime(500);
        rerender({ edits: 3 });

        vi.advanceTimersByTime(2000); // idle from the LAST edit
        expect(captureSnapshot).toHaveBeenCalledTimes(1);
    });

    it('does not write when there have been no edits yet (a fresh document)', () => {
        vi.useFakeTimers();
        const captureSnapshot = vi.fn().mockReturnValue(fakeSnapshot(120));
        renderHook(() => useAutosave(captureSnapshot, 0, false));

        vi.advanceTimersByTime(5000);
        expect(captureSnapshot).not.toHaveBeenCalled();
        expect(readAutosave()).toBeNull();
    });

    it('clears the record when isDirty goes back to false — but NOT on the very first render', () => {
        // Seed a record as if a PREVIOUS session's crash left one behind.
        writeAutosave(fakeSnapshot(77));
        const captureSnapshot = vi.fn().mockReturnValue(fakeSnapshot(77));

        // Mounting clean (a fresh app start) must not wipe a crash record
        // before app.tsx has had a chance to read it and offer recovery.
        const { rerender } = renderHook(
            ({ dirty }) => useAutosave(captureSnapshot, 0, dirty),
            { initialProps: { dirty: false } },
        );
        expect(readAutosave()).not.toBeNull();

        // Now the session actually gets dirty and then clean again (e.g. Save).
        rerender({ dirty: true });
        expect(readAutosave()).not.toBeNull();
        rerender({ dirty: false });
        expect(readAutosave()).toBeNull();
    });
});
