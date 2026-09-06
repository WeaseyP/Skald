/*
================================================================================
| FILE: skald-ui/src/definitions/node-definitions.ts                           |
|                                                                              |
| This file serves as the master manifest for all available audio nodes in     |
| Skald. It provides a single, centralized source of truth for node types,     |
| labels, and their type-safe default parameter configurations. This is used   |
| throughout the application to instantiate nodes, display them in the UI,     |
| and ensure data integrity.                                                   |
================================================================================
*/

import {
    FmOperatorParams,
    WavetableParams,
    SampleHoldParams,
    LfoParams,
    OscillatorParams,
    FilterParams,
    NoiseParams,
    AdsrParams,
    DelayParams,
    ReverbParams,
    DistortionParams,
    MixerParams,
    PannerParams,
    GainParams,
    OutputParams,
    InstrumentParams,
    MidiInputParams,
    NodeParams
} from './types';
// Roadmap packet C2: every numeric default with a range row is READ from the
// generated schema (schema/nodes.json -> nodeSchema.generated.ts), the same
// source the backend's typed setters and exposed-parameter defaults are
// generated from. Before C2 these were literals that drifted from the table
// nine times (SKB-024's "6 dB from a checkbox"). NodeSchema.test.ts asserts
// the two agree; sd() is how they cannot disagree.
import { schemaDefault as sd } from './nodeSchema.generated';

// --- Type Definition for a Node Definition Entry ---

export interface NodeDefinition {
    type: string;
    label: string;
    defaultParameters: any; // Relaxed from NodeParams to avoid 'inMin' mismatch
    codegenType: string;
    inputs?: string[];
    outputs?: string[];
}



// --- Default Parameter Objects ---

const defaultFmOperatorParams: FmOperatorParams = {
    // Ratio of the played note's frequency (golden-path semantics), NOT
    // absolute Hz. The old default of 440 as a ratio put the carrier at
    // ~190kHz — pure ultrasonic aliasing in the generated code.
    frequency: sd('FmOperator', 'frequency'),
    modIndex: sd('FmOperator', 'modIndex'),
    // C5: unity, the full-scale output the node always had.
    amplitude: sd('FmOperator', 'amplitude'),
    exposedParameters: ['frequency', 'modIndex']
};

const defaultWavetableParams: WavetableParams = {
    tableName: 'Sine',
    frequency: sd('Wavetable', 'frequency'),
    position: sd('Wavetable', 'position'),
    // C5: the symmetric square and zero offset the engine always used.
    pulseWidth: sd('Wavetable', 'pulseWidth'),
    phase: sd('Wavetable', 'phase'),
    // 1.0 = unity, matching the codegen fallback for an absent value. A new
    // node now stores it explicitly, so exposing amplitude initializes the
    // generated field from the stored 1.0 instead of the generic range-table
    // default (0.5) — the "-6 dB from a checkbox" case.
    amplitude: sd('Wavetable', 'amplitude'),
    exposedParameters: ['frequency', 'position', 'amplitude']
};

const defaultSampleHoldParams: SampleHoldParams = {
    rate: sd('SampleHold', 'rate'),
    amplitude: sd('SampleHold', 'amplitude'),
    bpmSync: false,
    syncRate: '1/8',
    exposedParameters: ['rate', 'amplitude']
};

const defaultLfoParams: LfoParams = {
    waveform: "Sine",
    frequency: sd('LFO', 'frequency'),
    amplitude: sd('LFO', 'amplitude'),
    bpmSync: false,
    syncRate: '1/4',
    exposedParameters: ['frequency', 'amplitude']
};

const defaultOscillatorParams: OscillatorParams = {
    frequency: sd('Oscillator', 'frequency'),
    waveform: "Sawtooth",
    amplitude: sd('Oscillator', 'amplitude'),
    pulseWidth: sd('Oscillator', 'pulseWidth'),
    phase: sd('Oscillator', 'phase'),
    exposedParameters: ['frequency', 'amplitude', 'pulseWidth', 'phase']
};

const defaultFilterParams: FilterParams = {
    type: 'Lowpass',
    cutoff: sd('Filter', 'cutoff'),
    resonance: sd('Filter', 'resonance'),
    exposedParameters: ['cutoff', 'resonance']
};

const defaultNoiseParams: NoiseParams = {
    type: 'White',
    amplitude: sd('Noise', 'amplitude'),
    exposedParameters: ['amplitude']
};

const defaultAdsrParams: AdsrParams = {
    attack: sd('ADSR', 'attack'),
    decay: sd('ADSR', 'decay'),
    sustain: sd('ADSR', 'sustain'),
    release: sd('ADSR', 'release'),
    depth: sd('ADSR', 'depth'),
    velocitySensitivity: sd('ADSR', 'velocitySensitivity'),
    // E8: not in the default exposedParameters list below — a curve is an
    // editor-side shaping control, not something roadmap 9.4 asked to be
    // live-settable by default the way attack/decay/release already are.
    attackCurve: sd('ADSR', 'attackCurve'),
    decayCurve: sd('ADSR', 'decayCurve'),
    releaseCurve: sd('ADSR', 'releaseCurve'),
    exposedParameters: ['attack', 'decay', 'sustain', 'release', 'depth']
};

const defaultDelayParams: DelayParams = {
    delayTime: sd('Delay', 'delayTime'),
    feedback: sd('Delay', 'feedback'),
    mix: sd('Delay', 'mix'),
    bpmSync: false,
    syncRate: '1/8',
    exposedParameters: ['delayTime', 'feedback', 'mix']
};

const defaultReverbParams: ReverbParams = {
    decay: sd('Reverb', 'decay'),
    preDelay: sd('Reverb', 'preDelay'),
    mix: sd('Reverb', 'mix'),
    // C5: undamped, the comb every existing patch has.
    damping: sd('Reverb', 'damping'),
    // preDelay is implemented in the engine and now editable on the node card;
    // it belongs in the default public API alongside decay and mix.
    exposedParameters: ['decay', 'preDelay', 'mix']
};

const defaultDistortionParams: DistortionParams = {
    drive: sd('Distortion', 'drive'),
    shape: 'classic',
    tone: sd('Distortion', 'tone'),
    mix: sd('Distortion', 'mix'),
    exposedParameters: ['drive', 'tone', 'mix']
};

const defaultMixerParams: MixerParams = {
    inputCount: 4,
    levels: [
        { id: 1, level: 0.75, pan: 0 },
        { id: 2, level: 0.75, pan: 0 },
        { id: 3, level: 0.75, pan: 0 },
        { id: 4, level: 0.75, pan: 0 },
    ],
    exposedParameters: [] // Exposure will now be handled per-channel if needed
};

const defaultPannerParams: PannerParams = {
    pan: sd('Panner', 'pan'),
    exposedParameters: ['pan']
};

const defaultGainParams: GainParams = {
    gain: sd('Gain', 'gain'),
    // C4: a fresh VCA scales its knob by what arrives on the Gain port, so
    // the modular idiom — envelope into a separate amplifier — works without
    // first zeroing the knob (the workaround every shipped example used).
    gainMode: 'multiply',
    exposedParameters: ['gain']
};

const defaultOutputParams: OutputParams = {
    exposedParameters: []
};

const defaultInstrumentParams: InstrumentParams = {
    name: 'New Instrument',
    volume: 1.0,
    voiceCount: 8,
    // stealMode left unset — like exportId/assetType above, its absence is
    // meaningful ('release-first', the byte-identical pre-G5 default), not
    // merely omitted (KI-018; see types.ts::InstrumentParams).
    pitchJitter: 0,
    velocityJitter: 0,
    glide: 0.05,
    unison: 1,
    detune: 5,
    inputs: [],
    outputs: [],
    subgraph: {
        nodes: [],
        connections: [],
    },
    exposedParameters: []
};

// --- Master Node Definitions Manifest ---

const defaultMidiInputParams: MidiInputParams = {
    device: 'All',
    useMpe: false,
    // SKB-059 / packet B2: this used to ship ['device', 'useMpe']. Neither
    // string appears anywhere in skald-backend/core — they are editor-side
    // routing settings — so every fresh MIDI Input node minted two setters
    // for fields no sample ever read. Nothing on this node is exposable.
    exposedParameters: []
};

export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
    fmOperator: { type: 'fmOperator', label: 'FM Operator', defaultParameters: defaultFmOperatorParams, codegenType: 'FmOperator' },
    wavetable: { type: 'wavetable', label: 'Wavetable', defaultParameters: defaultWavetableParams, codegenType: 'Wavetable' },
    sampleHold: { type: 'sampleHold', label: 'S & H', defaultParameters: defaultSampleHoldParams, codegenType: 'SampleHold' },
    lfo: { type: 'lfo', label: 'LFO', defaultParameters: defaultLfoParams, codegenType: 'LFO' },
    mapper: {
        type: 'mapper',
        label: 'Mapper (Scale)',
        defaultParameters: {
            inMin: sd('Mapper', 'inMin'),
            inMax: sd('Mapper', 'inMax'),
            outMin: sd('Mapper', 'outMin'),
            outMax: sd('Mapper', 'outMax')
        },
        codegenType: 'Mapper',
        inputs: ['input'],
        outputs: ['output']
    },
    oscillator: { type: 'oscillator', label: 'Oscillator', defaultParameters: defaultOscillatorParams, codegenType: 'Oscillator' },
    filter: { type: 'filter', label: 'Filter', defaultParameters: defaultFilterParams, codegenType: 'Filter' },
    noise: { type: 'noise', label: 'Noise', defaultParameters: defaultNoiseParams, codegenType: 'Noise' },
    adsr: { type: 'adsr', label: 'ADSR', defaultParameters: defaultAdsrParams, codegenType: 'ADSR' },
    delay: { type: 'delay', label: 'Delay', defaultParameters: defaultDelayParams, codegenType: 'Delay' },
    reverb: { type: 'reverb', label: 'Reverb', defaultParameters: defaultReverbParams, codegenType: 'Reverb' },
    distortion: { type: 'distortion', label: 'Distortion', defaultParameters: defaultDistortionParams, codegenType: 'Distortion' },
    mixer: { type: 'mixer', label: 'Mixer', defaultParameters: defaultMixerParams, codegenType: 'Mixer' },
    panner: { type: 'panner', label: 'Panner', defaultParameters: defaultPannerParams, codegenType: 'Panner' },
    gain: { type: 'gain', label: 'VCA', defaultParameters: defaultGainParams, codegenType: 'Gain' },
    output: { type: 'output', label: 'Output', defaultParameters: defaultOutputParams, codegenType: 'GraphOutput' },
    instrument: { type: 'instrument', label: 'Instrument', defaultParameters: defaultInstrumentParams, codegenType: 'Instrument' },
    group: { type: 'group', label: 'Group', defaultParameters: { exposedParameters: [] }, codegenType: 'Group' },
    InstrumentInput: { type: 'InstrumentInput', label: 'Input', defaultParameters: {}, codegenType: 'GraphInput' },
    InstrumentOutput: { type: 'InstrumentOutput', label: 'Output', defaultParameters: {}, codegenType: 'GraphOutput' },
    midiInput: { type: 'midiInput', label: 'MIDI Input', defaultParameters: defaultMidiInputParams, codegenType: 'MidiInput' },
};