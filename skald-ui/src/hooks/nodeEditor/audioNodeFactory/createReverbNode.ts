import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ReverbNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private convolver: ConvolverNode;
    private wet: GainNode;
    private dry: GainNode;
    private preDelay: DelayNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.input = context.createGain();
        this.output = context.createGain();
        this.convolver = context.createConvolver();
        this.wet = context.createGain();
        this.dry = context.createGain();
        this.preDelay = context.createDelay(1.0); // Max pre-delay of 1s

        const { mix = 0.5, preDelay = 0.0, decay = 2.0 } = data;

        this.wet.gain.setValueAtTime(mix, context.currentTime);
        this.dry.gain.setValueAtTime(1.0 - mix, context.currentTime);
        this.preDelay.delayTime.setValueAtTime(preDelay, context.currentTime);

        this._generateImpulse(decay);

        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.preDelay);
        this.preDelay.connect(this.convolver);
        this.convolver.connect(this.wet);
        this.wet.connect(this.output);
    }

    private _generateImpulse(decayTime: number) {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * Math.max(0.01, decayTime); // Ensure length is not zero
        const impulse = this.context.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = (Math.random() * 2 - 1);
            // Using an exponential decay
            impulseL[i] = n * Math.pow(1 - i / length, 2);
            impulseR[i] = n * Math.pow(1 - i / length, 2);
        }
        this.convolver.buffer = impulse;
    }

    update(data: any): void {
        if (data.mix !== undefined) {
            this.wet.gain.setValueAtTime(data.mix, this.context.currentTime);
            this.dry.gain.setValueAtTime(1.0 - data.mix, this.context.currentTime);
        }
        if (data.preDelay !== undefined) {
            this.preDelay.delayTime.setValueAtTime(data.preDelay, this.context.currentTime);
        }
        if (data.decay !== undefined) {
            // This is computationally expensive and can cause audio glitches.
            // In a real-world scenario, a more sophisticated approach (e.g., cross-fading) would be needed.
            this._generateImpulse(data.decay);
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
