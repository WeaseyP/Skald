import { Node } from 'reactflow';
import type { AdsrDataMap } from '../types';

export const createAdsrNode = (context: AudioContext, node: Node, adsrDataMap: AdsrDataMap): AudioNode => {
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, context.currentTime);
    adsrDataMap.set(node.id, { gainNode, data: node.data });
    return gainNode;
};
