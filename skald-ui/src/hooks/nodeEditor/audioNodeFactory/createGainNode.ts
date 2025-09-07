import { Node } from 'reactflow';
import { BaseSkaldNode, SkaldNodeWithUpdate } from './BaseSkaldNode';

class GainNodeWrapper extends BaseSkaldNode {
    public node: GainNode;
    private context: AudioContext;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        this.node = context.createGain();
        this.update(data);
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);
    }

    update(data: any): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        if (data.gain !== undefined) {
            this.node.gain.setTargetAtTime(data.gain, this.context.currentTime, 0.02);
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        if (targetHandle === 'input_gain') {
            sourceNode.connect(this.node.gain);
        } else {
            sourceNode.connect(this.node);
        }
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            if (targetHandle === 'input_gain') {
                sourceNode.disconnect(this.node.gain);
            } else {
                sourceNode.disconnect(this.node);
            }
        } catch (e) {
            // Ignore errors from disconnecting non-connected nodes.
        }
    }
}

export const createGainNode = (context: AudioContext, node: Node): SkaldNodeWithUpdate => {
    const gainNodeInstance = new GainNodeWrapper(context, node.id, node.type || 'gain', node.data);
    const gainNode = gainNodeInstance.node as SkaldNodeWithUpdate;
    gainNode._skaldNode = gainNodeInstance;
    return gainNode;
};
