import { convertBpmToSeconds } from '../audioNodeUtils';
import type { AdsrDataMap } from '../types';

export const updateDelayNode = (liveNode: AudioNode, data: any, context: AudioContext, bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    const compositeNode = liveNode as any;
    if (!compositeNode.internalNodes) return;
    const { delay, feedback, wet, dry } = compositeNode.internalNodes;

    const now = context.currentTime;
    const rampTime = 0.02;

    if (data.sync) {
        const timeInSeconds = convertBpmToSeconds(bpm, data.noteDivision || '1/8');
        delay.delayTime.setTargetAtTime(timeInSeconds, now, rampTime);
    } else {
        if (data.delayTime !== undefined) delay.delayTime.setTargetAtTime(data.delayTime, now, rampTime);
    }

    if (data.feedback !== undefined) feedback.gain.setTargetAtTime(data.feedback, now, rampTime);
    if (data.mix !== undefined) {
        wet.gain.setTargetAtTime(data.mix, now, rampTime);
        dry.gain.setTargetAtTime(1.0 - data.mix, now, rampTime);
    }
};
