import { useState, useCallback, useMemo } from 'react';
import { SequencerTrack, NoteEvent, SequencerState } from '../../definitions/types';
// Helper to generate a unique ID if uuid not available
const generateId = () => Math.random().toString(36).substr(2, 9);

export const useSequencerState = () => {
    // History State
    const [tracks, setTracks] = useState<SequencerTrack[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [history, setHistory] = useState<SequencerTrack[][]>([]);
    const [future, setFuture] = useState<SequencerTrack[][]>([]);

    const saveHistory = useCallback(() => {
        setHistory(prev => [...prev, tracks]);
        setFuture([]);
    }, [tracks]);

    const handleUndo = useCallback(() => {
        setHistory(prev => {
            if (prev.length === 0) return prev;
            const newHistory = [...prev];
            const previousTracks = newHistory.pop();
            setFuture(f => [tracks, ...f]);
            setTracks(previousTracks!);
            return newHistory;
        });
    }, [tracks]);

    const handleRedo = useCallback(() => {
        setFuture(prev => {
            if (prev.length === 0) return prev;
            const newFuture = [...prev];
            const nextTracks = newFuture.shift();
            setHistory(h => [...h, tracks]);
            setTracks(nextTracks!);
            return newFuture;
        });
    }, [tracks]);

    const addTrack = useCallback((targetNodeId: string, name: string, color = '#007acc') => {
        if (tracks.find(t => t.targetNodeId === targetNodeId)) return;
        saveHistory();
        setTracks(prev => {
            const newTrack: SequencerTrack = {
                id: generateId(),
                targetNodeId,
                name,
                color,
                steps: 16,
                notes: [],
                isMuted: false,
                isSolo: false
            };
            return [...prev, newTrack];
        });
    }, [tracks, saveHistory]);

    const removeTrack = useCallback((targetNodeId: string) => {
        if (!tracks.find(t => t.targetNodeId === targetNodeId)) return;
        saveHistory();
        setTracks(prev => prev.filter(t => t.targetNodeId !== targetNodeId));
    }, [tracks, saveHistory]);

    const updateTrackName = useCallback((targetNodeId: string, name: string) => {
        const track = tracks.find(t => t.targetNodeId === targetNodeId);
        if (!track || track.name === name) return;

        saveHistory();
        setTracks(prev => prev.map(t =>
            t.targetNodeId === targetNodeId ? { ...t, name } : t
        ));
    }, [tracks, saveHistory]);

    const toggleStep = useCallback((trackId: string, step: number, note?: number) => {
        // Toggle always changes state if track exists
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        console.log('[useSequencerState] toggleStep', { trackId, step, note });

        saveHistory();
        setTracks(prev => prev.map(t => {
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
        }));
    }, [tracks, saveHistory]);

    // notePitch identifies WHICH note on the step to edit — without it, a
    // chord could only ever have its first note addressed, and the cleanup
    // below deleted every sibling on the step (the "Snap to Scale destroys
    // chords" bug).
    const updateNote = useCallback((trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;

        saveHistory();
        setTracks(prev => prev.map(t => {
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
                return true;
            });

            return {
                ...t,
                notes: [...cleanedNotes, updatedNote].sort((a, b) => a.step - b.step)
            };
        }));
    }, [tracks, saveHistory]);

    const toggleMute = useCallback((trackId: string) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        saveHistory();
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
        ));
    }, [tracks, saveHistory]);

    const toggleSolo = useCallback((trackId: string) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        saveHistory();
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
        ));
    }, [tracks, saveHistory]);

    const loadTracks = useCallback((newTracks: SequencerTrack[]) => {
        saveHistory();
        setTracks(newTracks);
    }, [saveHistory]);

    const updateTrackSteps = useCallback((trackId: string, steps: number) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track || track.steps === steps) return;
        saveHistory();
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, steps } : t
        ));
    }, [tracks, saveHistory]);

    return useMemo(() => ({
        tracks,
        currentStep,
        setCurrentStep,
        addTrack,
        removeTrack,
        updateTrackName,
        updateTrackSteps,
        toggleStep,
        toggleMute,
        toggleSolo,
        loadTracks,
        updateNote,
        handleUndo,
        handleRedo
    }), [
        tracks,
        currentStep,
        addTrack,
        removeTrack,
        updateTrackName,
        updateTrackSteps,
        toggleStep,
        toggleMute,
        toggleSolo,
        loadTracks,
        updateNote,
        handleUndo,
        handleRedo
    ]);
};
