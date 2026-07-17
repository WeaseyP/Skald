import { makeParamNode } from './ParamNode';

export const NoiseNode = makeParamNode({
    type: 'noise',
    title: 'Noise',
    inputs: [{ id: 'input_amp', label: 'Amp' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'type', label: 'Type', kind: 'select', options: ['White', 'Pink'] },
        { key: 'amplitude', label: 'Amp', min: 0, max: 1, step: 0.05 },
    ],
});
