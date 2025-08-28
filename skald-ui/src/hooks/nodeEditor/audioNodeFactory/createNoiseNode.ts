import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class NoiseNode extends BaseSkaldNode {
    public output: GainNode;
    private noiseSource: AudioBufferSourceNode;
    private filter: BiquadFilterNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.output = context.createGain();
        this.output.gain.setValueAtTime(data.amplitude ?? 1, context.currentTime);

        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const bufferData = buffer.getChannelData(0);
        for (let i = 0; i < bufferData.length; i++) { bufferData[i] = Math.random() * 2 - 1; }
        
        this.noiseSource = context.createBufferSource();
        this.noiseSource.buffer = buffer;
        this.noiseSource.loop = true;

        this.filter = context.createBiquadFilter();
        this.setFilterType(data.type || 'white');

        this.noiseSource.connect(this.filter);
        this.filter.connect(this.output);
        this.noiseSource.start();
    }

    private setFilterType(type: string): void {
        switch (type?.toLowerCase()) {
            case 'pink':
                this.filter.type = 'lowpass';
                this.filter.frequency.setValueAtTime(1000, this.context.currentTime);
                this.filter.Q.setValueAtTime(1, this.context.currentTime);
                break;
            case 'brown':
                this.filter.type = 'lowpass';
                this.filter.frequency.setValueAtTime(500, this.context.currentTime);
                this.filter.Q.setValueAtTime(1, this.context.currentTime);
                break;
            case 'white':
            default:
                this.filter.type = 'lowpass';
                this.filter.frequency.setValueAtTime(this.context.sampleRate / 2, this.context.currentTime);
                this.filter.Q.setValueAtTime(0, this.context.currentTime);
                break;
        }
    }

    update(data: any): void {
        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }
        if (data.type) {
            this.setFilterType(data.type);
        }
    }
}

export const createNoiseNode = (context: AudioContext, node: Node): AudioNode => {
    const noiseNodeInstance = new NoiseNode(context, node.data);
    
    const outputNode = noiseNodeInstance.output as any;
    outputNode._skaldNode = noiseNodeInstance;

    return outputNode;
};
