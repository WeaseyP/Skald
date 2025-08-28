import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ADSRNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    public gate: AudioNode; // The gate input is the first input of the worklet itself.
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.output = new AudioWorkletNode(context, 'adsr-processor');
        this.gate = this.output;
        
        this.update(data);
    }

    update(data: any): void {
        this.output.parameters.get('attack')?.setValueAtTime(data.attack ?? 0.1, this.context.currentTime);
        this.output.parameters.get('decay')?.setValueAtTime(data.decay ?? 0.1, this.context.currentTime);
        this.output.parameters.get('sustain')?.setValueAtTime(data.sustain ?? 0.5, this.context.currentTime);
        this.output.parameters.get('release')?.setValueAtTime(data.release ?? 0.5, this.context.currentTime);
        this.output.parameters.get('depth')?.setValueAtTime(data.depth ?? 1.0, this.context.currentTime);
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
