import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';
import { AdsrParams } from '../../../definitions/types';
import { AdsrDataMap } from '../types';

class ADSRNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: AdsrParams) {
        super();
        this.context = context;

        this.output = new AudioWorkletNode(context, 'adsr-processor');

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

export const createAdsrNode = (context: AudioContext, node: Node, adsrDataMap: AdsrDataMap): AudioNode => {
    // 1. Create the VCA (Voltage Controlled Amplifier)
    // This allows audio to pass through and be shaped by the envelope.
    const vca = context.createGain();
    vca.gain.value = 0; // Start silent

    const data = node.data as AdsrParams;
    console.log(`[createAdsrNode] Creating ADSR ${node.id} with data:`, data);
    console.log(`[createAdsrNode] Sustain: ${data.sustain}`);

    // 2. Create the Envelope Generator (The Worklet)
    const instance = new ADSRNode(context, data);

    // 3. Connect Envelope -> VCA Gain
    // The worklet outputs the envelope signal (0-1) which controls the volume.
    instance.output.connect(vca.gain);

    // 4. Store the Worklet to be triggered by the Voice's Gate
    adsrDataMap.set(node.id, {
        worklet: instance.output,
    });

    // 5. Attach the helper for updates
    const outputNode = vca as any;
    outputNode._skaldNode = instance;

    // Return the VCA so that Audio connections in the graph flow through it.
    return outputNode;
};
