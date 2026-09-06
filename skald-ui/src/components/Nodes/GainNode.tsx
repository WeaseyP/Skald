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
        // C4 (F-A04-4): which arithmetic the Gain port uses. Shown, not
        // hidden, because the two forms sound completely different with the
        // same envelope wired in, and a pre-C4 node keeps 'add' on purpose.
        {
            key: 'gainMode', label: 'Gain in', kind: 'select', options: ['multiply', 'add'], default: 'add',
            hint: (v) => (v === 'multiply' ? 'knob × input (envelope shapes from silence)' : 'knob + input (legacy: knob is the floor)'),
        },
    ],
});
