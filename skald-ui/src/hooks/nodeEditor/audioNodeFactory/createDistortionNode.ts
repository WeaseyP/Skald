import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class DistortionNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private shaper: WaveShaperNode;
    private toneFilter: BiquadFilterNode;
    private wet: GainNode;
    private dry: GainNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private currentShape: string | undefined;
    private currentDrive: number | undefined;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.input = context.createGain();
        this.output = context.createGain();
        this.shaper = context.createWaveShaper();
        this.toneFilter = context.createBiquadFilter();
        this.wet = context.createGain();
        this.dry = context.createGain();
        
        this.toneFilter.type = 'lowpass';

        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.shaper);
        this.shaper.connect(this.toneFilter);
        this.toneFilter.connect(this.wet);
        this.wet.connect(this.output);
        
        this.update(data);
    }

    private _generateCurve(shape: string, drive: number): Float32Array {
        const k = typeof drive === 'number' ? drive : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        
        switch(shape) {
            case 'soft':
                for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = Math.tanh(x * k);
                }
                break;
            case 'hard':
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
                const classicDrive = Math.max(1, k);
                for (let i = 0; i < n_samples; i++) {
                    const x = i * 2 / n_samples - 1;
                    curve[i] = (Math.PI + classicDrive) * x / (Math.PI + classicDrive * Math.abs(x));
                }
                break;
            }
        }
        return curve;
    }

    update(data: any): void {
        const now = this.context.currentTime;
        const shape = (data.shape || 'classic').toLowerCase();
        const drive = data.drive || 50;
        const mix = data.mix ?? 1.0;
        const tone = data.tone ?? 10000;

        // Only regenerate curve if shape or drive has changed
        if (shape !== this.currentShape || drive !== this.currentDrive) {
            this.shaper.curve = this._generateCurve(shape, drive);
            this.currentShape = shape;
            this.currentDrive = drive;
        }

        this.toneFilter.frequency.setTargetAtTime(tone, now, this.timeConstant);
        this.wet.gain.setTargetAtTime(mix, now, this.timeConstant);
        this.dry.gain.setTargetAtTime(1.0 - mix, now, this.timeConstant);
    }
}

export const createDistortionNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new DistortionNode(context, node.data);
    
    const inputNode = instance.input as any;
    inputNode._skaldNode = instance;
    inputNode.output = instance.output;

    return inputNode;
};
