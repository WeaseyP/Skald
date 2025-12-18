import { useRef, useCallback, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { Instrument } from './instrument';
import type { AdsrDataMap } from './types';

// Simplified map for AudioNodes, just focusing on what we store
type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useSequencer = (
    bpm: number,
    isLooping: boolean,
    isPlaying: boolean,
    audioContext: React.MutableRefObject<AudioContext | null>,
    adsrNodes: React.MutableRefObject<AdsrDataMap>,
    audioNodes: React.MutableRefObject<AudioNodeMap>,
    graphVersion: number
) => {
    const loopIntervalId = useRef<NodeJS.Timeout | null>(null);
    const noteOffTimeoutIds = useRef<NodeJS.Timeout[]>([]);

    const noteOn = useCallback((worklet: AudioWorkletNode, startTime: number) => {
        const gateParam = worklet.parameters.get('gate');
        if (gateParam) {
            gateParam.setValueAtTime(1, startTime);
        }
    }, []);

    const noteOff = useCallback((worklet: AudioWorkletNode, endTime: number) => {
        const gateParam = worklet.parameters.get('gate');
        if (gateParam) {
            gateParam.setValueAtTime(0, endTime);
        }
    }, []);

    const startSequencer = useCallback(() => {
        logger.info('Sequencer', 'Starting sequencer', { bpm, isLooping });
        if (loopIntervalId.current) clearInterval(loopIntervalId.current);
        const loopDuration = (60 / bpm) * 4 * 1000; // 4 beats
        const noteDuration = loopDuration * 0.8; // Note will last for 80% of the loop

        const tick = () => {
            if (!audioContext.current) return;
            const now = audioContext.current.currentTime;
            logger.debug('Sequencer', 'Tick', { currentTime: now });

            // Clear any previous note-off timeouts
            noteOffTimeoutIds.current.forEach(clearTimeout);
            noteOffTimeoutIds.current = [];

            // Trigger global (non-instrument) ADSRs
            adsrNodes.current.forEach(({ worklet }, id) => {
                logger.debug('Sequencer', `Triggering ADSR Node ${id}`, { now });
                noteOn(worklet, now);

                const timeoutId = setTimeout(() => {
                    if (!audioContext.current) return;
                    noteOff(worklet, audioContext.current.currentTime);
                }, noteDuration);
                noteOffTimeoutIds.current.push(timeoutId);
            });

            // Trigger all instruments
            let instrumentCount = 0;
            audioNodes.current.forEach((node, id) => {
                if (node instanceof Instrument) {
                    instrumentCount++;
                    logger.debug('Sequencer', `Triggering Instrument ${id}`, { now });
                    node.trigger();
                    const timeoutId = setTimeout(() => {
                        node.noteOff();
                    }, noteDuration);
                    noteOffTimeoutIds.current.push(timeoutId);
                }
            });

            if (instrumentCount === 0) {
                logger.debug('Sequencer', 'Tick fired but no instruments found.');
            }
        };

        tick(); // Trigger immediately

        if (isLooping) {
            loopIntervalId.current = setInterval(tick, loopDuration);
        }
    }, [bpm, isLooping, audioContext, adsrNodes, audioNodes, graphVersion, noteOn, noteOff]);

    const stopSequencer = () => {
        logger.info('Sequencer', 'Stopping sequencer');
        if (loopIntervalId.current) {
            clearInterval(loopIntervalId.current);
            loopIntervalId.current = null;
        }
        noteOffTimeoutIds.current.forEach(clearTimeout);
        noteOffTimeoutIds.current = [];
    };

    useEffect(() => {
        logger.debug('Sequencer', 'Effect Change', { isPlaying, isLooping });
        if (isPlaying) {
            startSequencer();
        } else {
            stopSequencer();
        }
        return stopSequencer;
    }, [isPlaying, isLooping, startSequencer]);
};