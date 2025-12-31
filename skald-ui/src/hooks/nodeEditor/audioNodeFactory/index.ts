import { createAdsrNode } from './createAdsrNode';
import { createMapperNode } from './createMapperNode';
import { createOscillatorNode } from './createOscillatorNode';
import { createNoiseNode } from './createNoiseNode';
import { createSampleHoldNode } from './createSampleHoldNode';
import { createWavetableNode } from './createWavetableNode';
import { createFilterNode } from './createFilterNode';
import { createLfoNode } from './createLfoNode';
import { createDelayNode } from './createDelayNode';
import { createFmOperatorNode } from './createFmOperatorNode';
import { createDistortionNode } from './createDistortionNode';
import { createPannerNode } from './createPannerNode';
import { createReverbNode } from './createReverbNode';
import { createMixerNode } from './createMixerNode';
import { createOutputNode } from './createOutputNode';
import { createInstrumentInputNode } from './createInstrumentInputNode';
import { createInstrumentOutputNode } from './createInstrumentOutputNode';
import { createGainNode } from './createGainNode';
import { createMidiInputNode } from './createMidiInputNode';
import { createDefaultNode } from './createDefaultNode';

export const nodeCreationMap = {
    'adsr': createAdsrNode,
    'mapper': createMapperNode,
    'oscillator': createOscillatorNode,
    'noise': createNoiseNode,
    'sampleHold': createSampleHoldNode, // Fix potential key mismatch? Or keep 'sample-hold' if verified? Sticking to addition only first.
    'sample-hold': createSampleHoldNode,
    'wavetable': createWavetableNode,
    'filter': createFilterNode,
    'lfo': createLfoNode,
    'delay': createDelayNode,
    'fmOperator': createFmOperatorNode,
    'distortion': createDistortionNode,
    'panner': createPannerNode,
    'reverb': createReverbNode,
    'mixer': createMixerNode,
    'output': createOutputNode,
    'files': createDefaultNode, // Just safely handling defaults
    'InstrumentInput': createInstrumentInputNode,
    'InstrumentOutput': createInstrumentOutputNode,
    'gain': createGainNode,
    'midiInput': createMidiInputNode,
    'default': createDefaultNode,
};
