import { makeParamNode } from './ParamNode';

// The input port is NOT a gate. The generated code multiplies the envelope by
// whatever arrives here (the ADSR-direct idiom: audio in, enveloped audio out),
// and the envelope is triggered by the note itself, not by this port. Labelling
// it "Gate" invited users to wire a MIDI gate or a pitch signal into it — which
// multiplies the release tail by zero at note-off (sax3.json does exactly this).
// "In" is the honest label; a gate input is not a thing this node has.
export const ADSRNode = makeParamNode({
    type: 'adsr',
    title: 'ADSR',
    inputs: [{ id: 'input', label: 'In' }],
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
