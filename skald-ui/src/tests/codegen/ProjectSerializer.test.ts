import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import {
    buildProjectData,
    topologySignature,
    liveParamKey,
    canApplyParamLive,
} from '../../utils/projectSerializer';

const makeInstrument = (overrides: { filterData?: Record<string, unknown>, oscData?: Record<string, unknown> } = {}): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'TestBass',
        voiceCount: 2,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sawtooth', frequency: 440, amplitude: 0.5, ...overrides.oscData } },
                { id: 'flt', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1, exposedParameters: ['cutoff'], ...overrides.filterData } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'flt', to_port: 'input' },
                { from_node: 'flt', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const build = (inst: Node) => buildProjectData([inst], [], [], 120, 1.0, 16);

describe('projectSerializer topology signature', () => {
    it('ignores value changes to uniquely-exposed params (instant path, no rebuild)', () => {
        const a = topologySignature(build(makeInstrument({ filterData: { cutoff: 800 } })));
        const b = topologySignature(build(makeInstrument({ filterData: { cutoff: 4000 } })));
        expect(a).toBe(b);
    });

    it('changes when a NON-exposed param changes (rebuild required)', () => {
        const a = topologySignature(build(makeInstrument({ oscData: { frequency: 440 } })));
        const b = topologySignature(build(makeInstrument({ oscData: { frequency: 220 } })));
        expect(a).not.toBe(b);
    });

    it('changes when the exposure set itself changes', () => {
        const a = topologySignature(build(makeInstrument()));
        const b = topologySignature(build(makeInstrument({ filterData: { exposedParameters: [] } })));
        expect(a).not.toBe(b);
    });

    it('also masks COLLIDED exposed names — node-keyed set_param applies them live (sax multi-filter bug)', () => {
        // Second node exposing 'cutoff' too. These edits are applied live via
        // the "<nodeId>::<param>" alias, so they must NOT change the
        // signature (a signature change forced a rebuild that killed the
        // sounding voices — the edit was only audible at the next note).
        const collided = (cutoff: number) => {
            const inst = makeInstrument({ filterData: { cutoff } });
            (inst.data as any).subgraph.nodes.push({
                id: 'flt2', type: 'filter', position: { x: 0, y: 0 },
                data: { label: 'Filter2', type: 'Lowpass', cutoff: 500, resonance: 1, exposedParameters: ['cutoff'] },
            });
            return topologySignature(build(inst));
        };
        expect(collided(800)).toBe(collided(4000));
    });

    it('does NOT mask an exposed param whose live key exceeds the wasm name buffer', () => {
        // Masked-but-not-live-appliable would mean the edit changes nothing
        // until an unrelated rebuild; oversized keys must keep rebuilding.
        const hugeId = 'n'.repeat(200);
        expect(canApplyParamLive(hugeId, 'cutoff', 800)).toBe(false);
        const withHugeNode = (cutoff: number) => {
            const inst = makeInstrument();
            (inst.data as any).subgraph.nodes.push({
                id: hugeId, type: 'filter', position: { x: 0, y: 0 },
                data: { label: 'Far', type: 'Lowpass', cutoff, resonance: 1, exposedParameters: ['cutoff'] },
            });
            return topologySignature(build(inst));
        };
        expect(withHugeNode(800)).not.toBe(withHugeNode(4000));
    });
});

describe('liveParamKey', () => {
    it('builds the node-scoped key the generated set_param dispatch accepts', () => {
        expect(liveParamKey('sax-formant', 'cutoff')).toBe('sax-formant::cutoff');
        expect(canApplyParamLive('sax-formant', 'cutoff', 1600)).toBe(true);
    });
});

describe('canApplyParamLive — value guard (F-C1-3)', () => {
    // skald_set_param carries an f32. A value the instant path cannot carry
    // must return false so the edit falls back to a full rebuild — the old
    // key-only check let bad values be masked out of the topology signature
    // AND skipped by the instant path: the edit changed nothing, silently.
    it('accepts ordinary finite numbers', () => {
        expect(canApplyParamLive('flt', 'cutoff', 0)).toBe(true);
        expect(canApplyParamLive('flt', 'cutoff', -20000)).toBe(true);
        expect(canApplyParamLive('flt', 'cutoff', 3.4e38)).toBe(true); // inside f32 range
    });

    it('rejects non-finite numbers', () => {
        expect(canApplyParamLive('flt', 'cutoff', NaN)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', Infinity)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', -Infinity)).toBe(false);
    });

    it('rejects non-numbers', () => {
        expect(canApplyParamLive('flt', 'cutoff', '4000')).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', undefined)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', null)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', { v: 1 })).toBe(false);
    });

    it('rejects values past the f32 range (they arrive in wasm as Infinity)', () => {
        expect(canApplyParamLive('flt', 'cutoff', 3.5e38)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', -1e39)).toBe(false);
        expect(canApplyParamLive('flt', 'cutoff', Number.MAX_VALUE)).toBe(false);
    });

    it('does NOT mask an exposed param holding a live-inapplicable value — the edit must rebuild, not vanish', () => {
        // NaN serializes to null, so if the signature masked it the two
        // graphs would hash identically and no rebuild would ever fire.
        const sig = (cutoff: number) =>
            topologySignature(build(makeInstrument({ filterData: { cutoff } })));
        expect(sig(NaN)).not.toBe(sig(800));
    });
});

describe('buildProjectData', () => {
    it('serializes instruments in canvas order with subgraph and midi defaults', () => {
        const data = build(makeInstrument());
        expect(data.project.instruments).toHaveLength(1);
        const inst = data.project.instruments[0];
        expect(inst.name).toBe('TestBass');
        expect(inst.voice_count).toBe(2);
        expect(inst.audio_graph.nodes).toHaveLength(3);
        expect(inst.audio_graph.sequencer_tracks).toEqual([]);
        expect(inst.midi_config).toEqual({ device: 'All', channel: 1 });
    });
});
