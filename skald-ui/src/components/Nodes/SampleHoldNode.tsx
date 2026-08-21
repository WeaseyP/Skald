import { makeParamNode } from './ParamNode';
// Shared list: the parameter panel's sync-rate dropdown edits the same
// stored value — a mismatched list rendered panel-picked rates as blank here.
import { DEFAULT_SYNC_RATE, SYNC_RATE_OPTIONS as SYNC_RATES, bpmSyncToggleChanges } from '../../definitions/bpm';

export const SampleHoldNode = makeParamNode({
    type: 'sampleHold',
    title: 'S & H',
    outputs: [{ id: 'output', label: 'Out' }],
    fields: [
        { key: 'bpmSync', label: 'BPM Sync', kind: 'toggle', deriveChanges: (v, d) => bpmSyncToggleChanges(!!v, d) },
        { key: 'syncRate', label: 'Rate', kind: 'select', options: SYNC_RATES, default: DEFAULT_SYNC_RATE, showIf: (d) => !!d.bpmSync },
        { key: 'rate', label: 'Rate (Hz)', min: 0.1, max: 1000, step: 0.5, showIf: (d) => !d.bpmSync },
        { key: 'amplitude', label: 'Amount', min: 0, max: 10, step: 0.01 },
    ],
});
