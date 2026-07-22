import { makeParamNode } from './ParamNode';

export const VisualGainNode = makeParamNode({
    type: 'gain',
    title: 'VCA',
    inputs: [
        { id: 'input', label: 'In' },
        { id: 'input_gain', label: 'Gain' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'gain', label: 'Gain', min: 0, max: 4, step: 0.05 },
    ],
});
