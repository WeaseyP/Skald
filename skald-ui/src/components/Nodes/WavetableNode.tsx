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
        { id: 'input_pulseWidth', label: 'PW' },
    ],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'position', label: 'Position', min: 0, max: 3, step: 0.01 },
        // `default: 1` is the read-time answer for patches saved before
        // `amplitude` was part of WavetableParams: the card used to render
        // "Amp 0" while the generated code played the codegen fallback of 1.0.
        // No value is written back — the backfill is C1's job.
        { key: 'amplitude', label: 'Amp', min: 0, max: 1, step: 0.05, default: 1 },
        // C5 (F-A01-7/8): the square end's duty cycle and a start-point
        // offset, the two controls the Oscillator had and this node lacked.
        // Defaults are the read-time answer for pre-C5 saves (no backfill
        // needed: the generator reads absence the same way).
        { key: 'pulseWidth', label: 'Pulse Width', min: 0.01, max: 0.99, step: 0.01, default: 0.5 },
        { key: 'phase', label: 'Phase', min: 0, max: 360, step: 1, default: 0 },
        { key: 'fixedPitch', label: 'Fixed Pitch', kind: 'toggle' },
        { key: 'frequency', label: 'Freq (Hz)', min: 20, max: 20000, step: 1, showIf: (d) => !!d.fixedPitch },
        // G4 (roadmap 9.20): an imported table replaces the four-shape morph
        // above — see param_is_reachable's Wavetable case for what stops
        // reading `position`/`pulseWidth` once this is on.
        { key: 'useCustomTable', label: 'Custom Table', kind: 'toggle' },
    ],
});

export default WavetableNode;
