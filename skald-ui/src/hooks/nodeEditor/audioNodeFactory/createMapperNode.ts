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
    public readonly skaldType = 'MapperNode';
    public input: GainNode;
    public output: GainNode;
    private inBias: ConstantSourceNode; // subtracts the input-range center
    private normGain: GainNode;         // normalizes input range to [-1, 1]
    private clampShaper: WaveShaperNode; // identity curve => clamps outside [-1, 1]
    private outGain: GainNode;          // expands to the output range
    private outBias: ConstantSourceNode; // re-centers on the output range
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        // Chain: (input + inBias) -> normGain -> clampShaper -> outGain (+ outBias)
        // The WaveShaper's identity curve clamps anything outside [-1,1],
        // which after normalization means "clamp to [inMin,inMax]". The old
        // scale+bias implementation extrapolated linearly, so modulation
        // outside the input range overshot the output range — codegen
        // clamps, and tuning by ear against an unclamped preview lied.
        this.input = context.createGain();
        this.inBias = context.createConstantSource();
        this.inBias.start();
        this.normGain = context.createGain();
        this.clampShaper = context.createWaveShaper();
        this.clampShaper.curve = new Float32Array([-1, 1]); // identity with clamping
        this.outGain = context.createGain();
        this.outBias = context.createConstantSource();
        this.outBias.start();
        this.output = context.createGain();

        this.input.connect(this.normGain);
        this.inBias.connect(this.normGain);
        this.normGain.connect(this.clampShaper);
        this.clampShaper.connect(this.outGain);
        this.outGain.connect(this.output);
        this.outBias.connect(this.output);

        this.update(data);
    }

    update(data: any): void {
        const inMin = data.inMin ?? 0;
        const inMax = data.inMax ?? 1;
        const outMin = data.outMin ?? 0;
        const outMax = data.outMax ?? 1;

        const inHalf = (inMax - inMin) === 0 ? 0.0001 : (inMax - inMin) / 2;
        const inCenter = (inMax + inMin) / 2;
        const outHalf = (outMax - outMin) / 2;
        const outCenter = (outMax + outMin) / 2;

        const now = this.context.currentTime;
        this.inBias.offset.setTargetAtTime(-inCenter, now, 0.01);
        this.normGain.gain.setTargetAtTime(1 / inHalf, now, 0.01);
        this.outGain.gain.setTargetAtTime(outHalf, now, 0.01);
        this.outBias.offset.setTargetAtTime(outCenter, now, 0.01);
    }

    disconnect() {
        this.input.disconnect();
        this.inBias.stop();
        this.inBias.disconnect();
        this.normGain.disconnect();
        this.clampShaper.disconnect();
        this.outGain.disconnect();
        this.outBias.stop();
        this.outBias.disconnect();
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
