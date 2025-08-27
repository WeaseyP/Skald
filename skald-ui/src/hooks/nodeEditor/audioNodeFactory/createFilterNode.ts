import { Node } from 'reactflow';

export const createFilterNode = (context: AudioContext, node: Node): AudioNode => {
    const filter = context.createBiquadFilter();
    filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
    filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
    filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);
    return filter;
};
