import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ReverbNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private convolver: ConvolverNode;
    private wet: GainNode;
    private dry: GainNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.input = context.createGain();
        this.output = context.createGain();
        this.convolver = context.createConvolver();
        this.wet = context.createGain();
        this.dry = context.createGain();

        const mix = data.mix ?? 0.5;
        this.wet.gain.setValueAtTime(mix, context.currentTime);
        this.dry.gain.setValueAtTime(1.0 - mix, context.currentTime);

        const sampleRate = context.sampleRate;
        const length = sampleRate * 2;
        const impulse = context.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = (Math.random() * 2 - 1);
            impulseL[i] = n * Math.pow(1 - i / length, 2);
            impulseR[i] = n * Math.pow(1 - i / length, 2);
        }
        this.convolver.buffer = impulse;

        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.convolver);
        this.convolver.connect(this.wet);
        this.wet.connect(this.output);
    }

    update(data: any): void {
        if (data.mix !== undefined) {
            this.wet.gain.setValueAtTime(data.mix, this.context.currentTime);
            this.dry.gain.setValueAtTime(1.0 - data.mix, this.context.currentTime);
        }
    }
}

export const createReverbNode = (context: AudioContext, node: Node): AudioNode => {
    const reverbNodeInstance = new ReverbNode(context, node.data);
    
    const inputNode = reverbNodeInstance.input as any;
    inputNode._skaldNode = reverbNodeInstance;
    
    inputNode.output = reverbNodeInstance.output;

    return inputNode;
};
