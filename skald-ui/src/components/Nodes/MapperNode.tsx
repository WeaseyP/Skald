import { makeParamNode } from './ParamNode';

// Rescales a modulation signal: input range → output range (clamped).
// The classic use: an envelope/LFO's 0–1 into the hundreds-of-Hz a filter
// cutoff actually needs.
export const MapperNode = makeParamNode({
    type: 'mapper',
    title: 'Mapper',
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'inMin', label: 'In Min', step: 0.1 },
        { key: 'inMax', label: 'In Max', step: 0.1 },
        { key: 'outMin', label: 'Out Min', step: 1 },
        { key: 'outMax', label: 'Out Max', step: 1 },
    ],
});
