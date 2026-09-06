/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useSessionSettings.ts                    |
|                                                                              |
| BPM, pattern length, master volume and export package name — the song-level  |
| settings the save file carries in its `session` block.                       |
|                                                                              |
| They used to be plain useState in app.tsx and appeared in NEITHER undo stack  |
| (F-B01-9): setting the tempo to 240 by accident was unrecoverable. Here each  |
| one has a TRACKED setter that pushes a labelled history entry first, plus one |
| untracked `applySessionSettings` for the paths that must not push (Load, and  |
| history restore itself).                                                     |
================================================================================
*/
import { useCallback, useMemo, useRef, useState } from 'react';
import { PushHistory, SessionSettings } from './editorSnapshot';

export const DEFAULT_SESSION: SessionSettings = {
    bpm: 120,
    patternSteps: 16,
    // Owned here (not in SequencerDock): the exported project and the save file
    // both carry it. Reading the live GainNode at Generate time baked 0.8
    // whenever playback was stopped (the node only exists while playing).
    masterVolume: 0.8,
    packageName: 'generated_audio',
    // G3: matches ScaleProvider's own pre-existing defaults (ScaleContext.tsx)
    // exactly, so a fresh document's session and a fresh ScaleProvider start
    // in agreement with nothing to reconcile.
    rootNote: 'C',
    scaleName: 'Chromatic',
};

export const useSessionSettings = (pushHistory: PushHistory) => {
    const [session, setSession] = useState<SessionSettings>(DEFAULT_SESSION);

    // Mirrored into a ref so the history can capture the CURRENT session even
    // when several setters run inside one React batch.
    const sessionRef = useRef(session);
    const writeSession = useCallback((next: SessionSettings) => {
        sessionRef.current = next;
        setSession(next);
    }, []);

    /** Untracked: Load and history-restore replace the session wholesale. */
    const applySessionSettings = useCallback((patch: Partial<SessionSettings>) => {
        const current = sessionRef.current;
        const next: SessionSettings = {
            bpm: patch.bpm !== undefined ? patch.bpm : current.bpm,
            patternSteps: patch.patternSteps !== undefined ? patch.patternSteps : current.patternSteps,
            masterVolume: patch.masterVolume !== undefined ? patch.masterVolume : current.masterVolume,
            packageName: patch.packageName !== undefined ? patch.packageName : current.packageName,
            rootNote: patch.rootNote !== undefined ? patch.rootNote : current.rootNote,
            scaleName: patch.scaleName !== undefined ? patch.scaleName : current.scaleName,
        };
        writeSession(next);
    }, [writeSession]);

    // One tracked setter per field. The gesture key is target+field, so
    // dragging the master-volume slider is one entry however long the drag
    // takes, while a tempo change followed by a volume change is always two.
    const trackedSetter = useCallback(<K extends keyof SessionSettings>(
        field: K,
        label: string,
    ) => (value: SessionSettings[K]) => {
        if (sessionRef.current[field] === value) return;
        pushHistory(label, { gesture: `session:${field}` });
        applySessionSettings({ [field]: value } as Partial<SessionSettings>);
    }, [pushHistory, applySessionSettings]);

    const setBpm = useMemo(() => trackedSetter('bpm', 'Change BPM'), [trackedSetter]);
    const setPatternSteps = useMemo(() => trackedSetter('patternSteps', 'Change pattern length'), [trackedSetter]);
    const setMasterVolume = useMemo(() => trackedSetter('masterVolume', 'Change master volume'), [trackedSetter]);
    const setPackageName = useMemo(() => trackedSetter('packageName', 'Change package name'), [trackedSetter]);
    // G3: ScaleProvider (contexts/ScaleContext.tsx) stays the live, immediately
    // -reactive owner of rootNote/scaleName — SequencerToolbar writes to it
    // directly and nothing here changes that. These two exist so a live scale
    // change is ALSO undoable and ALSO saved; app.tsx's EditorLayout is the
    // bridge that calls them when ScaleContext changes, and the reverse (a
    // Load or an Undo restoring an older session) writes back into
    // ScaleContext through the same effect, keyed off simple inequality
    // checks so the two directions cannot feed each other in a loop.
    const setRootNote = useMemo(() => trackedSetter('rootNote', 'Change key'), [trackedSetter]);
    const setScaleName = useMemo(() => trackedSetter('scaleName', 'Change scale'), [trackedSetter]);

    return {
        session,
        sessionRef,
        setBpm,
        setPatternSteps,
        setMasterVolume,
        setPackageName,
        setRootNote,
        setScaleName,
        applySessionSettings,
    };
};
