import { makeParamNode } from './ParamNode';

export const PannerNode = makeParamNode({
    type: 'panner',
    title: 'Panner',
    inputs: [
        { id: 'input', label: 'In' },
        { id: 'input_pan', label: 'Pan' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'pan', label: 'Pan (L/R)', min: -1, max: 1, step: 0.05 },
    ],
});
