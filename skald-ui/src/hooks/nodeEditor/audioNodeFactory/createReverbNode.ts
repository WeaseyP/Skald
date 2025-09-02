import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class ReverbNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    
    private wet: GainNode;
    private dry: GainNode;
    private preDelay: DelayNode;
    private context: AudioContext;
    private timeConstant = 0.02;

    // --- Algorithmic Reverb components ---
    private readonly combFilters: { delay: DelayNode, feedback: GainNode }[] = [];
    private readonly combFilterDelayTimes = [0.0297, 0.0371, 0.0411, 0.0437]; // Prime-ish numbers

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.input = context.createGain();
        this.output = context.createGain();
        this.wet = context.createGain();
        this.dry = context.createGain();
        this.preDelay = context.createDelay(1.0);

        // --- Build the algorithmic reverb graph ---
        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.preDelay);

        // Create parallel comb filters
        for (const time of this.combFilterDelayTimes) {
            const delay = context.createDelay(1.0);
            delay.delayTime.value = time;
            
            const feedback = context.createGain();
            
            this.preDelay.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            
            // Output of each delay goes to the wet mix
            delay.connect(this.wet);
            
            this.combFilters.push({ delay, feedback });
        }
        
        this.wet.connect(this.output);
        
        this.update(data);
    }

    update(data: any): void {
        const now = this.context.currentTime;

        if (data.mix !== undefined) {
            this.wet.gain.setTargetAtTime(data.mix, now, this.timeConstant);
            this.dry.gain.setTargetAtTime(1.0 - data.mix, now, this.timeConstant);
        }
        if (data.preDelay !== undefined) {
            this.preDelay.delayTime.setTargetAtTime(data.preDelay, now, this.timeConstant);
        }
        if (data.decay !== undefined) {
            // Map decay (e.g., 0-10s) to feedback gain (0-0.99)
            // This is a simple linear mapping, could be exponential for better feel
            const maxDecay = 10.0;
            const feedbackGain = (data.decay / maxDecay) * 0.95; // Max gain < 1 to prevent runaway feedback
            
            for (const filter of this.combFilters) {
                filter.feedback.gain.setTargetAtTime(feedbackGain, now, this.timeConstant);
            }
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
