import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class PannerNode extends BaseSkaldNode {
    public node: StereoPannerNode;
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
        this.node = context.createStereoPanner();
        this.update(data);
    }

    update(data: any): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        if (data.pan !== undefined) {
            const now = this.context.currentTime;
            this.node.pan.setTargetAtTime(data.pan, now, this.timeConstant);
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
            // Ignore errors
        }
    }
}

export const createPannerNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new PannerNode(context, node.id, node.type, node.data);
    
    const pannerNode = instance.node as any;
    pannerNode._skaldNode = instance;

    return pannerNode;
};
