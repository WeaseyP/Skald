import { makeParamNode } from './ParamNode';

export const ReverbNode = makeParamNode({
    type: 'reverb',
    title: 'Reverb',
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'decay', label: 'Decay (s)', min: 0.1, max: 10, step: 0.1 },
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
    ],
});
