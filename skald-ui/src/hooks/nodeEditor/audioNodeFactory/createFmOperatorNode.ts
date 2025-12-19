import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FmOperatorNode extends BaseSkaldNode {
    public output: GainNode;
    public modulatorInput: GainNode;
    private carrier: OscillatorNode;
    private context: AudioContext;
    private ratioGain: GainNode | null = null;
    private frequencySource: AudioNode | null = null;

    constructor(context: AudioContext, data: any, frequencySource?: AudioNode) {
        super();
        this.context = context;
        this.frequencySource = frequencySource || null;
        
        this.carrier = context.createOscillator();
        this.modulatorInput = context.createGain();
        this.output = context.createGain();

        // If we have a frequency source (Voice context), we implement Ratio Logic.
        if (this.frequencySource) {
            // FreqSource (Hz) -> RatioGain (Ratio) -> Carrier.frequency
            // Carrier.frequency base value must be 0.
            this.ratioGain = context.createGain();
            this.frequencySource.connect(this.ratioGain);
            this.ratioGain.connect(this.carrier.frequency);
            this.carrier.frequency.setValueAtTime(0, context.currentTime);
        } else {
            // Standalone mode: Works like a normal oscillator (Hz)
             this.carrier.frequency.setValueAtTime(data.frequency || 440, context.currentTime);
        }

        // Connect the modulator to the carrier's frequency (FM)
        this.modulatorInput.connect(this.carrier.frequency);

        // Connect the carrier to the output
        this.carrier.connect(this.output);

        this.update(data);
        
        this.carrier.start();
    }

    update(data: any): void {
        const currentTime = this.context.currentTime;
        const smooth = 0.015;

        if (this.frequencySource && this.ratioGain) {
            // In Ratio mode, 'frequency' param is the Ratio
            if (data.frequency !== undefined) {
                this.ratioGain.gain.setTargetAtTime(data.frequency, currentTime, smooth);
            }
        } else {
            // In Hertz mode
            if (data.frequency !== undefined) {
                this.carrier.frequency.setTargetAtTime(data.frequency, currentTime, smooth);
            }
        }

        if (data.waveform) {
            this.carrier.type = data.waveform.toLowerCase() as OscillatorType;
        }

        if (data.modulationIndex !== undefined) {
             // Currently 'modulationIndex' is just the gain of the modulator input.
             // In true FM, Index = DeltaFreq / ModFreq.
             // This simple implementation treats it as 'Amount'.
            this.modulatorInput.gain.setTargetAtTime(data.modulationIndex, currentTime, smooth);
        }
    }
}

export const createFmOperatorNode = (context: AudioContext, node: Node, adsrMap: any, frequencySource?: AudioNode): AudioNode => {
    const instance = new FmOperatorNode(context, node.data, frequencySource);
    
    // This node has a named input 'input_mod', not a primary input.
    // We return the output node and attach the instance for updates.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    // For the connection logic to find the named input
    (outputNode as any).modulatorInput = instance.modulatorInput;

    return outputNode;
};
