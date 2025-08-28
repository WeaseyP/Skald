import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class OscillatorNode extends BaseSkaldNode {
    public output: GainNode;
    private osc: OscillatorNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.output = context.createGain();
        this.osc = context.createOscillator();

        this.output.gain.setValueAtTime(data.amplitude ?? 1, context.currentTime);
        this.osc.type = (data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
        this.osc.frequency.setValueAtTime(data.frequency || 440, context.currentTime);
        
        this.osc.connect(this.output);
        this.osc.start();
    }

    update(data: any): void {
        if (data.frequency) {
            this.osc.frequency.setValueAtTime(data.frequency, this.context.currentTime);
        }
        if (data.waveform) {
            this.osc.type = data.waveform.toLowerCase() as OscillatorType;
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }
    }
}

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const oscillatorNodeInstance = new OscillatorNode(context, node.data);
    
    const outputNode = oscillatorNodeInstance.output as any;
    outputNode._skaldNode = oscillatorNodeInstance;

    return outputNode;
};
