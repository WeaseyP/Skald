import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';
import { AdsrParams } from '../../../definitions/types';

class ADSRNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    public gate: AudioNode; // The gate input is the first input of the worklet itself.
    private context: AudioContext;

    constructor(context: AudioContext, data: AdsrParams) {
        super();
        this.context = context;
        
        this.output = new AudioWorkletNode(context, 'adsr-processor');
        this.gate = this.output;
        
        this.update(data);
    }

    update(data: AdsrParams): void {
        this.output.parameters.get('attack')?.setValueAtTime(data.attack ?? 0.1, this.context.currentTime);
        this.output.parameters.get('decay')?.setValueAtTime(data.decay ?? 0.1, this.context.currentTime);
        this.output.parameters.get('sustain')?.setValueAtTime(data.sustain ?? 0.5, this.context.currentTime);
        this.output.parameters.get('release')?.setValueAtTime(data.release ?? 0.5, this.context.currentTime);
        this.output.parameters.get('depth')?.setValueAtTime(data.depth ?? 1.0, this.context.currentTime);
        this.output.parameters.get('loop')?.setValueAtTime(data.loop ? 1 : 0, this.context.currentTime);
    }
}

export const createAdsrNode = (context: AudioContext, node: Node, adsrDataMap: Map<string, any>): AudioNode => {
    const instance = new ADSRNode(context, node.data as AdsrParams);
    
    // Store the node instance for sequencer access if needed
    adsrDataMap.set(node.id, {
      node: instance.output,
      gateOn: false,
    });
    
    // The ADSR node's primary output is the envelope signal.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;
    // The 'gate' property is the node to connect gate signals to.
    outputNode.gate = instance.gate;

    return outputNode;
};
