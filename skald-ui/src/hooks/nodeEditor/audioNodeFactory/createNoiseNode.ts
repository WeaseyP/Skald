import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class NoiseNode extends BaseSkaldNode {
    public output: GainNode;
    private noiseSource: AudioWorkletNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private currentType: string;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);
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
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;
        if (data.amplitude !== undefined) {
            this.output.gain.setTargetAtTime(data.amplitude, now, this.timeConstant);
        }
        if (data.type && data.type.toLowerCase() !== this.currentType) {
            this.currentType = data.type.toLowerCase();
            this.noiseSource.port.postMessage({ type: this.currentType });
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Node ${this.id} has no inputs.`);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Node ${this.id} has no inputs.`);
    }
}

export const createNoiseNode = (context: AudioContext, node: Node): AudioNode => {
    const noiseNodeInstance = new NoiseNode(context, node.id, node.type, node.data);
    
    const outputNode = noiseNodeInstance.output as any;
    outputNode._skaldNode = noiseNodeInstance;

    return outputNode;
};
