/*
================================================================================
| FILE: skald-ui/src/utils/syncNormalize.ts                                    |
|                                                                              |
| Roadmap packet C7 — BPM-sync value hygiene (F-A03-5/7/8, F-B06-8).            |
|                                                                              |
| A BPM-synced LFO, Sample & Hold or Delay stores TWO truths: the sync         |
| division the generator actually follows (`syncRate`) and a free-run field    |
| (`frequency` / `rate` / `delayTime`) the generator ignores while synced.     |
| Nothing kept the two in step, so a file could carry a free-run value 14%    |
| off its own division (F-A03-5) and turning sync off landed the node on a    |
| stale number. Save and Load now write the RESOLVED value into the free-run  |
| field of every synced node, so there is one truth in the file and toggling |
| sync off is a no-op for the sound. Not a migration: it depends on the       |
| session tempo, so it runs at every save and load rather than once.          |
================================================================================
*/
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { DEFAULT_SYNC_RATE, syncRateToSeconds } from '../definitions/bpm';
import { walkNodes } from './saveMigrations';

type AnyNode = { type?: string; data?: Record<string, unknown> };

/** The free-run field a synced node's resolved time is written into, by codegen type. */
const FREE_RUN_FIELD: Record<string, { key: string; unit: 'hz' | 'seconds' }> = {
    LFO: { key: 'frequency', unit: 'hz' },
    SampleHold: { key: 'rate', unit: 'hz' },
    Delay: { key: 'delayTime', unit: 'seconds' },
};

/** The resolved free-run value for a synced node at `bpm`, or undefined if the type is not syncable. */
export const resolvedFreeRunValue = (node: AnyNode, bpm: number): { key: string; value: number } | undefined => {
    const codegenType = node.type ? NODE_DEFINITIONS[node.type]?.codegenType : undefined;
    const field = codegenType ? FREE_RUN_FIELD[codegenType] : undefined;
    if (!field) return undefined;
    const syncRate = typeof node.data?.syncRate === 'string' ? node.data.syncRate : DEFAULT_SYNC_RATE;
    const seconds = syncRateToSeconds(syncRate, bpm);
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
    return { key: field.key, value: field.unit === 'hz' ? 1 / seconds : seconds };
};

/**
 * Rewrite the free-run field of every BPM-synced node (top level and inside
 * every Instrument subgraph) to the value its division resolves to at `bpm`.
 * Mutates in place; returns how many nodes changed. Unsynced nodes and nodes
 * whose stored value already matches are untouched.
 */
export const normalizeSyncedFreeRun = (nodes: unknown[], bpm: number): number => {
    let changed = 0;
    walkNodes(nodes, (node) => {
        const n = node as AnyNode;
        if (!n.data || n.data.bpmSync !== true) return;
        const resolved = resolvedFreeRunValue(n, bpm);
        if (!resolved) return;
        if (n.data[resolved.key] !== resolved.value) {
            n.data[resolved.key] = resolved.value;
            changed++;
        }
    });
    return changed;
};
