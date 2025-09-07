import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class DelayNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private delay: DelayNode;
    private feedback: GainNode;
    private wet: GainNode;
    private dry: GainNode;
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

        this.input = context.createGain();
        this.output = context.createGain();
        this.delay = context.createDelay(5.0); // Max delay time of 5s
        this.feedback = context.createGain();
        this.wet = context.createGain();
        this.dry = context.createGain();

        // Connections
        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.delay.connect(this.wet);
        this.wet.connect(this.output);
        
        this.update(data, {}); // Initial update
    }

    update(data: any, options?: { bpm?: number }): void {
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;

        // --- Delay Time Calculation ---
        let delayTimeValue = data.delayTime || 0.5;
        if (data.bpmSync && options?.bpm) {
            const rateString = data.syncRate || '1/4';
            try {
                const rateValue = eval(rateString);
                if (typeof rateValue === 'number' && rateValue > 0) {
                     delayTimeValue = (4 * rateValue * 60) / options.bpm;
                }
            } catch (e) {
                console.error("Could not parse syncRate:", rateString);
            }
        }

        // Clamp delay time to the max allowed by the DelayNode
        if (delayTimeValue > this.delay.delayTime.maxValue) {
            delayTimeValue = this.delay.delayTime.maxValue;
        }

        this.delay.delayTime.setTargetAtTime(delayTimeValue, now, this.timeConstant);

        if (data.feedback !== undefined) {
            this.feedback.gain.setTargetAtTime(data.feedback, now, this.timeConstant);
        }
        if (data.mix !== undefined) {
            this.wet.gain.setTargetAtTime(data.mix, now, this.timeConstant);
            this.dry.gain.setTargetAtTime(1.0 - data.mix, now, this.timeConstant);
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        sourceNode.connect(this.input);
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        try {
            sourceNode.disconnect(this.input);
        } catch (e) {
            // Ignore errors from disconnecting non-connected nodes.
        }
    }
}

export const createDelayNode = (context: AudioContext, node: Node): AudioNode => {
    const delayNodeInstance = new DelayNode(context, node.id, node.type, node.data);
    
    const inputNode = delayNodeInstance.input as any;
    inputNode._skaldNode = delayNodeInstance;
    
    // For compatibility with existing connection logic
    inputNode.output = delayNodeInstance.output;

    return inputNode;
};
