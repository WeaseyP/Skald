import { makeParamNode } from './ParamNode';

export const ADSRNode = makeParamNode({
    type: 'adsr',
    title: 'ADSR',
    inputs: [{ id: 'input', label: 'Gate' }],
    outputs: [{ id: 'output', label: 'Env' }],
    fields: [
        { key: 'attack', label: 'A (s)', min: 0, max: 10, step: 0.01 },
        { key: 'decay', label: 'D (s)', min: 0, max: 10, step: 0.01 },
        { key: 'sustain', label: 'S', min: 0, max: 1, step: 0.05 },
        { key: 'release', label: 'R (s)', min: 0, max: 10, step: 0.01 },
        { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.05 },
        { key: 'velocitySensitivity', label: 'Vel Sens', min: 0, max: 1, step: 0.05 },
    ],
});
