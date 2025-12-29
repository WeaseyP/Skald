import { useState, useCallback } from 'react';
import { SequencerTrack, NoteEvent, SequencerState } from '../../definitions/types';
// Helper to generate a unique ID if uuid not available
const generateId = () => Math.random().toString(36).substr(2, 9);

export const useSequencerState = () => {
    const [tracks, setTracks] = useState<SequencerTrack[]>([]);
    const [currentStep, setCurrentStep] = useState(0);

    const addTrack = useCallback((targetNodeId: string, name: string, color: string = '#007acc') => {
        setTracks(prev => {
            if (prev.find(t => t.targetNodeId === targetNodeId)) return prev;

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
    }, []);

    const removeTrack = useCallback((targetNodeId: string) => {
        setTracks(prev => prev.filter(t => t.targetNodeId !== targetNodeId));
    }, []);

    const updateTrackName = useCallback((targetNodeId: string, name: string) => {
        setTracks(prev => {
            const track = prev.find(t => t.targetNodeId === targetNodeId);
            if (track && track.name === name) return prev; // No change

            return prev.map(t =>
                t.targetNodeId === targetNodeId ? { ...t, name } : t
            );
        });
    }, []);

    const toggleStep = useCallback((trackId: string, step: number) => {
        setTracks(prev => prev.map(t => {
            if (t.id !== trackId) return t;

            const existingNoteIndex = t.notes.findIndex(n => n.step === step);
            if (existingNoteIndex >= 0) {
                // Remove note
                return {
                    ...t,
                    notes: t.notes.filter((_, i) => i !== existingNoteIndex)
                };
            } else {
                // Add note (C4 default)
                const newNote: NoteEvent = {
                    step,
                    note: 60,
                    velocity: 1.0,
                    duration: 1
                };
                return {
                    ...t,
                    notes: [...t.notes, newNote]
                };
            }
        }));
    }, []);

    const toggleMute = useCallback((trackId: string) => {
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
        ));
    }, []);

    const toggleSolo = useCallback((trackId: string) => {
        setTracks(prev => prev.map(t =>
            t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
        ));
    }, []);

    const loadTracks = useCallback((newTracks: SequencerTrack[]) => {
        setTracks(newTracks);
    }, []);

    return {
        tracks,
        currentStep,
        setCurrentStep,
        addTrack,
        removeTrack,
        updateTrackName,
        toggleStep,
        toggleMute,
        toggleSolo,
        loadTracks
    };
};
