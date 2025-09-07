import { useCallback, useEffect, useRef } from 'react';
import { Instrument } from './instrument';

// A more robust, sample-accurate sequencer using a lookahead scheduling pattern.

export const useSequencer = (
    bpm: number,
    isLooping: boolean,
    isPlaying: boolean,
    audioContext: React.RefObject<AudioContext | null>,
    audioNodes: React.RefObject<Map<string, AudioNode | Instrument>>
) => {
    const schedulerIntervalId = useRef<NodeJS.Timeout | null>(null);
    const nextNoteTime = useRef<number>(0);
    const scheduleAheadTime = 0.1; // How far ahead to schedule audio (in seconds)
    
    // --- Note Scheduling ---
    const scheduleNote = (noteTime: number, noteDuration: number) => {
        if (!audioContext.current) return;
        const context = audioContext.current;

        audioNodes.current.forEach(node => {
            if (node instanceof Instrument) {
                // Instruments have their own internal sequencers or trigger mechanisms.
                // For now, we'll assume they are triggered by a top-level sequence.
                // The .trigger() method would need to be updated to accept a time parameter.
                // node.trigger(noteTime); 
            } else if ((node as any).gate && (node as any).constructor.name === 'AudioWorkletNode') {
                // This is a standalone ADSR node, let's trigger it with proper duration
                const adsrGate = (node as any).gate;
                
                const trigger = new ConstantSourceNode(context, { offset: 0 });
                // Schedule the gate to go up at noteTime and down at noteTime + noteDuration
                trigger.offset.setValueAtTime(1, noteTime);
                trigger.offset.setValueAtTime(0, noteTime + noteDuration);
                trigger.connect(adsrGate);
                trigger.start(noteTime);
                // The trigger can be stopped shortly after the gate goes down.
                trigger.stop(noteTime + noteDuration + 0.1);
            }
        });
    };

    // --- Scheduler Loop ---
    const scheduler = useCallback(() => {
        if (!audioContext.current) return;
        const context = audioContext.current;

        while (nextNoteTime.current < context.currentTime + scheduleAheadTime) {
            // For this implementation, we'll create a simple 4/4 pattern of quarter notes.
            // This can be replaced with a more complex sequence later.
            const secondsPerBeat = 60.0 / bpm;
            const noteDuration = secondsPerBeat * 0.8; // Make notes slightly shorter than a full beat

            scheduleNote(nextNoteTime.current, noteDuration);
            
            // Advance the next note time
            nextNoteTime.current += secondsPerBeat;
        }
    }, [bpm, audioNodes]);

    // --- Sequencer Control ---
    const startSequencer = useCallback(() => {
        if (!audioContext.current) return;
        if (schedulerIntervalId.current) clearInterval(schedulerIntervalId.current);
        
        nextNoteTime.current = audioContext.current.currentTime;
        schedulerIntervalId.current = setInterval(scheduler, 25); // Run scheduler every 25ms
    }, [scheduler, audioContext]);

    const stopSequencer = () => {
        if (schedulerIntervalId.current) {
            clearInterval(schedulerIntervalId.current);
            schedulerIntervalId.current = null;
        }
    };

    useEffect(() => {
        if (isPlaying && isLooping) {
            startSequencer();
        } else {
            stopSequencer();
        }
        return stopSequencer;
    }, [isPlaying, isLooping, startSequencer]);
};
