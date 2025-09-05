import { useCallback, useEffect, useRef } from 'react';
import { Instrument } from './instrument';

type AdsrDataMap = Map<string, { gainNode: GainNode; data: any }>;

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
            
            // Trigger all instruments
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.trigger();
                } else if ((node as any).gate && (node as any).constructor.name === 'AudioWorkletNode') {
                    // This is a standalone ADSR node, let's trigger it
                    const adsrGate = (node as any).gate;
                    const trigger = new ConstantSourceNode(audioContext.current!, { offset: 1 });
                    trigger.connect(adsrGate);
                    trigger.start(now);
                    trigger.stop(now + 0.1);
                }
            });
        };
        
        tick(); // Trigger immediately
        loopIntervalId.current = setInterval(tick, loopDuration);
    }, [bpm, audioContext, audioNodes]);

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
