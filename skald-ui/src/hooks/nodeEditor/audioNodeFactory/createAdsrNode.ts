import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ADSRNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    public gate: AudioNode; // The gate input is the first input of the worklet itself.
    private context: AudioContext;
    private timeConstant = 0.02; // Time constant for smooth parameter changes
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);

        this.output = new AudioWorkletNode(context, 'adsr-processor');
        this.gate = this.output;
        
        this.update(data);
    }

    update(data: any, options?: { bpm?: number }): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;
        this.output.parameters.get('attack')?.setTargetAtTime(data.attack ?? 0.1, now, this.timeConstant);
        this.output.parameters.get('decay')?.setTargetAtTime(data.decay ?? 0.1, now, this.timeConstant);
        this.output.parameters.get('sustain')?.setTargetAtTime(data.sustain ?? 0.5, now, this.timeConstant);
        this.output.parameters.get('release')?.setTargetAtTime(data.release ?? 0.5, now, this.timeConstant);
        this.output.parameters.get('depth')?.setTargetAtTime(data.depth ?? 1.0, now, this.timeConstant);
        this.output.parameters.get('velocitySensitivity')?.setTargetAtTime(data.velocitySensitivity ?? 0.5, now, this.timeConstant);
    }
    
    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        // Any input to an ADSR node is treated as a gate signal for the worklet.
        // The `gate` property is the worklet node itself.
        sourceNode.connect(this.gate);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            sourceNode.disconnect(this.gate);
        } catch (e) {
            // Ignore errors from disconnecting non-connected nodes.
        }
    }
}

export const createAdsrNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new ADSRNode(context, node.id, node.type, node.data);
    
    // The ADSR node's primary output is the envelope signal.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;
    // The 'gate' property is the node to connect gate signals to.
    outputNode.gate = instance.gate;

    return outputNode;
};
