import { useCallback, useEffect, useRef } from 'react';
import { Instrument } from './instrument';
import { AdsrDataMap } from './types';
import { AdsrParams } from '../../definitions/types';

const noteOn = (gainNode: GainNode, data: Partial<AdsrParams>, startTime: number) => {
    if (!data) return;
    console.log(`noteOn at ${startTime}`, data);
    const { attack = 0.1, decay = 0.2, sustain = 0.5 } = data;
    gainNode.gain.cancelScheduledValues(startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
    gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
};

const noteOff = (gainNode: GainNode, data: Partial<AdsrParams>, releaseTime: number) => {
    if (!data) return;
    console.log(`noteOff at ${releaseTime}`, data);
    const { release = 0.5 } = data;
    // This is the corrected implementation. It cancels pending ramps and starts the release ramp.
    // The Web Audio API correctly handles starting the ramp from the value the gain has at the scheduled releaseTime.
    gainNode.gain.cancelScheduledValues(releaseTime);
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

    const startSequencer = useCallback(() => {
        if (loopIntervalId.current) clearInterval(loopIntervalId.current);

        const loopDurationMs = (60 / bpm) * 4 * 1000; // 4 beats in ms for setInterval
        const noteDurationSec = ((60 / bpm) * 4) * 0.8; // note duration in seconds for Web Audio API

        const tick = () => {
            if (!audioContext.current) return;
            const now = audioContext.current.currentTime;
            const releaseTime = now + noteDurationSec;

            // Trigger global (non-instrument) ADSRs
            adsrNodes.current.forEach(({ gainNode, data }) => {
                noteOn(gainNode, data, now);
                noteOff(gainNode, data, releaseTime);
            });

            // Trigger all instruments
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.trigger(now);
                    node.noteOff(releaseTime);
                }
            });
        };
        
        tick(); // Trigger immediately
        loopIntervalId.current = setInterval(tick, loopDurationMs);
    }, [bpm, audioContext, adsrNodes, audioNodes]);

    const stopSequencer = () => {
        if (loopIntervalId.current) {
            clearInterval(loopIntervalId.current);
            loopIntervalId.current = null;
        }

        // Stop all sounds
        if (audioContext.current) {
            const now = audioContext.current.currentTime;
            const releaseTime = now + 0.1; // short release
            adsrNodes.current.forEach(({ gainNode, data }) => noteOff(gainNode, data, releaseTime));
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.noteOff(now);
                }
            });
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