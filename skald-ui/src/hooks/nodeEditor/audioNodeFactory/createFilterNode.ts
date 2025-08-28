import { Node } from 'reactflow';

export const createFilterNode = (context: AudioContext, node: Node): AudioNode => {
    const filter = context.createBiquadFilter();
    filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
    filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
    filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);

    (filter as any).update = (data: any) => {
        if (data.type) {
            filter.type = data.type.toLowerCase() as BiquadFilterType;
        }
        if (data.cutoff !== undefined) {
            filter.frequency.setValueAtTime(data.cutoff, context.currentTime);
        }
        if (data.resonance !== undefined) {
            filter.Q.setValueAtTime(data.resonance, context.currentTime);
        }
    };
    
    return filter;
};
