import type { AdsrDataMap } from '../types';

export const updateFmOperatorNode = (liveNode: AudioNode, data: any, context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    const compositeNode = liveNode as any;
    if (!compositeNode.internalNodes) return;
    const { carrier, modulator, modulationIndex } = compositeNode.internalNodes;
    const now = context.currentTime;
    const rampTime = 0.02;

    if (data.frequency !== undefined) carrier.frequency.setTargetAtTime(data.frequency, now, rampTime);
    if (data.modulatorFrequency !== undefined) modulator.frequency.setTargetAtTime(data.modulatorFrequency, now, rampTime);
    if (data.modulationIndex !== undefined) modulationIndex.gain.setTargetAtTime(data.modulationIndex, now, rampTime);
    if (data.gain !== undefined) compositeNode.gain.setTargetAtTime(data.gain, now, rampTime);
};
