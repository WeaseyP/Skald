import { makeParamNode } from './ParamNode';

const SYNC_RATES = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4t', '1/8t', '1/16t'];

export const DelayNode = makeParamNode({
    type: 'delay',
    title: 'Delay',
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'bpmSync', label: 'BPM Sync', kind: 'toggle' },
        { key: 'syncRate', label: 'Time', kind: 'select', options: SYNC_RATES, showIf: (d) => !!d.bpmSync },
        { key: 'delayTime', label: 'Time (s)', min: 0, max: 2, step: 0.01, showIf: (d) => !d.bpmSync },
        { key: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01 },
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
    ],
});
