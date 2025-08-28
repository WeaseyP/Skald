import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FilterNode extends BaseSkaldNode {
    public node: BiquadFilterNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.node = context.createBiquadFilter();
        this.node.type = (data.type || 'lowpass').toLowerCase() as BiquadFilterType;
        this.node.frequency.setValueAtTime(data.cutoff || 800, context.currentTime);
        this.node.Q.setValueAtTime(data.resonance || 1.0, context.currentTime);
    }

    update(data: any): void {
        if (data.type) {
            this.node.type = data.type.toLowerCase() as BiquadFilterType;
        }
        if (data.cutoff !== undefined) {
            this.node.frequency.setValueAtTime(data.cutoff, this.context.currentTime);
        }
        if (data.resonance !== undefined) {
            this.node.Q.setValueAtTime(data.resonance, this.context.currentTime);
        }
    }
}

export const createFilterNode = (context: AudioContext, node: Node): AudioNode => {
    const filterNodeInstance = new FilterNode(context, node.data);
    
    const filterNode = filterNodeInstance.node as any;
    filterNode._skaldNode = filterNodeInstance;

    return filterNode;
};
