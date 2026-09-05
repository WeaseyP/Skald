import { makeParamNode } from './ParamNode';

export const ReverbNode = makeParamNode({
    type: 'reverb',
    title: 'Reverb',
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'decay', label: 'Decay (s)', min: 0.1, max: 10, step: 0.1 },
        // Pre-delay is implemented in the engine (0–0.25 s, clamped) and was
        // reachable only from the sidebar — the node card is the primary
        // editing surface, so it belongs here too. `default` matches the
        // codegen fallback so a save with no `preDelay` key renders 0.02
        // rather than the 0 an absent field used to show.
        { key: 'preDelay', label: 'Pre-Delay (s)', min: 0, max: 0.25, step: 0.005, default: 0.02 },
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
        // C5 (F-A07-7): high-frequency absorption in the feedback path. 0 is
        // the undamped comb every older patch has.
        { key: 'damping', label: 'Damping', min: 0, max: 1, step: 0.05, default: 0 },
    ],
});
