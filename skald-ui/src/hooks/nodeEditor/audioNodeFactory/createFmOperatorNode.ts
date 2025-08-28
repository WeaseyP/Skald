import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FmOperatorNode extends BaseSkaldNode {
    public output: GainNode;
    public modulatorInput: GainNode;
    private carrier: OscillatorNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        
        this.carrier = context.createOscillator();
        this.modulatorInput = context.createGain();
        this.output = context.createGain();

        // Connect the modulator to the carrier's frequency
        this.modulatorInput.connect(this.carrier.frequency);
        // Connect the carrier to the output
        this.carrier.connect(this.output);

        this.update(data);
        
        this.carrier.start();
    }

    update(data: any): void {
        if (data.frequency !== undefined) {
            this.carrier.frequency.setValueAtTime(data.frequency, this.context.currentTime);
        }
        if (data.waveform) {
            this.carrier.type = data.waveform.toLowerCase() as OscillatorType;
        }
        if (data.modulationIndex !== undefined) {
            this.modulatorInput.gain.setValueAtTime(data.modulationIndex, this.context.currentTime);
        }
    }
}

export const createFmOperatorNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new FmOperatorNode(context, node.data);
    
    // This node has a named input 'input_mod', not a primary input.
    // We return the output node and attach the instance for updates.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    // For the connection logic to find the named input
    (outputNode as any).modulatorInput = instance.modulatorInput;

    return outputNode;
};
