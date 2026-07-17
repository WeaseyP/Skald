import { makeParamNode } from './ParamNode';

// frequency is a RATIO of the played note (backend clamps 0.01–32), not Hz.
// modIndex is radians of phase deviation — the musical range is roughly
// 1–8; large values are noise.
export const FmOperatorNode = makeParamNode({
    type: 'fmOperator',
    title: 'FM Operator',
    inputs: [
        { id: 'input_mod', label: 'Mod' },
        { id: 'input_carrier', label: 'Carrier' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'frequency', label: 'Ratio (× note)', min: 0.01, max: 32, step: 0.01 },
        { key: 'modIndex', label: 'Mod Index', min: 0, max: 1000, step: 0.5 },
    ],
});

export default FmOperatorNode;
