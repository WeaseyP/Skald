import type { AdsrDataMap } from '../types';

export const updateWavetableNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof AudioWorkletNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if(data.frequency !== undefined) liveNode.parameters.get('frequency')?.setTargetAtTime(data.frequency, now, rampTime);
        if(data.position !== undefined) liveNode.parameters.get('position')?.setTargetAtTime(data.position, now, rampTime);
    }
};
