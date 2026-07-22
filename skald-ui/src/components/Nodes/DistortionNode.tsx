import { makeParamNode } from './ParamNode';

export const DistortionNode = makeParamNode({
    type: 'distortion',
    title: 'Distortion',
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'drive', label: 'Drive', min: 1, max: 100, step: 1 },
        { key: 'shape', label: 'Shape', kind: 'select', options: ['classic', 'soft', 'hard', 'asymmetric'] },
        { key: 'tone', label: 'Tone (Hz)', min: 100, max: 20000, step: 50 },
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
    ],
});
