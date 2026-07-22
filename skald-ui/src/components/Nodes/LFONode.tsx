import { makeParamNode } from './ParamNode';

const SYNC_RATES = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4t', '1/8t', '1/16t'];

// Heads-up for Freq targets: modulation into a Freq port is in OCTAVES
// (V/Oct), so vibrato wants tiny amplitudes (~0.02). Free-run frequency is
// hidden while BPM sync drives the rate.
export const LFONode = makeParamNode({
    type: 'lfo',
    title: 'LFO',
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'waveform', label: 'Wave', kind: 'select', options: ['Sine', 'Sawtooth', 'Square', 'Triangle'] },
        { key: 'bpmSync', label: 'BPM Sync', kind: 'toggle' },
        { key: 'syncRate', label: 'Rate', kind: 'select', options: SYNC_RATES, showIf: (d) => !!d.bpmSync },
        { key: 'frequency', label: 'Freq (Hz)', min: 0.01, max: 100, step: 0.1, showIf: (d) => !d.bpmSync },
        { key: 'amplitude', label: 'Amount', min: 0, max: 10, step: 0.01 },
    ],
});
