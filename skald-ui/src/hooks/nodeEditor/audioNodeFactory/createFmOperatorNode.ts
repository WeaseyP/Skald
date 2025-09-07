import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class FmOperatorNode extends BaseSkaldNode {
    public output: GainNode;
    public modulatorInput: GainNode;
    private carrier: OscillatorNode;
    private context: AudioContext;
    private id: string;
    private type: string;

    constructor(context: AudioContext, id: string, type: string, data: any) {
        super();
        this.context = context;
        this.id = id;
        this.type = type;

        console.log(`[Skald Debug][${this.type}] Node created with ID: ${this.id}`);
        
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
        console.log(`[Skald Debug][${this.type}] Updating node ${this.id} with data:`, data);
        const now = this.context.currentTime;
        const timeConstant = 0.02;

        // Set the carrier's base frequency. This is not the modulated frequency.
        if (data.frequency !== undefined) {
            this.carrier.frequency.setTargetAtTime(data.frequency, now, timeConstant);
        }
        if (data.waveform) {
            this.carrier.type = data.waveform.toLowerCase() as OscillatorType;
        }
        // Set the gain of the modulator input, which controls the modulation depth (index)
        if (data.modIndex !== undefined) {
            this.modulatorInput.gain.setTargetAtTime(data.modIndex, now, timeConstant);
        }
    }

    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Connecting input to ${this.id}. Target handle: ${targetHandle}`);
        if (targetHandle === 'input_mod') {
            sourceNode.connect(this.modulatorInput);
        }
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        console.log(`[Skald Debug][${this.type}] Disconnecting input from ${this.id}. Target handle: ${targetHandle}`);
        if (targetHandle === 'input_mod') {
            try {
                sourceNode.disconnect(this.modulatorInput);
            } catch (e) {
                // Ignore errors from disconnecting non-connected nodes.
            }
        }
    }
}

export const createFmOperatorNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new FmOperatorNode(context, node.id, node.type, node.data);
    
    // This node has a named input 'input_mod', not a primary input.
    // We return the output node and attach the instance for updates.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    // For the connection logic to find the named input
    (outputNode as any).modulatorInput = instance.modulatorInput;

    return outputNode;
};
