import { createAdsrNode } from './createAdsrNode';
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
import { createDefaultNode } from './createDefaultNode';
import { createGainNode } from './createGainNode';

export const nodeCreationMap = {
    'gain': createGainNode,
    'adsr': createAdsrNode,
    'oscillator': createOscillatorNode,
    'noise': createNoiseNode,
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
    'InstrumentInput': createInstrumentInputNode,
    'InstrumentOutput': createInstrumentOutputNode,
    'default': createDefaultNode,
};
