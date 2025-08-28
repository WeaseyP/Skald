import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class SampleHoldNode extends BaseSkaldNode {
    public output: GainNode;
    private worklet: AudioWorkletNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.output = context.createGain();
        this.worklet = new AudioWorkletNode(context, 'sample-hold-processor');

        this.worklet.connect(this.output);
        
        this.update(data);
    }

    update(data: any): void {
        if (data.rate !== undefined) {
            this.worklet.parameters.get('rate')?.setValueAtTime(data.rate, this.context.currentTime);
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }
    }
}

export const createSampleHoldNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new SampleHoldNode(context, node.data);
    
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    return outputNode;
};
