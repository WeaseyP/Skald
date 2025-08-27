import type { AdsrDataMap } from '../types';

export const updateMixerNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    const compositeNode = liveNode as any;
    if (!compositeNode.inputGains) return;

    const now = context.currentTime;
    const rampTime = 0.02;

    if (data.gain !== undefined) {
        compositeNode.gain.setTargetAtTime(data.gain, now, rampTime);
    }

    for (const key in data) {
        if (key.startsWith('input_') && key.endsWith('_gain')) {
            const handle = key.substring(0, key.length - 5);
            const inputGainNode = compositeNode.inputGains.get(handle);
            if (inputGainNode) {
                inputGainNode.gain.setTargetAtTime(data[key], now, rampTime);
            }
        }
    }
};
