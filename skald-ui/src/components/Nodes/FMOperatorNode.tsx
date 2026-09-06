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
        { id: 'input_amp', label: 'Amp in' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'frequency', label: 'Ratio (× note)', min: 0.01, max: 32, step: 0.01 },
        { key: 'modIndex', label: 'Mod Index', min: 0, max: 1000, step: 0.5 },
        // C5 (F-A02-7): output level. On a modulator this IS the modulation
        // depth, independent of the carrier's Mod Index; on a carrier it is
        // how loud. Default 1 = the full-scale sin() the node always emitted.
        { key: 'amplitude', label: 'Amp', min: 0, max: 1, step: 0.05, default: 1 },
    ],
});

export default FmOperatorNode;
