import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FmOperatorNode extends BaseSkaldNode {
    public readonly skaldType = 'FmOperatorNode';
    public output: GainNode;
    public modulatorInput: GainNode;
    private carrier: OscillatorNode;
    private context: AudioContext;
    // Golden-path semantics: `frequency` is a RATIO of the played note's
    // frequency (codegen: carrier = voice.current_freq * ratio). The
    // preview used to treat it as absolute note-independent Hz.
    private ratio = 1.0;
    private noteFreq = 440.0;

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

    private applyFrequency() {
        this.carrier.frequency.setValueAtTime(this.noteFreq * this.ratio, this.context.currentTime);
    }

    // Called by Voice.trigger with the note's frequency so the operator
    // tracks the melody like the generated code does.
    public setNoteFrequency(freq: number, startTime?: number) {
        this.noteFreq = freq;
        const t = startTime ?? this.context.currentTime;
        this.carrier.frequency.cancelScheduledValues(t);
        this.carrier.frequency.setValueAtTime(this.noteFreq * this.ratio, t);
    }

    update(data: any): void {
        if (data.frequency !== undefined) {
            // Same clamp as codegen: legacy saves carry 440 here.
            this.ratio = Math.min(Math.max(data.frequency, 0.01), 32.0);
            this.applyFrequency();
        }
        if (data.waveform) {
            this.carrier.type = data.waveform.toLowerCase() as OscillatorType;
        }
        // The schema/serialized key is `modIndex` — the old code read
        // `modulationIndex`, so the Modulation Index knob did nothing.
        const mi = data.modIndex ?? data.modulationIndex;
        if (mi !== undefined) {
            this.modulatorInput.gain.setValueAtTime(mi, this.context.currentTime);
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
