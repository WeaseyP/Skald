import type { AdsrDataMap } from '../types';

export const updatePannerNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof StereoPannerNode) {
        const now = context.currentTime;
        const rampTime = 0.02;
        if (data.pan !== undefined) {
            liveNode.pan.setTargetAtTime(data.pan, now, rampTime);
        }
    }
};
