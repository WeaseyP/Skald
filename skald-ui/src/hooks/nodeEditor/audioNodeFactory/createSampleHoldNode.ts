import { Node } from 'reactflow';

export const createSampleHoldNode = (context: AudioContext, node: Node): AudioNode => {
    const shNode = new AudioWorkletNode(context, 'sample-hold-processor');
    shNode.parameters.get('rate')?.setValueAtTime(node.data.rate ?? 10.0, context.currentTime);
    return shNode;
};
