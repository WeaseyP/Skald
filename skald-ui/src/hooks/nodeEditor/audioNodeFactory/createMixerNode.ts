import { Node } from 'reactflow';

export const createMixerNode = (context: AudioContext, node: Node): AudioNode => {
    const outputNode = context.createGain();
    outputNode.gain.setValueAtTime(node.data.gain ?? 1.0, context.currentTime);
    const compositeNode = outputNode as any;
    compositeNode.inputGains = new Map<string, GainNode>();
    return compositeNode;
};
