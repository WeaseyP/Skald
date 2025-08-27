import type { AdsrDataMap } from '../types';

export const updateReverbNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    const compositeNode = liveNode as any;
    if (!compositeNode.internalNodes) return;
    const { wet, dry } = compositeNode.internalNodes;
    if (data.mix !== undefined) {
        const now = context.currentTime;
        const rampTime = 0.02;
        wet.gain.setTargetAtTime(data.mix, now, rampTime);
        dry.gain.setTargetAtTime(1.0 - data.mix, now, rampTime);
    }
};
