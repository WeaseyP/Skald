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
    frequency: 440,
    modIndex: 100,
    exposedParameters: ['frequency', 'modIndex']
};

const defaultWavetableParams: WavetableParams = {
    tableName: 'Sine',
    frequency: 440,
    position: 0,
    exposedParameters: ['frequency', 'position']
};

const defaultSampleHoldParams: SampleHoldParams = {
    rate: 10.0,
    amplitude: 1.0,
    bpmSync: false,
    syncRate: '1/8',
    exposedParameters: ['rate', 'amplitude']
};

const defaultLfoParams: LfoParams = {
    waveform: "Sine",
    frequency: 5.0,
    amplitude: 1.0,
    bpmSync: false,
    syncRate: '1/4',
    exposedParameters: ['frequency', 'amplitude']
};

const defaultOscillatorParams: OscillatorParams = {
    frequency: 440.0,
    waveform: "Sawtooth",
    amplitude: 0.5,
    pulseWidth: 0.5,
    phase: 0,
    exposedParameters: ['frequency', 'amplitude', 'pulseWidth', 'phase']
};

const defaultFilterParams: FilterParams = {
    type: 'Lowpass',
    cutoff: 800.0,
    resonance: 1.0,
    exposedParameters: ['cutoff', 'resonance']
};

const defaultNoiseParams: NoiseParams = {
    type: 'White',
    amplitude: 1.0,
    exposedParameters: ['amplitude']
};

const defaultAdsrParams: AdsrParams = {
    attack: 0.1,
    decay: 0.2,
    sustain: 0.5,
    release: 1.0,
    depth: 1.0,
    velocitySensitivity: 0.5,
    attackCurve: 'linear',
    decayCurve: 'linear',
    releaseCurve: 'linear',
    exposedParameters: ['attack', 'decay', 'sustain', 'release', 'depth']
};

const defaultDelayParams: DelayParams = {
    delayTime: 0.5,
    feedback: 0.5,
    mix: 0.5,
    bpmSync: false,
    syncRate: '1/8',
    exposedParameters: ['delayTime', 'feedback', 'mix']
};

const defaultReverbParams: ReverbParams = {
    decay: 3.0,
    preDelay: 0.01,
    mix: 0.5,
    exposedParameters: ['decay', 'mix']
};

const defaultDistortionParams: DistortionParams = {
    drive: 20,
    tone: 4000,
    mix: 0.5,
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
    pan: 0,
    exposedParameters: ['pan']
};

const defaultGainParams: GainParams = {
    gain: 0.75,
    exposedParameters: ['gain']
};

const defaultOutputParams: OutputParams = {
    exposedParameters: []
};

const defaultInstrumentParams: InstrumentParams = {
    name: 'New Instrument',
    voiceCount: 8,
    voiceStealing: 'oldest',
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
    exposedParameters: ['device', 'useMpe']
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
            inMin: 0,
            inMax: 1,
            outMin: 0,
            outMax: 20000
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