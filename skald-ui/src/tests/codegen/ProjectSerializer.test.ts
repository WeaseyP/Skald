import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
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

// Packet B6-1 (SKB-019): a graph with no Instrument node is a legacy "loose
// graph" — 24 shipped examples are this shape. Before this packet,
// buildProjectData serialized it to a ZERO-instrument project, which the
// backend rejects outright ("Input JSON must be valid Project or Graph",
// exit 1): Play and Generate could not touch a single one of them, even
// though the CLI's own fallback (build_project_from_graph_raw,
// skald-backend/core/json.odin:531) has always wrapped the same shape as one
// SFX instrument named "Asset". This is a MIRROR of that fallback, not a
// second one — same id/name, same voice_count/unison, and volume/limit left
// out of the JSON entirely so the backend's own absent-value resolution
// (`volume <= 0 -> 1.0`, `limit.? or_else true`) decides them.
describe('buildProjectData — loose graph auto-wrap (SKB-019 / packet B6-1)', () => {
    const looseNodes: Node[] = [
        {
            id: 'osc', type: 'oscillator', position: { x: 0, y: 0 },
            data: { label: 'Osc', waveform: 'Sawtooth', frequency: 440, amplitude: 0.5 },
        } as unknown as Node,
        {
            id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 },
            data: { label: 'Out', name: 'output' },
        } as unknown as Node,
    ];
    const looseEdges: Edge[] = [
        { id: 'e1', source: 'osc', sourceHandle: 'output', target: 'out', targetHandle: 'input' } as unknown as Edge,
    ];

    it('wraps a graph with no Instrument node as exactly one Asset instrument carrying the whole graph', () => {
        const data = buildProjectData(looseNodes, looseEdges, [], 120, 1.0, 16);
        expect(data.project.instruments).toHaveLength(1);
        const inst = data.project.instruments[0];

        expect(inst.id).toBe('Asset');
        expect(inst.name).toBe('Asset');
        expect(inst.voice_count).toBe(1);
        expect(inst.unison).toBe(1);
        // Left absent, not defaulted here — matches the CLI's literal, which
        // sets only id/name/voice_count/unison/audio_graph and leaves
        // everything else (including volume and limit) at Project_Instrument_Raw's
        // zero value for the backend to resolve.
        expect(inst).not.toHaveProperty('volume');
        expect(inst).not.toHaveProperty('limit');

        // The WHOLE envelope becomes the instrument's audio_graph: every
        // top-level node, and the top-level edges translated to the
        // from_node/to_node connection shape (same translation formatSubgraph
        // does for a real instrument's subgraph).
        expect(inst.audio_graph.nodes).toHaveLength(2);
        expect(inst.audio_graph.nodes.map((n: any) => n.id)).toEqual(['osc', 'out']);
        expect(inst.audio_graph.connections).toEqual([
            { from_node: 'osc', from_port: 'output', to_node: 'out', to_port: 'input' },
        ]);
        expect(inst.audio_graph.sequencer_tracks).toEqual([]);
    });

    it('does not touch a graph that already has an Instrument node, even alongside stray top-level nodes', () => {
        // Mirrors the CLI's guard exactly: `len(insts) == 0`, not
        // `len(nodes) == 0` — a graph is only "loose" when NO Instrument node
        // exists anywhere on the canvas, not when some other node also sits
        // outside one.
        const mixed = [...looseNodes, makeInstrument()];
        const data = buildProjectData(mixed, looseEdges, [], 120, 1.0, 16);
        expect(data.project.instruments).toHaveLength(1);
        expect(data.project.instruments[0].id).toBe('inst-1');
        expect(data.project.instruments[0].name).toBe('TestBass');
    });

    it('does not wrap an empty canvas into a phantom instrument', () => {
        const data = buildProjectData([], [], [], 120, 1.0, 16);
        expect(data.project.instruments).toEqual([]);
    });
});

describe('B6-1-x3 — the instrument predicate matches exactly the two spellings the backend does', () => {
    const capitalised = (): Node => ({ ...makeInstrument(), type: 'Instrument' } as unknown as Node);

    it('serializes a node typed "Instrument" as an instrument instead of auto-wrapping it', () => {
        const project = buildProjectData([capitalised()], [], [], 120, 1.0, 16);
        // Before B6-1-x3 this came out as ONE instrument named "Asset" whose
        // only node was the Instrument itself, serialized as type "Unknown".
        expect(project.project.instruments).toHaveLength(1);
        expect(project.project.instruments[0].name).toBe('TestBass');
        expect(project.project.instruments[0].audio_graph.nodes.map((n: { type: string }) => n.type)).not.toContain('Unknown');
    });

    it('does not widen to spellings the backend rejects', () => {
        // normalize_node_type is an exact-match switch: "INSTRUMENT" falls
        // through to the unknown-type path in the CLI, so the editor must
        // not treat it as an instrument either.
        const shouting = { ...makeInstrument(), type: 'INSTRUMENT' } as unknown as Node;
        const project = buildProjectData([shouting], [], [], 120, 1.0, 16);
        expect(project.project.instruments).toHaveLength(1);
        expect(project.project.instruments[0].name).toBe('Asset');
    });
});
