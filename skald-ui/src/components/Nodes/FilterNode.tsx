import { makeParamNode } from './ParamNode';

export const FilterNode = makeParamNode({
    type: 'filter',
    title: 'Filter',
    inputs: [
        { id: 'input', label: 'In' },
        { id: 'input_cutoff', label: 'Cut' },
        { id: 'input_res', label: 'Res' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'type', label: 'Type', kind: 'select', options: ['Lowpass', 'Highpass', 'Bandpass', 'Notch'] },
        { key: 'cutoff', label: 'Freq (Hz)', min: 20, max: 20000, step: 1 },
        { key: 'resonance', label: 'Res', min: 0.1, max: 20, step: 0.1 },
    ],
});
