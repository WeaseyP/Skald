import { useRef, useCallback, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { Instrument } from './instrument';
import type { AdsrDataMap } from './types';

// Simplified map for AudioNodes
type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useSequencer = (
    bpm: number,
    isLooping: boolean,
    isPlaying: boolean,
    audioContext: React.MutableRefObject<AudioContext | null>,
    adsrNodes: React.MutableRefObject<AdsrDataMap>,
    audioNodes: React.MutableRefObject<AudioNodeMap>
) => {
    // Lookahead Scheduler Configuration
    const lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
    const scheduleAheadTime = 0.1; // How far ahead to schedule audio (in seconds)

    const nextNoteTime = useRef<number>(0);
    const timerID = useRef<NodeJS.Timeout | null>(null);

    // Schedule a note at a specific time
    const scheduleNote = useCallback((time: number) => {
        if (!audioContext.current) return;
        const noteDuration = (60 / bpm) * 4 * 0.8; // Duration logic

        // Trigger global ADSRs
        adsrNodes.current.forEach(({ worklet }) => {
            const gateParam = worklet.parameters.get('gate');
            if (gateParam) {
                gateParam.cancelScheduledValues(time);
                gateParam.setValueAtTime(1, time);
                gateParam.setValueAtTime(0, time + noteDuration);
            }
        });

        // Trigger Instruments
        audioNodes.current.forEach((node) => {
            if (node instanceof Instrument) {
                // Instrument trigger logic modified to support scheduling.
                // Cast to any to check if trigger accepts time.
                 (node as any).trigger(time);
                 (node as any).release(time + noteDuration);
            }
        });
    }, [bpm, adsrNodes, audioNodes, audioContext]);

    const scheduler = useCallback(() => {
        if (!audioContext.current) return;
        // while there are notes that will need to play before the next interval,
        // schedule them and advance the pointer.
        while (nextNoteTime.current < audioContext.current.currentTime + scheduleAheadTime) {
            scheduleNote(nextNoteTime.current);
            nextNoteTime.current += (60.0 / bpm) * 4; // Advance by 1 bar
        }
        timerID.current = setTimeout(scheduler, lookahead);
    }, [bpm, scheduleNote, audioContext]);

    const startSequencer = useCallback(() => {
        logger.info('Sequencer', 'Starting sequencer', { bpm, isLooping });
        if (timerID.current) clearTimeout(timerID.current);

        if (audioContext.current) {
            // Start slightly in the future to avoid immediate glitches
            nextNoteTime.current = audioContext.current.currentTime + 0.05;
            scheduler();
        }
    }, [bpm, isLooping, audioContext, scheduler]);

    const stopSequencer = () => {
        logger.info('Sequencer', 'Stopping sequencer');
        if (timerID.current) {
            clearTimeout(timerID.current);
            timerID.current = null;
        }
    };

    useEffect(() => {
        if (isPlaying) {
            startSequencer();
        } else {
            stopSequencer();
        }
        return stopSequencer;
    }, [isPlaying, isLooping, startSequencer]);
};
