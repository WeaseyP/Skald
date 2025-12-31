import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

// Mapper Node: Maps input range [inMin, inMax] to output range [outMin, outMax].
// Implementation:
// We use a GainNode for scaling (Gain) and a ConstantSourceNode for offset (Bias).
// Out = Gain * In + Bias
//
// Scale Factor (Gain) = (outMax - outMin) / (inMax - inMin)
// Offset (Bias)      = outMin - (inMin * Scale Factor)

class MapperNode extends BaseSkaldNode {
    public input: GainNode;
    public output: GainNode;
    private biasNode: ConstantSourceNode;
    private scaleNode: GainNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        // Input receives the signal
        this.input = context.createGain();

        // Scale Node (Gain)
        this.scaleNode = context.createGain();

        // Bias Node (Offset)
        this.biasNode = context.createConstantSource();
        this.biasNode.start();

        // Output sums them up
        this.output = context.createGain();

        // Connect: Input -> Scale -> Output
        this.input.connect(this.scaleNode);
        this.scaleNode.connect(this.output);

        // Connect: Bias -> Output
        this.biasNode.connect(this.output);

        this.update(data);
    }

    update(data: any): void {
        const inMin = data.inMin ?? 0;
        const inMax = data.inMax ?? 1;
        const outMin = data.outMin ?? 0;
        const outMax = data.outMax ?? 1;

        // Prevent division by zero
        const rangeIn = (inMax - inMin) === 0 ? 0.0001 : (inMax - inMin);

        // Calculate Gain (Scale)
        const scale = (outMax - outMin) / rangeIn;

        // Calculate Bias (Offset)
        // Formula derivation:
        // y = m(x - x1) + y1
        // y = mx - mx1 + y1
        // Bias = y1 - mx1
        // Bias = outMin - (scale * inMin)
        const bias = outMin - (scale * inMin);

        // Apply
        const now = this.context.currentTime;
        this.scaleNode.gain.setTargetAtTime(scale, now, 0.01);
        this.biasNode.offset.setTargetAtTime(bias, now, 0.01);
    }

    disconnect() {
        this.input.disconnect();
        this.scaleNode.disconnect();
        this.biasNode.stop();
        this.biasNode.disconnect();
        this.output.disconnect();
    }
}

export const createMapperNode = (context: AudioContext, node: Node): AudioNode => {
    const mapperInstance = new MapperNode(context, node.data);
    const outputNode = mapperInstance.output as any;

    // We attach the wrapper to the output node so we can update it later
    outputNode._skaldNode = mapperInstance;

    // We also need to expose the input so connections can find it.
    // However, our audioNodeUtils usually looks for 'input' property on the node?
    // Or it connects to the node itself.
    // AudioNodeWrapper pattern usually returns the 'output' AudioNode.
    // But we need to make sure `connectNodes` connects to `mapperInstance.input`.
    // Let's attach input to the output object for lookups.
    (outputNode as any).input = mapperInstance.input;

    return outputNode;
};
