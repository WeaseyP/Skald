import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class OutputNode extends BaseSkaldNode {
    public input: GainNode;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string) {
        super();
        this.id = id;
        this.type = type;
        console.log(`[Skald Debug][${type}] Node created with ID: ${id}`);
        this.input = context.createGain();
        this.input.connect(context.destination);
    }

    update(data: any): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        // The master output node might have a gain control in the future.
        if (data.gain !== undefined) {
            this.input.gain.value = data.gain;
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        sourceNode.connect(this.input);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            sourceNode.disconnect(this.input);
        } catch (e) {
            // Ignore errors
        }
    }
}

export const createOutputNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new OutputNode(context, node.id, node.type);
    const inputNode = instance.input as any;
    inputNode._skaldNode = instance;
    return inputNode;
};
