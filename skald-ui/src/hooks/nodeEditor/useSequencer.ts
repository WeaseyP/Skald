import { useCallback, useEffect, useRef } from 'react';
import { Instrument } from './instrument';
import { AdsrDataMap } from './types';
import { AdsrParams } from '../../definitions/types';

const noteOn = (gainNode: GainNode, data: Partial<AdsrParams>, startTime: number) => {
    if (!data) return;
    const { attack = 0.1, decay = 0.2, sustain = 0.5 } = data;
    gainNode.gain.cancelScheduledValues(startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
    gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
};

const noteOff = (gainNode: GainNode, data: Partial<AdsrParams>, releaseTime: number) => {
    if (!data) return;
    const { release = 0.5 } = data;
    // Before scheduling the release, cancel any pending changes and set the current gain value.
    gainNode.gain.cancelScheduledValues(releaseTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, releaseTime);
    gainNode.gain.linearRampToValueAtTime(0, releaseTime + release);
};

export const useSequencer = (
    bpm: number,
    isLooping: boolean,
    isPlaying: boolean,
    audioContext: React.MutableRefObject<AudioContext | null>,
    adsrNodes: React.MutableRefObject<AdsrDataMap>,
    audioNodes: React.MutableRefObject<Map<string, AudioNode | Instrument>>
) => {
    const loopIntervalId = useRef<NodeJS.Timeout | null>(null);
    const noteOffTimeoutIds = useRef<NodeJS.Timeout[]>([]);

    const startSequencer = useCallback(() => {
        if (loopIntervalId.current) clearInterval(loopIntervalId.current);
        const loopDuration = (60 / bpm) * 4 * 1000; // 4 beats
        const noteDuration = loopDuration * 0.8; // Note will last for 80% of the loop

        const tick = () => {
            if (!audioContext.current) return;
            const now = audioContext.current.currentTime;
            
            // Clear any previous note-off timeouts
            noteOffTimeoutIds.current.forEach(clearTimeout);
            noteOffTimeoutIds.current = [];

            // Trigger global (non-instrument) ADSRs
            adsrNodes.current.forEach(({ gainNode, data }) => {
                noteOn(gainNode, data, now);

                const timeoutId = setTimeout(() => {
                    if (!audioContext.current) return;
                    noteOff(gainNode, data, audioContext.current.currentTime);
                }, noteDuration);
                noteOffTimeoutIds.current.push(timeoutId);
            });

            // Trigger all instruments
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.trigger();
                    const timeoutId = setTimeout(() => {
                        node.noteOff();
                    }, noteDuration);
                    noteOffTimeoutIds.current.push(timeoutId);
                }
            });
        };
        
        tick(); // Trigger immediately
        loopIntervalId.current = setInterval(tick, loopDuration);
    }, [bpm, audioContext, adsrNodes, audioNodes]);

    const stopSequencer = () => {
        if (loopIntervalId.current) {
            clearInterval(loopIntervalId.current);
            loopIntervalId.current = null;
        }
        noteOffTimeoutIds.current.forEach(clearTimeout);
        noteOffTimeoutIds.current = [];
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