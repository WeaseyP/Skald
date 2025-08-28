import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class LfoNode extends BaseSkaldNode {
    public output: GainNode;
    private lfo: OscillatorNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.lfo = context.createOscillator();
        this.output = context.createGain();

        this.lfo.type = (data.waveform || 'sine').toLowerCase() as OscillatorType;
        this.lfo.frequency.setValueAtTime(data.frequency || 5.0, context.currentTime);
        this.output.gain.setValueAtTime(data.amplitude || 1.0, context.currentTime);
        
        this.lfo.connect(this.output);
        this.lfo.start();
    }

    update(data: any): void {
        if (data.frequency !== undefined) {
            this.lfo.frequency.setValueAtTime(data.frequency, this.context.currentTime);
        }
        if (data.waveform) {
            this.lfo.type = data.waveform.toLowerCase() as OscillatorType;
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }
    }
}

export const createLfoNode = (context: AudioContext, node: Node): AudioNode => {
    const lfoNodeInstance = new LfoNode(context, node.data);
    
    const outputNode = lfoNodeInstance.output as any;
    outputNode._skaldNode = lfoNodeInstance;

    return outputNode;
};
