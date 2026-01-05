import {
    OscillatorNode, FilterNode, GraphOutputNode, NoiseNode, ADSRNode,
    MixerNode, PannerNode, GroupNode, FmOperatorNode, WavetableNode, MidiInputNode, VisualGainNode, MapperNode,
    LFONode, SampleHoldNode, DelayNode, ReverbNode, DistortionNode
} from '../components/Nodes';
import InstrumentNode from '../components/InstrumentNode';

export const nodeTypes = {
    oscillator: OscillatorNode,
    filter: FilterNode,
    output: GraphOutputNode,
    noise: NoiseNode,
    adsr: ADSRNode,
    lfo: LFONode,
    instrument: InstrumentNode,
    sampleHold: SampleHoldNode,
    delay: DelayNode,
    reverb: ReverbNode,
    distortion: DistortionNode,
    mixer: MixerNode,
    panner: PannerNode,
    group: GroupNode,
    fmOperator: FmOperatorNode,
    wavetable: WavetableNode,
    midiInput: MidiInputNode,
    gain: VisualGainNode,
    mapper: MapperNode,
};
