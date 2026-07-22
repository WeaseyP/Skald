import { makeParamNode } from './ParamNode';

// Pitch tracks the played note by default; the frequency box only appears
// when Fixed Pitch is on (an editable-but-inert control is a lie), and the
// pulse width only when the waveform is Square.
export const OscillatorNode = makeParamNode({
    type: 'oscillator',
    title: 'Oscillator',
    inputs: [
        { id: 'input_freq', label: 'Freq' },
        { id: 'input_amp', label: 'Amp' },
        { id: 'input_pulseWidth', label: 'PW' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'waveform', label: 'Wave', kind: 'select', options: ['Sine', 'Sawtooth', 'Square', 'Triangle'] },
        { key: 'amplitude', label: 'Amp', min: 0, max: 1, step: 0.05 },
        { key: 'pulseWidth', label: 'PW', min: 0.01, max: 0.99, step: 0.01, showIf: (d) => d.waveform === 'Square' },
        { key: 'fixedPitch', label: 'Fixed Pitch', kind: 'toggle' },
        { key: 'frequency', label: 'Freq (Hz)', min: 20, max: 20000, step: 1, showIf: (d) => !!d.fixedPitch },
    ],
});
