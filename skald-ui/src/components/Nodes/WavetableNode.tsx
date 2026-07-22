import { makeParamNode } from './ParamNode';

// Position morphs sine (0) → triangle (1) → saw (2) → square (3). Pitch
// tracks the played note unless Fixed Pitch is on (same contract as the
// Oscillator).
export const WavetableNode = makeParamNode({
    type: 'wavetable',
    title: 'Wavetable',
    inputs: [
        { id: 'input_freq', label: 'Freq' },
        { id: 'input_pos', label: 'Pos' },
        { id: 'input_amp', label: 'Amp' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'position', label: 'Position', min: 0, max: 3, step: 0.01 },
        { key: 'amplitude', label: 'Amp', min: 0, max: 1, step: 0.05 },
        { key: 'fixedPitch', label: 'Fixed Pitch', kind: 'toggle' },
        { key: 'frequency', label: 'Freq (Hz)', min: 20, max: 20000, step: 1, showIf: (d) => !!d.fixedPitch },
    ],
});

export default WavetableNode;
