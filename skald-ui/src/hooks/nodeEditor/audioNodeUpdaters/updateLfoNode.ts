import { convertBpmToSeconds } from '../audioNodeUtils';
import type { AdsrDataMap } from '../types';

export const updateLfoNode = (liveNode: AudioNode, data: any, context: AudioContext, bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof GainNode) {
        const compositeNode = liveNode as any;
        if (!compositeNode.internalNodes) return;
        const { lfo } = compositeNode.internalNodes;

        const now = context.currentTime;
        const rampTime = 0.02;

        if (data.sync) {
            const timeInSeconds = convertBpmToSeconds(bpm, data.noteDivision || '1/4');
            const frequency = timeInSeconds > 0 ? 1 / timeInSeconds : 0;
            lfo.frequency.setTargetAtTime(frequency, now, rampTime);
        } else {
            if (data.frequency !== undefined) lfo.frequency.setTargetAtTime(data.frequency, now, rampTime);
        }
        
        if (data.amplitude !== undefined) liveNode.gain.setTargetAtTime(data.amplitude, now, rampTime);
    }
};
