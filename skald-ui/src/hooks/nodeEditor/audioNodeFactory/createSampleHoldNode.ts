import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class SampleHoldNode extends BaseSkaldNode {
    public output: AudioWorkletNode;
    public input_signal: AudioWorkletNode;
    public input_trigger: AudioWorkletNode;

    private context: AudioContext;
    private timeConstant = 0.02;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;
        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);
        
        this.output = new AudioWorkletNode(context, 'sample-hold-processor', {
            numberOfInputs: 2,
            outputChannelCount: [1]
        });

        // For connection logic
        this.input_signal = this.output;
        this.input_trigger = this.output;
        
        this.update(data, {});
    }

    update(data: any, options?: { bpm?: number }): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;

        // --- Rate Calculation ---
        let rateValue = data.rate || 10.0;
        if (data.bpmSync && options?.bpm) {
            const rateString = data.syncRate || '1/4';
            try {
                const syncRate = eval(rateString);
                if (typeof syncRate === 'number' && syncRate > 0) {
                     const beatFrequency = options.bpm / 60.0;
                     rateValue = beatFrequency / (4 * syncRate);
                }
            } catch (e) {
                console.error("Could not parse syncRate:", rateString);
            }
        }
        
        this.output.parameters.get('rate')?.setTargetAtTime(rateValue, now, this.timeConstant);
        
        if (data.amplitude !== undefined) {
            this.output.parameters.get('amplitude')?.setTargetAtTime(data.amplitude, now, this.timeConstant);
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        if (targetHandle === 'input_signal') {
            sourceNode.connect(this.input_signal, 0, 0);
        } else if (targetHandle === 'input_trigger') {
            sourceNode.connect(this.input_trigger, 0, 1);
        }
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        if (targetHandle === 'input_signal') {
            try {
                sourceNode.disconnect(this.input_signal, 0, 0);
            } catch (e) {
                // Ignore errors
            }
        } else if (targetHandle === 'input_trigger') {
            try {
                sourceNode.disconnect(this.input_trigger, 0, 1);
            } catch (e) {
                // Ignore errors
            }
        }
    }
}

export const createSampleHoldNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new SampleHoldNode(context, node.id, node.type, node.data);
    
    // The main output is the worklet itself
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    // Expose the inputs for the connection logic
    (outputNode as any).input_signal = instance.input_signal;
    (outputNode as any).input_trigger = instance.input_trigger;

    return outputNode;
};
