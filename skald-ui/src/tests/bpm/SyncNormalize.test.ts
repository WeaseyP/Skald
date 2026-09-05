// Roadmap packet C7 — the stored free-run field of a synced node is the
// resolved division, so the file holds one truth (F-A03-5/7/8, F-B06-8).
import { describe, expect, it } from 'vitest';
import { normalizeSyncedFreeRun, resolvedFreeRunValue } from '../../utils/syncNormalize';

const lfo = (data: Record<string, unknown>) => ({ id: 'l', type: 'lfo', data });

describe('resolvedFreeRunValue', () => {
    it('LFO and Sample & Hold resolve to Hz, Delay to seconds', () => {
        // 1/8 at 120 BPM = 0.25 s -> 4 Hz
        expect(resolvedFreeRunValue(lfo({ syncRate: '1/8' }), 120)).toEqual({ key: 'frequency', value: 4 });
        expect(resolvedFreeRunValue({ type: 'sampleHold', data: { syncRate: '1/4' } }, 120)).toEqual({ key: 'rate', value: 2 });
        expect(resolvedFreeRunValue({ type: 'delay', data: { syncRate: '1/8' } }, 120)).toEqual({ key: 'delayTime', value: 0.25 });
    });

    it('uses the generator default division when none is stored (SKB-058)', () => {
        expect(resolvedFreeRunValue(lfo({}), 120)).toEqual({ key: 'frequency', value: 2 });
    });

    it('is undefined for a node type with no free-run field', () => {
        expect(resolvedFreeRunValue({ type: 'oscillator', data: { syncRate: '1/8' } }, 120)).toBeUndefined();
    });
});

describe('normalizeSyncedFreeRun', () => {
    it('rewrites only synced nodes, and counts them', () => {
        const nodes = [
            lfo({ bpmSync: true, syncRate: '1/8', frequency: 3.4 }),       // stale: 14% off its division
            { id: 'free', type: 'lfo', data: { bpmSync: false, syncRate: '1/8', frequency: 3.4 } },
            { id: 'osc', type: 'oscillator', data: { frequency: 440 } },
        ];
        expect(normalizeSyncedFreeRun(nodes, 120)).toBe(1);
        expect(nodes[0].data.frequency).toBe(4);
        expect(nodes[1].data.frequency).toBe(3.4);
        expect(nodes[2].data.frequency).toBe(440);
    });

    it('recurses into Instrument subgraphs, where nearly every synced node lives', () => {
        const nodes = [{
            id: 'inst', type: 'instrument',
            data: { name: 'I', subgraph: { nodes: [{ id: 'd', type: 'delay', data: { bpmSync: true, syncRate: '1/4', delayTime: 0.9 } }], connections: [] } },
        }];
        expect(normalizeSyncedFreeRun(nodes, 90)).toBe(1);
        const inner = (nodes[0].data.subgraph.nodes[0] as { data: { delayTime: number } }).data;
        expect(inner.delayTime).toBeCloseTo(60 / 90, 9);
    });

    it('is a fixed point: a second pass at the same tempo changes nothing', () => {
        const nodes = [lfo({ bpmSync: true, syncRate: '1/16', frequency: 0 })];
        normalizeSyncedFreeRun(nodes, 140);
        expect(normalizeSyncedFreeRun(nodes, 140)).toBe(0);
    });
});
