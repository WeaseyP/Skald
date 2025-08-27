import { updateOscillatorNode } from './updateOscillatorNode';
import { updateFilterNode } from './updateFilterNode';
import { updateLfoNode } from './updateLfoNode';
import { updateAdsrNode } from './updateAdsrNode';
import { updateWavetableNode } from './updateWavetableNode';
import { updateSampleHoldNode } from './updateSampleHoldNode';
import { updateDelayNode } from './updateDelayNode';
import { updateDistortionNode } from './updateDistortionNode';
import { updatePannerNode } from './updatePannerNode';
import { updateReverbNode } from './updateReverbNode';
import { updateMixerNode } from './updateMixerNode';
import { updateFmOperatorNode } from './updateFmOperatorNode';

export const nodeUpdateMap: { [key: string]: Function } = {
    'oscillator': updateOscillatorNode,
    'filter': updateFilterNode,
    'lfo': updateLfoNode,
    'adsr': updateAdsrNode,
    'wavetable': updateWavetableNode,
    'sample-hold': updateSampleHoldNode,
    'delay': updateDelayNode,
    'distortion': updateDistortionNode,
    'panner': updatePannerNode,
    'reverb': updateReverbNode,
    'mixer': updateMixerNode,
    'fmOperator': updateFmOperatorNode,
};
