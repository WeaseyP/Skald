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

        current16thNote.current++;
        if (current16thNote.current === 16) {
            logger.info('SequencerEngine', 'Loop boundary reached', { isLooping });
            if (isLooping) {
                current16thNote.current = 0;
                logger.info('SequencerEngine', 'Looping back to 0');
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
    }, [bpm, isLooping, onComplete]);

    const scheduleNote = useCallback((stepNumber: number, time: number) => {
        // Update UI (this might be jittery if done directly, usually we use requestAnimationFrame for UI
        // but for now we just call the setter. To avoid React state spam, we might want to throttle or use a ref)
        // For simplicity in Phase 14, we just set it. 
        // Note: 'time' is in the future. We can't update UI in future. 
        // We update UI "around" now. 
        // A common trick is to use `draw` loop for UI. 
        // Here we'll just set it.
        // PERF WARNING: This runs in the audio lookahead loop.

        // Actually, for UI sync, it's better to update it "now".
        // Let's defer currentStep update? 
        // Or just let it be slightly ahead/off?
        // Let's use a specialized scheduler for UI or just accept it updates when scheduled.
        // Ideally we sync UI to audio time in a rAF loop, but that requires checking context.currentTime.

        // For now: Just update state. It will be slightly ahead (up to 100ms).
        setCurrentStep(stepNumber);

        if (stepNumber === 0) {
            const activeNotes = sequencerTracks.map(t => `${t.name}: ${t.notes.length} notes`).join(', ');
            logger.debug('SequencerEngine', `Bar Start. Tracks: ${activeNotes}`);
        }

        if (!audioNodesRef.current) return;

        // Iterate tracks
        sequencerTracks.forEach(track => {
            if (track.isMuted) return;

            // Check for note at this step
            const noteEvent = track.notes.find(n => n.step === stepNumber);
            if (noteEvent) {
                logger.debug('SequencerEngine', `Triggering note on ${track.name} at step ${stepNumber}`);
                const targetNode = audioNodesRef.current.get(track.targetNodeId);
                if (targetNode && targetNode instanceof Instrument) {
                    // Calculate step duration
                    const secondsPerBeat = 60.0 / bpm;
                    const stepDuration = 0.25 * secondsPerBeat;

                    // Tie Logic: Check if next step is active on this track
                    // Note: We need to handle the loop wrap-around carefully. 
                    // If we are at step 15, next is 0. If loop is enabled, we check 0.
                    // If loop is NOT enabled, there is no next step after 15 (or max steps).
                    // Assuming 16 steps for now based on context usage. 
                    // Ideally we use track.steps if available, but for now hardcoded 16 or current wrap logic is 16.
                    const MAX_STEPS = 16;
                    const nextStep = (stepNumber + 1) % MAX_STEPS;

                    // Only tie if we are not at end, or if we ARE looping and at end
                    // Actually simple check: Is there a note at nextStep?
                    let isTied = false;
                    if (isLooping || stepNumber < MAX_STEPS - 1) {
                        isTied = track.notes.some(n => n.step === nextStep);
                    }

                    const voiceIndex = targetNode.trigger(time, noteEvent.note, noteEvent.velocity);

                    if (!isTied) {
                        // Schedule gate off at end of step
                        // To allow small release tails without clicking, we might want exact time.
                        targetNode.releaseVoice(voiceIndex, time + stepDuration);
                    }
                }
            }
        });

    }, [sequencerTracks, setCurrentStep]); // audioNodesRef is ref

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
