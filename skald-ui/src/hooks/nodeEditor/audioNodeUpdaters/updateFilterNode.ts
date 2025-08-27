import type { AdsrDataMap } from '../types';

export const updateFilterNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof BiquadFilterNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if (data.cutoff !== undefined) liveNode.frequency.setTargetAtTime(data.cutoff, now, rampTime);
        if (data.resonance !== undefined) liveNode.Q.setTargetAtTime(data.resonance, now, rampTime);
    }
};
