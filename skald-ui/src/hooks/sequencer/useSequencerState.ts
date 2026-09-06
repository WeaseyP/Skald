/*
================================================================================
| FILE: skald-ui/src/hooks/sequencer/useSequencerState.ts                      |
|                                                                              |
| Sequencer tracks and notes. This hook used to keep its OWN uncapped undo      |
| stack, popped by the same Ctrl+Z as the graph's 50-entry stack (SKB-008), and |
| its `loadTracks` PUSHED the outgoing project's tracks onto that stack, which  |
| is the SKB-005 data-loss path: one Ctrl+Z after Load swapped the just-opened  |
| project's notes for the previous project's, and the instrument registry then  |
| pruned them as orphans.                                                      |
|                                                                              |
| Tracks are now one slice of the single editor history (useEditorHistory).     |
| Mutations that a user performs push a labelled entry; mutations that are a    |
| CONSEQUENCE of a graph edit (a track appearing/disappearing with its          |
| Instrument node) are silent, because the graph edit already pushed the entry   |
| that covers them — and the snapshot it pushed contains the tracks too.        |
================================================================================
*/
import { useState, useCallback, useMemo, useRef } from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';
import { EditorHistoryApi } from '../nodeEditor/editorSnapshot';
import { logger } from '../../utils/logger';
import { dedupeTrackNotes } from '../../utils/trackNotes';
// Helper to generate a unique ID if uuid not available
const generateId = () => Math.random().toString(36).substr(2, 9);

export type SequencerHistoryHooks = Pick<EditorHistoryApi, 'pushHistory'>;

/** One instrument node as the registry describes it to the sequencer. */
export type InstrumentTrackSpec = { id: string; name: string };

export const useSequencerState = ({ pushHistory }: SequencerHistoryHooks) => {
    const [tracks, setTracksState] = useState<SequencerTrack[]>([]);
    const [currentStep, setCurrentStep] = useState(0);

    // Same pattern as useGraphState: every write goes through this wrapper, so
    // `tracksRef.current` is the authoritative current value at any point in a
    // React batch. The old code closed over `tracks` from the last render,
    // which is how `saveHistory()` could record a stale set of tracks.
    const tracksRef = useRef<SequencerTrack[]>([]);
    const writeTracks = useCallback((next: SequencerTrack[]) => {
        tracksRef.current = next;
        setTracksState(next);
    }, []);

    const mapTracks = useCallback((fn: (t: SequencerTrack) => SequencerTrack) => {
        writeTracks(tracksRef.current.map(fn));
    }, [writeTracks]);

    // ---- Derived-state mutations: silent by design (see file header) --------

    /**
     * Reconcile the track list against the Instrument nodes on the canvas in
     * ONE write: add missing, rename renamed, drop orphans. Called by
     * useInstrumentRegistry.
     *
     * Silent, and that is the fix for the delete-cascade half of F-B01-3:
     * deleting an Instrument pushed 'delete node' on the graph stack and then a
     * SECOND entry on the sequencer stack for the cascaded track removal, so one
     * Ctrl+Z restored the track without its node and the registry immediately
     * deleted it again. Now the graph edit's snapshot already holds both, and
     * one Ctrl+Z brings the node and its whole track back together.
     */
    const syncInstrumentTracks = useCallback((instruments: InstrumentTrackSpec[]) => {
        const current = tracksRef.current;
        const byNode = new Map(instruments.map(i => [i.id, i]));

        const kept: SequencerTrack[] = [];
        let changed = false;
        for (const track of current) {
            const spec = byNode.get(track.targetNodeId);
            if (!spec) { changed = true; continue; }          // orphan: node is gone
            if (spec.name !== track.name) { changed = true; kept.push({ ...track, name: spec.name }); }
            else kept.push(track);
        }

        const existingNodeIds = new Set(current.map(t => t.targetNodeId));
        for (const spec of instruments) {
            if (existingNodeIds.has(spec.id)) continue;
            changed = true;
            kept.push({
                id: generateId(),
                targetNodeId: spec.id,
                name: spec.name,
                color: '#007acc',
                steps: 16,
                notes: [],
                isMuted: false,
                isSolo: false,
            });
        }

        if (!changed) return;
        writeTracks(kept);
    }, [writeTracks]);

    /**
     * Replace every track — Load and history-restore only. It must NOT push:
     * pushing here is what let a Ctrl+Z after Load resurrect the previous
     * project's tracks over the newly opened project's (SKB-005). handleLoad
     * clears the whole history instead.
     */
    const loadTracks = useCallback((newTracks: SequencerTrack[]) => {
        // B5-x3: (step, pitch) uniqueness is enforced for every edit (B5-2)
        // but was never established for what a FILE brought in — two notes at
        // one (step, pitch) rendered as a React duplicate-key warning with one
        // block hidden. Every track the editor holds enters through here (Load,
        // Import, autosave restore, history), so this is the one place the
        // invariant is made true. useFileIO reports the count on Load.
        writeTracks(dedupeTrackNotes(newTracks).tracks);
    }, [writeTracks]);

    // ---- User gestures: each pushes one labelled entry ---------------------

    const toggleStep = useCallback((trackId: string, step: number, note?: number) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return;
        logger.debug('useSequencerState', `toggleStep track=${trackId} step=${step} note=${note}`);

        pushHistory(`Toggle step ${step + 1}`, { gesture: `step:${trackId}:${step}:${note ?? ''}` });
        mapTracks(t => {
            if (t.id !== trackId) return t;

            // If note is provided, we look for that specific note.
            // If not provided (StepGrid behavior), we look for ANY note at this step.
            const existingNoteIndex = t.notes.findIndex(n =>
                n.step === step && (note === undefined || n.note === note)
            );

            if (existingNoteIndex >= 0) {
                return {
                    ...t,
                    notes: t.notes.filter((_, i) => i !== existingNoteIndex)
                };
            } else {
                const newNote: NoteEvent = {
                    step,
                    note: note || 60,
                    velocity: 1.0,
                    duration: 1
                };
                return {
                    ...t,
                    notes: [...t.notes, newNote]
                };
            }
        });
    }, [mapTracks, pushHistory]);

    /**
     * Delete every note on a step.
     *
     * SKB-025: right-click-erase used to call toggleStep with no pitch, which
     * deleted `notes.find(n => n.step === step)` — the first member in
     * insertion order. Erasing a triad therefore took three clicks, and after
     * each one a sibling took over the block, so the step never appeared to
     * clear. A grid row has no pitch axis, so "erase this step" is the only
     * unambiguous thing a right-click there can mean; the piano roll, which
     * does have one, still erases per pitch through toggleStep.
     */
    const clearStep = useCallback((trackId: string, step: number) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return;
        const doomed = track.notes.filter(n => n.step === step);
        if (doomed.length === 0) return;

        pushHistory(
            doomed.length === 1 ? `Delete step ${step + 1}` : `Clear step ${step + 1} (${doomed.length} notes)`,
            { gesture: `clearStep:${trackId}:${step}` },
        );
        mapTracks(t => (t.id === trackId
            ? { ...t, notes: t.notes.filter(n => n.step !== step) }
            : t));
    }, [mapTracks, pushHistory]);

    // notePitch identifies WHICH note on the step to edit — without it, a
    // chord could only ever have its first note addressed, and the cleanup
    // below deleted every sibling on the step (the "Snap to Scale destroys
    // chords" bug).
    //
    // `historyOverride` (E12 — macro-pad P-lock recording): a recording PASS
    // (Record on -> Record off) writes many steps, one call per step, as the
    // playhead reaches each one — but the whole pass has to land as ONE undo
    // entry, not one per step. The default gesture below is keyed on
    // (trackId, step, notePitch, fields), which is right for a drag or a
    // typed edit (each field on each note coalesces on its own) but would
    // open a fresh entry per step for a recording pass, since every step has
    // a different `step`. Passing a gesture that stays constant for the
    // whole pass (see MacroPadSection in NodeParameterControls.tsx) makes
    // every step's write coalesce into the one entry the pass opened with,
    // through the SAME idle-window mechanism (`useEditorHistory.ts`,
    // `GESTURE_IDLE_MS`) every other continuous-input gesture in this app
    // already relies on.
    const updateNote = useCallback((
        trackId: string,
        step: number,
        changes: Partial<NoteEvent>,
        notePitch?: number,
        historyOverride?: { label: string; gesture: string },
    ) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return;

        if (historyOverride) {
            pushHistory(historyOverride.label, { gesture: historyOverride.gesture });
        } else {
            // Shift/Ctrl/Alt-dragging a note in the grid fires this per pointermove;
            // target+field keying makes one drag one entry, and duration-then-
            // velocity two, however fast they follow each other.
            const fields = Object.keys(changes).slice().sort().join(',');
            pushHistory('Edit note', { gesture: `note:${trackId}:${step}:${notePitch ?? ''}:${fields}` });
        }

        mapTracks(t => {
            if (t.id !== trackId) return t;

            const targetNote = t.notes.find(n =>
                n.step === step && (notePitch === undefined || n.note === notePitch)
            );
            if (!targetNote) return t;

            const updatedNote = { ...targetNote, ...changes };
            const newDuration = updatedNote.duration || 1;

            const coveredSteps = new Set<number>();
            for (let i = 1; i < newDuration; i++) {
                coveredSteps.add(step + i);
            }

            const cleanedNotes = t.notes.filter(n => {
                if (n === targetNote) return false; // the note being replaced
                // Tie cleanup applies per pitch lane: a long C4 swallows the
                // C4s under it, but leaves the E4/G4 chord siblings alone.
                if (coveredSteps.has(n.step) && n.note === updatedNote.note) return false;
                // SKB-025: (step, pitch) is the address every editor and
                // Export-Step now uses, so it has to be unique. Retuning a
                // chord member onto a sibling's pitch used to leave TWO notes
                // at the same (step, pitch) — two events the generated
                // sequencer fires together, and an address that no longer
                // named one note. The retuned note wins; the note it landed on
                // is absorbed, the same way a tie absorbs what it covers.
                if (n.step === updatedNote.step && n.note === updatedNote.note) return false;
                return true;
            });

            return {
                ...t,
                notes: [...cleanedNotes, updatedNote].sort((a, b) => a.step - b.step)
            };
        });
    }, [mapTracks, pushHistory]);

    const toggleMute = useCallback((trackId: string) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return;
        pushHistory(track.isMuted ? 'Unmute track' : 'Mute track');
        mapTracks(t => (t.id === trackId ? { ...t, isMuted: !t.isMuted } : t));
    }, [mapTracks, pushHistory]);

    const toggleSolo = useCallback((trackId: string) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return;
        pushHistory(track.isSolo ? 'Unsolo track' : 'Solo track');
        mapTracks(t => (t.id === trackId ? { ...t, isSolo: !t.isSolo } : t));
    }, [mapTracks, pushHistory]);

    /**
     * F4: which editor this track opens in. A stored preference, not a
     * derived fact — the detection in trackViewMode.ts reads the patch, and
     * this is how a user overrules it.
     *
     * It goes through pushHistory like every other track mutation (the B3
     * rule): the mode is part of the saved document, so a Ctrl+Z after
     * choosing one has to put the old choice back rather than skipping over
     * the gesture to whatever was edited before it.
     */
    const setTrackViewMode = useCallback((trackId: string, viewMode: SequencerTrack['viewMode']) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        // Absent and 'auto' are the same state (trackViewMode.ts::storedViewMode),
        // so re-picking Auto on a track that never stored one must not open an
        // undo entry that restores nothing.
        if (!track || (track.viewMode ?? 'auto') === (viewMode ?? 'auto')) return;
        pushHistory('Change track view');
        mapTracks(t => (t.id === trackId ? { ...t, viewMode } : t));
    }, [mapTracks, pushHistory]);

    const updateTrackSteps = useCallback((trackId: string, steps: number) => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track || track.steps === steps) return;
        pushHistory('Change track length', { gesture: `trackSteps:${trackId}` });
        mapTracks(t => (t.id === trackId ? { ...t, steps } : t));
    }, [mapTracks, pushHistory]);

    return useMemo(() => ({
        tracks,
        tracksRef,
        currentStep,
        setCurrentStep,
        syncInstrumentTracks,
        updateTrackSteps,
        setTrackViewMode,
        toggleStep,
        clearStep,
        toggleMute,
        toggleSolo,
        loadTracks,
        updateNote,
    }), [
        tracks,
        currentStep,
        syncInstrumentTracks,
        updateTrackSteps,
        setTrackViewMode,
        toggleStep,
        clearStep,
        toggleMute,
        toggleSolo,
        loadTracks,
        updateNote,
    ]);
};
