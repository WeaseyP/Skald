import { useCallback, useEffect, useRef } from 'react';
import { Instrument } from './instrument';

type AdsrDataMap = Map<string, { gainNode: GainNode; data: any }>;

const triggerAdsr = (gainNode: GainNode, data: any, startTime: number) => {
    const { attack = 0.1, decay = 0.2, sustain = 0.5 } = data;
    gainNode.gain.cancelScheduledValues(startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
    gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
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
        const loopDuration = (60 / bpm) * 4 * 1000; // 4 beats

        const tick = () => {
            if (!audioContext.current) return;
            const now = audioContext.current.currentTime;
            
            // Trigger global (non-instrument) ADSRs
            adsrNodes.current.forEach(({ gainNode, data }) => {
                triggerAdsr(gainNode, data, now);
            });

            // Trigger all instruments
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.trigger();
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
