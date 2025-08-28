import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class DistortionNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private shaper: WaveShaperNode;
    private wet: GainNode;
    private dry: GainNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.input = context.createGain();
        this.output = context.createGain();
        this.shaper = context.createWaveShaper();
        this.wet = context.createGain();
        this.dry = context.createGain();
        
        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.shaper);
        this.shaper.connect(this.wet);
        this.wet.connect(this.output);
        
        this.update(data);
    }

    private _generateCurve(shape: string, amount: number): Float32Array {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        
        switch(shape) {
            case 'soft':
                // Tanh-style soft clipping
                for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = Math.tanh(x * k);
                }
                break;
            case 'hard':
                // Hard clipping
                for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = Math.max(-1, Math.min(1, x * k));
                }
                break;
            case 'asymmetric':
                 for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = x > 0 ? x : x / (1 + Math.abs(x * k));
                }
                break;
            case 'classic':
            default: {
                // The original algorithm from the file
                const drive = Math.max(1, k);
                for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
                }
                break;
            }
        }
        return curve;
    }

    update(data: any): void {
        const shape = data.shape || 'classic';
        const amount = data.amount ?? (data.drive || 50);
        const mix = data.mix ?? 1.0;

        this.shaper.curve = this._generateCurve(shape, amount);
        this.wet.gain.setValueAtTime(mix, this.context.currentTime);
        this.dry.gain.setValueAtTime(1.0 - mix, this.context.currentTime);
    }
}

export const createDistortionNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new DistortionNode(context, node.data);
    
    const inputNode = instance.input as any;
    inputNode._skaldNode = instance;
    inputNode.output = instance.output;

    return inputNode;
};
