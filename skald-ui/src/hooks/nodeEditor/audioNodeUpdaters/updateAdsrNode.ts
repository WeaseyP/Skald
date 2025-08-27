import type { AdsrDataMap } from '../types';

export const updateAdsrNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, adsrData: AdsrDataMap, nodeId: string) => {
    if (liveNode instanceof GainNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if (data.amplitude !== undefined) liveNode.gain.setTargetAtTime(data.amplitude, now, rampTime);
        const adsr = adsrData.get(nodeId);
        if (adsr) adsr.data = { ...adsr.data, ...data };
    }
};
