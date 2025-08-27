import type { AdsrDataMap } from '../types';

export const updateSampleHoldNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof AudioWorkletNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if (data.rate !== undefined) {
            liveNode.parameters.get('rate')?.setTargetAtTime(data.rate, now, rampTime);
        }
    }
};
