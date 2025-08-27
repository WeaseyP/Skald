import { Node } from 'reactflow';

export const createWavetableNode = (context: AudioContext, node: Node): AudioNode => {
    const wtNode = new AudioWorkletNode(context, 'wavetable-processor');
    wtNode.parameters.get('frequency')?.setValueAtTime(node.data.frequency || 440, context.currentTime);
    wtNode.parameters.get('position')?.setValueAtTime(node.data.position || 0, context.currentTime);
    return wtNode;
};
