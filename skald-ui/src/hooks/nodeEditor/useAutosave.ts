/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useAutosave.ts                          |
|                                                                              |
| Packet B4 (d) — autosave / recovery. The confirm-on-Load guard (b) stops    |
| Load from throwing away unsaved work with no warning, but it cannot help    |
| after a crash or a closed window: there is no "decline" to fall back to,    |
| just whatever was on screen a moment ago. This writes the live document to  |
| localStorage a short idle moment after each edit, and clears the record the |
| instant it stops being needed — the same instant `isDirty` goes false,      |
| whether that is a Save, a fresh Load, or an Undo back to the save point.    |
|                                                                              |
| Deliberately local and dependency-free: one localStorage key, JSON in, JSON |
| out, same defensive try/catch shape as utils/logger.ts already uses for the |
| same storage.                                                              |
================================================================================
*/
import { useEffect, useRef } from 'react';
import { EditorSnapshot } from './editorSnapshot';

export const AUTOSAVE_KEY = 'skald:autosave:v1';

/** What's actually written to storage: the document, plus when. */
export interface AutosaveRecord {
    snapshot: EditorSnapshot;
    savedAt: number;
}

// Edits arrive in bursts — a slider drag fires many gesture pushes in under a
// second — so writing on every one of them would mean hitting disk-backed
// storage dozens of times during a single drag. Debounced instead of a fixed
// interval: a burst collapses into one write shortly after it goes idle, and
// a lone edit is still captured quickly. Either "periodic" or "edit-triggered"
// satisfies the roadmap note; this is edit-triggered because a periodic timer
// would either write nothing new (idle) or interrupt the same burst anyway.
const AUTOSAVE_DEBOUNCE_MS = 2000;

const storage = (): Storage | null => {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        // localStorage can throw in restrictive contexts (sandboxed iframes,
        // some privacy modes) — autosave degrades to "no recovery", not a
        // crash. Same shape as utils/logger.ts's minLevel().
        return null;
    }
};

export const writeAutosave = (snapshot: EditorSnapshot): void => {
    const s = storage();
    if (!s) return;
    const record: AutosaveRecord = { snapshot, savedAt: Date.now() };
    try {
        s.setItem(AUTOSAVE_KEY, JSON.stringify(record));
    } catch {
        // Quota exceeded or similar — losing the autosave is no worse than
        // having none, so stay silent rather than surface a background
        // write failure the user never asked to see.
    }
};

/**
 * Whatever the last write-behind left, or null if there is none — including
 * a foreign/corrupt value, which is treated as absent rather than thrown.
 */
export const readAutosave = (): AutosaveRecord | null => {
    const s = storage();
    if (!s) return null;
    const raw = s.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.snapshot) return null;
        return parsed as AutosaveRecord;
    } catch {
        return null;
    }
};

export const clearAutosave = (): void => {
    const s = storage();
    if (!s) return;
    try {
        s.removeItem(AUTOSAVE_KEY);
    } catch {
        // Best-effort — see writeAutosave.
    }
};

/**
 * Debounced write-behind, plus the clear side of the same lifecycle.
 *
 * `editsSinceSave` (not `isDirty`) is what triggers a write: it is a count
 * that only moves forward when `pushHistory` actually records something, so
 * an Undo/Redo — which flips `isDirty` without capturing anything new — does
 * not schedule a redundant write of a snapshot already on disk.
 *
 * `isDirty` is what triggers the clear: the moment it goes false — Save,
 * Load's resetHistory, or an Undo back to the save point — the previous
 * edits are reconciled with reality and the recovery record would only ever
 * describe a state that is no longer "unsaved work". `wasDirty` guards the
 * very first render, where `isDirty` starts false and would otherwise wipe
 * out a crash-recovery record before app.tsx has had a chance to read it.
 */
export const useAutosave = (
    captureSnapshot: () => EditorSnapshot | null,
    editsSinceSave: number,
    isDirty: boolean,
): void => {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasDirty = useRef(false);

    useEffect(() => {
        if (wasDirty.current && !isDirty) clearAutosave();
        wasDirty.current = isDirty;
    }, [isDirty]);

    useEffect(() => {
        if (editsSinceSave === 0) return; // startup / just saved / just loaded
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const snapshot = captureSnapshot();
            if (snapshot) writeAutosave(snapshot);
        }, AUTOSAVE_DEBOUNCE_MS);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [editsSinceSave, captureSnapshot]);
};
