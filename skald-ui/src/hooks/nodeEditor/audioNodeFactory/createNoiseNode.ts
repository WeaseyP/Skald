import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class NoiseNode extends BaseSkaldNode {
    public output: GainNode;
    private noiseSource: AudioWorkletNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private currentType: string;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.currentType = (data.type || 'white').toLowerCase();

        this.output = context.createGain();
        this.noiseSource = new AudioWorkletNode(context, 'noise-processor', {
            processorOptions: {
                type: this.currentType
            }
        });

        this.noiseSource.connect(this.output);
        this.update(data);
    }

    update(data: any): void {
        const now = this.context.currentTime;
        if (data.amplitude !== undefined) {
            this.output.gain.setTargetAtTime(data.amplitude, now, this.timeConstant);
        }
        if (data.type && data.type.toLowerCase() !== this.currentType) {
            this.currentType = data.type.toLowerCase();
            this.noiseSource.port.postMessage({ type: this.currentType });
        }
    }
}

export const createNoiseNode = (context: AudioContext, node: Node): AudioNode => {
    const noiseNodeInstance = new NoiseNode(context, node.data);
    
    const outputNode = noiseNodeInstance.output as any;
    outputNode._skaldNode = noiseNodeInstance;

    return outputNode;
};
