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

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.input = context.createGain();
        this.output = context.createGain();
        this.delay = context.createDelay(5.0);
        this.feedback = context.createGain();
        this.wet = context.createGain();
        this.dry = context.createGain();

        const { delayTime = 0.5, feedback = 0.5, mix = 0.5 } = data;
        this.delay.delayTime.setValueAtTime(delayTime, context.currentTime);
        this.feedback.gain.setValueAtTime(feedback, context.currentTime);
        this.wet.gain.setValueAtTime(mix, context.currentTime);
        this.dry.gain.setValueAtTime(1.0 - mix, context.currentTime);

        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.delay.connect(this.wet);
        this.wet.connect(this.output);
    }

    update(data: any): void {
        if (data.delayTime !== undefined) {
            this.delay.delayTime.setValueAtTime(data.delayTime, this.context.currentTime);
        }
        if (data.feedback !== undefined) {
            this.feedback.gain.setValueAtTime(data.feedback, this.context.currentTime);
        }
        if (data.mix !== undefined) {
            this.wet.gain.setValueAtTime(data.mix, this.context.currentTime);
            this.dry.gain.setValueAtTime(1.0 - data.mix, this.context.currentTime);
        }
    }
}

export const createDelayNode = (context: AudioContext, node: Node): AudioNode => {
    const delayNodeInstance = new DelayNode(context, node.data);
    
    const inputNode = delayNodeInstance.input as any;
    inputNode._skaldNode = delayNodeInstance;
    
    // For compatibility with existing connection logic
    inputNode.output = delayNodeInstance.output;

    return inputNode;
};
