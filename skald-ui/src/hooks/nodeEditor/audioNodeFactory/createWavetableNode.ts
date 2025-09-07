import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class WavetableNode extends BaseSkaldNode {
    public output: GainNode;
    private worklet: AudioWorkletNode;
    private context: AudioContext;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);
        
        this.output = context.createGain();
        this.worklet = new AudioWorkletNode(context, 'wavetable-processor');

        this.worklet.connect(this.output);
        
        this.update(data);
    }

    update(data: any): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;
        const timeConstant = 0.02;

        if (data.frequency !== undefined) {
            this.worklet.parameters.get('frequency')?.setTargetAtTime(data.frequency, now, timeConstant);
        }
        if (data.position !== undefined) {
            this.worklet.parameters.get('position')?.setTargetAtTime(data.position, now, timeConstant);
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setTargetAtTime(data.amplitude, now, timeConstant);
        }
        if (data.table) {
            // The 'table' data is expected to be an array of numbers (Float32Array)
            this.worklet.port.postMessage({ type: 'update-table', table: data.table });
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Node ${this.id} has no audio inputs, but can be modulated.`);
        const now = this.context.currentTime;
        const timeConstant = 0.02;
        if (targetHandle === 'frequency') {
            sourceNode.connect(this.worklet.parameters.get('frequency') as AudioParam);
        } else if (targetHandle === 'position') {
            sourceNode.connect(this.worklet.parameters.get('position') as AudioParam);
        }
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            if (targetHandle === 'frequency') {
                sourceNode.disconnect(this.worklet.parameters.get('frequency') as AudioParam);
            } else if (targetHandle === 'position') {
                sourceNode.disconnect(this.worklet.parameters.get('position') as AudioParam);
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

export const createWavetableNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new WavetableNode(context, node.id, node.type, node.data);
    
    // This node is a source, so we return the output gain.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    return outputNode;
};
