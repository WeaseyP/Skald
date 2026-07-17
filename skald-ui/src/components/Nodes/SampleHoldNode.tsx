import { makeParamNode } from './ParamNode';

const SYNC_RATES = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4t', '1/8t', '1/16t'];

export const SampleHoldNode = makeParamNode({
    type: 'sampleHold',
    title: 'S & H',
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'bpmSync', label: 'BPM Sync', kind: 'toggle' },
        { key: 'syncRate', label: 'Rate', kind: 'select', options: SYNC_RATES, showIf: (d) => !!d.bpmSync },
        { key: 'rate', label: 'Rate (Hz)', min: 0.1, max: 1000, step: 0.5, showIf: (d) => !d.bpmSync },
        { key: 'amplitude', label: 'Amount', min: 0, max: 10, step: 0.01 },
    ],
});
