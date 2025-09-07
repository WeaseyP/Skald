import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ADSRNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    public gate: AudioNode; // The gate input is the first input of the worklet itself.
    private context: AudioContext;
    private timeConstant = 0.02; // Time constant for smooth parameter changes

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.output = new AudioWorkletNode(context, 'adsr-processor');
        this.gate = this.output;
        
        this.update(data);
    }

    update(data: any, options?: { bpm?: number }): void {
        const now = this.context.currentTime;
        this.output.parameters.get('attack')?.setTargetAtTime(data.attack ?? 0.1, now, this.timeConstant);
        this.output.parameters.get('decay')?.setTargetAtTime(data.decay ?? 0.1, now, this.timeConstant);
        this.output.parameters.get('sustain')?.setTargetAtTime(data.sustain ?? 0.5, now, this.timeConstant);
        this.output.parameters.get('release')?.setTargetAtTime(data.release ?? 0.5, now, this.timeConstant);
        this.output.parameters.get('depth')?.setTargetAtTime(data.depth ?? 1.0, now, this.timeConstant);
        this.output.parameters.get('velocitySensitivity')?.setTargetAtTime(data.velocitySensitivity ?? 0.5, now, this.timeConstant);
    }
    
    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        // Any input to an ADSR node is treated as a gate signal for the worklet.
        // The `gate` property is the worklet node itself.
        sourceNode.connect(this.gate);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        try {
            sourceNode.disconnect(this.gate);
        } catch (e) {
            // Ignore errors from disconnecting non-connected nodes.
        }
    }
}

export const createAdsrNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new ADSRNode(context, node.data);
    
    // The ADSR node's primary output is the envelope signal.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;
    // The 'gate' property is the node to connect gate signals to.
    outputNode.gate = instance.gate;

    return outputNode;
};
