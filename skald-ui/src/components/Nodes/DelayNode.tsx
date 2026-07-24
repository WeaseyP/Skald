import { makeParamNode } from './ParamNode';
// Shared list: the parameter panel's sync-rate dropdown edits the same
// stored value — a mismatched list rendered panel-picked rates as blank here.
import { SYNC_RATE_OPTIONS as SYNC_RATES } from '../../definitions/bpm';

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
