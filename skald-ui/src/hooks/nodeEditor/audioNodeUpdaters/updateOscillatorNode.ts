import type { AdsrDataMap } from '../types';

export const updateOscillatorNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof OscillatorNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if (data.frequency !== undefined) liveNode.frequency.setTargetAtTime(data.frequency, now, rampTime);
    }
};
