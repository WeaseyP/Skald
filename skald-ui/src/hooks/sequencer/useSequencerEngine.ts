import { useRef, useEffect, useCallback } from 'react';
import { SequencerTrack } from '../../definitions/types';
import { AudioNodeMap } from '../../hooks/nodeEditor/types';
import { Instrument } from '../../hooks/nodeEditor/instrument';
import { logger } from '../../utils/logger';

export const useSequencerEngine = (
    isPlaying: boolean,
    bpm: number,
    sequencerTracks: SequencerTrack[],
    audioContextRef: React.MutableRefObject<AudioContext | null>,
    audioNodesRef: React.MutableRefObject<AudioNodeMap>,
    setCurrentStep: (step: number) => void, // Callback to update UI
    isLooping: boolean,
    onComplete: () => void
) => {
    // Scheduling constants
    const LOOKAHEAD_MS = 25.0; // How frequently to call scheduling function (in milliseconds)
    const SCHEDULE_AHEAD_TIME_SEC = 0.1; // How far ahead to schedule audio (in seconds)

    const nextNoteTime = useRef<number>(0.0);
    const current16thNote = useRef<number>(0); // 0-15
    const timerID = useRef<NodeJS.Timeout | null>(null);

    // Advance to the next 16th note
    const nextNote = useCallback(() => {
        const secondsPerBeat = 60.0 / bpm;
        // 1/16th note = 0.25 of a beat
        nextNoteTime.current += 0.25 * secondsPerBeat;

        const maxSteps = Math.max(16, ...sequencerTracks.map(t => t.steps || 16));

        current16thNote.current++;
        if (current16thNote.current >= maxSteps) {
            logger.info('SequencerEngine', 'Loop boundary reached', { isLooping, maxSteps });
            if (isLooping) {
                current16thNote.current = 0;
            } else {
                logger.info('SequencerEngine', 'Sequence complete. Stopping.');
                // Stop playback
                if (timerID.current) {
                    clearInterval(timerID.current);
                    timerID.current = null;
                }
                onComplete();
            }
        }
    }, [bpm, isLooping, onComplete, sequencerTracks]);

    const scheduleNote = useCallback((stepNumber: number, time: number) => {
        // Update UI logic...
        setCurrentStep(stepNumber);

        if (stepNumber === 0) {
            const activeNotes = sequencerTracks.map(t => `${t.name}: ${t.notes.length} notes`).join(', ');
            logger.debug('SequencerEngine', `Bar Start. Tracks: ${activeNotes}`);
        }

        if (!audioNodesRef.current) return;

        // Iterate tracks
        sequencerTracks.forEach(track => {
            if (track.isMuted) return;

            const trackSteps = track.steps || 16;
            // Polyrhythm: wrap the global step number to the track's length
            const localStep = stepNumber % trackSteps;

            // Check for note at this LOCAL step
            const noteEvent = track.notes.find(n => n.step === localStep);

            if (noteEvent) {
                // logger.debug('SequencerEngine', `Triggering note on ${track.name} at step ${stepNumber} (local ${localStep})`);
                const targetNode = audioNodesRef.current.get(track.targetNodeId);
                if (targetNode && targetNode instanceof Instrument) {
                    // Calculate step duration
                    const secondsPerBeat = 60.0 / bpm;
                    const stepDuration = 0.25 * secondsPerBeat;

                    // Tie Logic: Check if next step has a note
                    // For polyrhythms, next local step
                    const nextLocalStep = (localStep + 1) % trackSteps;

                    const voiceIndex = targetNode.trigger(time, noteEvent.note, noteEvent.velocity);

                    // Schedule gate off at end of note duration
                    const durationInSteps = noteEvent.duration || 1;
                    targetNode.releaseVoice(voiceIndex, time + (stepDuration * durationInSteps));
                }
            }
        });

    }, [sequencerTracks, setCurrentStep, bpm]); // Added bpm dependency

    const scheduler = useCallback(() => {
        if (!audioContextRef.current) return;

        // While there are notes that will need to play before the next interval, schedule them and advance the pointer.
        while (nextNoteTime.current < audioContextRef.current.currentTime + SCHEDULE_AHEAD_TIME_SEC) {
            scheduleNote(current16thNote.current, nextNoteTime.current);
            nextNote();
        }

    }, [scheduleNote, nextNote]);

    // Reset state on start
    useEffect(() => {
        if (isPlaying && audioContextRef.current) {
            current16thNote.current = 0;
            nextNoteTime.current = audioContextRef.current.currentTime + 0.1;
            logger.info('SequencerEngine', 'Playback started', { bpm, nextNoteTime: nextNoteTime.current });
        }
    }, [isPlaying]);

    // Manage scheduler interval
    useEffect(() => {
        if (isPlaying) {
            logger.debug('SequencerEngine', 'Starting scheduler interval');
            timerID.current = setInterval(scheduler, LOOKAHEAD_MS);
        }

        return () => {
            if (timerID.current) {
                clearInterval(timerID.current);
                timerID.current = null;
            }
        };
    }, [isPlaying, scheduler]);
};
