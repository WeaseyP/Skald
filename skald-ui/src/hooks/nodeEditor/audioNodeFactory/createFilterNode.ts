import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FilterNode extends BaseSkaldNode {
    public node: BiquadFilterNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);

        this.node = context.createBiquadFilter();
        
        // Initialize with new or old property names for backwards compatibility
        const initialFrequency = data.frequency ?? data.cutoff ?? 800;
        const initialQ = data.q ?? data.resonance ?? 1.0;
        const initialGain = data.gain ?? 0;
        const now = context.currentTime;

        this.node.type = (data.type || 'lowpass').toLowerCase() as BiquadFilterType;
        this.node.frequency.setTargetAtTime(initialFrequency, now, this.timeConstant);
        this.node.Q.setTargetAtTime(initialQ, now, this.timeConstant);
        this.node.gain.setTargetAtTime(initialGain, now, this.timeConstant);
    }

    update(data: any): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;
        if (data.type) {
            this.node.type = data.type.toLowerCase() as BiquadFilterType;
        }
        // Handle new property names first, with fallback to old names
        if (data.frequency !== undefined || data.cutoff !== undefined) {
            const frequency = data.frequency ?? data.cutoff;
            this.node.frequency.setTargetAtTime(frequency, now, this.timeConstant);
        }
        if (data.q !== undefined || data.resonance !== undefined) {
            const q = data.q ?? data.resonance;
            this.node.Q.setTargetAtTime(q, now, this.timeConstant);
        }
        if (data.gain !== undefined) {
            this.node.gain.setTargetAtTime(data.gain, now, this.timeConstant);
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        sourceNode.connect(this.node);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            sourceNode.disconnect(this.node);
        } catch (e) {
            // Ignore errors from disconnecting non-connected nodes.
        }
    }
}

export const createFilterNode = (context: AudioContext, node: Node): AudioNode => {
    const filterNodeInstance = new FilterNode(context, node.id, node.type, node.data);
    
    const filterNode = filterNodeInstance.node as any;
    filterNode._skaldNode = filterNodeInstance;

    return filterNode;
};
