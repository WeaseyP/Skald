/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useEditorHistory.ts                      |
|                                                                              |
| THE undo history. One ordered stack of {nodes, edges, tracks, session}       |
| snapshots, one cap, one label per entry. See editorSnapshot.ts for the        |
| contract and for why there is exactly one of these.                          |
================================================================================
*/
import { useCallback, useMemo, useRef, useState } from 'react';
import {
    EditorHistoryApi,
    EditorSnapshot,
    GESTURE_IDLE_MS,
    HISTORY_LIMIT,
    HistoryEntry,
    HistoryIO,
    PushOptions,
} from './editorSnapshot';

type Stacks = { past: HistoryEntry[]; future: HistoryEntry[] };

const EMPTY: Stacks = { past: [], future: [] };

const topId = (entries: HistoryEntry[]): number | null =>
    entries.length > 0 ? entries[entries.length - 1].id : null;

export const useEditorHistory = (): EditorHistoryApi => {
    // The stacks live in a ref and are MIRRORED into state for rendering.
    // Reading the ref means two pushes inside one React batch both see the
    // real stack instead of a render-stale copy — the old `saveStateForUndo`
    // closed over `nodes`/`edges` from the last render and could snapshot a
    // graph that had already moved on.
    const stacksRef = useRef<Stacks>(EMPTY);
    const [stacks, setStacks] = useState<Stacks>(EMPTY);
    const commit = useCallback((next: Stacks) => {
        stacksRef.current = next;
        setStacks(next);
    }, []);

    const ioRef = useRef<HistoryIO | null>(null);
    const connect = useCallback((io: HistoryIO) => {
        ioRef.current = io;
    }, []);

    const isRestoring = useRef(false);
    const nextId = useRef(1);

    // The open gesture, if any. See PushOptions in editorSnapshot.ts.
    const gesture = useRef<{ key: string; scope: 'idle' | 'tick'; touchedAt: number } | null>(null);

    const endGesture = useCallback((key?: string) => {
        if (key === undefined || gesture.current?.key === key) gesture.current = null;
    }, []);

    // Save point for the B4 dirty flag: the id of the entry on top of the undo
    // stack at the moment of the last save (null = a pristine/just-loaded
    // document). Comparing ids rather than counting depth means undoing back to
    // the saved state reports clean again, and redoing away reports dirty.
    const [savedEntryId, setSavedEntryId] = useState<number | null>(null);
    const [editsSinceSave, setEditsSinceSave] = useState(0);

    const pushHistory = useCallback((label: string, options?: PushOptions) => {
        if (isRestoring.current) return;
        const io = ioRef.current;
        if (!io) return;

        const key = options?.gesture;
        if (key !== undefined) {
            const scope = options?.scope ?? 'idle';
            const now = Date.now();
            const open = gesture.current;
            const stillOpen =
                open !== null &&
                open.key === key &&
                (open.scope === 'tick' || now - open.touchedAt <= GESTURE_IDLE_MS);
            if (stillOpen) {
                // Same thing still being manipulated: the entry this gesture
                // opened with already holds the pre-gesture document.
                open!.touchedAt = now;
                return;
            }
            gesture.current = { key, scope, touchedAt: now };
            if (scope === 'tick') {
                // One user action, several change callbacks in the same task.
                queueMicrotask(() => endGesture(key));
            }
        } else {
            gesture.current = null;
        }

        const entry: HistoryEntry = { id: nextId.current++, label, snapshot: io.capture() };
        commit({
            past: [...stacksRef.current.past, entry].slice(-HISTORY_LIMIT),
            future: [],
        });
        setEditsSinceSave(n => n + 1);
    }, [commit, endGesture]);

    const restore = useCallback((snapshot: EditorSnapshot) => {
        const io = ioRef.current;
        if (!io) return;
        isRestoring.current = true;
        try {
            io.restore(snapshot);
        } finally {
            isRestoring.current = false;
        }
    }, []);

    const handleUndo = useCallback(() => {
        const io = ioRef.current;
        if (!io) return;
        const { past, future } = stacksRef.current;
        if (past.length === 0) return;
        gesture.current = null;
        const entry = past[past.length - 1];
        // The redo entry keeps the SAME label and id: it describes the same
        // edit, so "Redo Move node" reads correctly and the save point can
        // still be recognised after an undo/redo round trip.
        const redoEntry: HistoryEntry = { id: entry.id, label: entry.label, snapshot: io.capture() };
        commit({ past: past.slice(0, -1), future: [redoEntry, ...future] });
        restore(entry.snapshot);
    }, [commit, restore]);

    const handleRedo = useCallback(() => {
        const io = ioRef.current;
        if (!io) return;
        const { past, future } = stacksRef.current;
        if (future.length === 0) return;
        gesture.current = null;
        const entry = future[0];
        const undoEntry: HistoryEntry = { id: entry.id, label: entry.label, snapshot: io.capture() };
        commit({ past: [...past, undoEntry], future: future.slice(1) });
        restore(entry.snapshot);
    }, [commit, restore]);

    // Load replaces the whole document. Undo must not be able to splice the
    // previous project back on top of the new one — that is the SKB-005
    // data-loss path, where one Ctrl+Z after Load swapped the just-opened
    // project's tracks for the previous project's.
    const resetHistory = useCallback(() => {
        gesture.current = null;
        commit(EMPTY);
        setSavedEntryId(null);
        setEditsSinceSave(0);
    }, [commit]);

    const markSaved = useCallback(() => {
        setSavedEntryId(topId(stacksRef.current.past));
        setEditsSinceSave(0);
    }, []);

    const captureSnapshot = useCallback(() => ioRef.current?.capture() ?? null, []);

    return useMemo<EditorHistoryApi>(() => ({
        pushHistory,
        endGesture,
        handleUndo,
        handleRedo,
        resetHistory,
        connect,
        canUndo: stacks.past.length > 0,
        canRedo: stacks.future.length > 0,
        undoDepth: stacks.past.length,
        redoDepth: stacks.future.length,
        undoLabel: stacks.past.length > 0 ? stacks.past[stacks.past.length - 1].label : null,
        redoLabel: stacks.future.length > 0 ? stacks.future[0].label : null,
        undoLabels: stacks.past.map(e => e.label),
        redoLabels: stacks.future.map(e => e.label),
        isDirty: topId(stacks.past) !== savedEntryId,
        editsSinceSave,
        markSaved,
        captureSnapshot,
    }), [
        pushHistory, endGesture, handleUndo, handleRedo, resetHistory, connect,
        stacks, savedEntryId, editsSinceSave, markSaved, captureSnapshot,
    ]);
};
