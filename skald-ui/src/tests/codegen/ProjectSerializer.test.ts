import { describe, it, expect } from 'vitest';
import { Node } from 'reactflow';
import {
    buildProjectData,
    topologySignature,
    getUniqueExposedParams,
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

    it('does NOT mask collided exposed names (codegen suffixes them unpredictably)', () => {
        // Second node exposing 'cutoff' too -> collision -> value changes
        // must trigger a rebuild instead of the instant path.
        const collided = (cutoff: number) => {
            const inst = makeInstrument({ filterData: { cutoff } });
            (inst.data as any).subgraph.nodes.push({
                id: 'flt2', type: 'filter', position: { x: 0, y: 0 },
                data: { label: 'Filter2', type: 'Lowpass', cutoff: 500, resonance: 1, exposedParameters: ['cutoff'] },
            });
            return topologySignature(build(inst));
        };
        expect(collided(800)).not.toBe(collided(4000));
    });
});

describe('getUniqueExposedParams', () => {
    it('counts exposures across the whole subgraph', () => {
        const inst = makeInstrument();
        (inst.data as any).subgraph.nodes.push({
            id: 'flt2', type: 'filter', position: { x: 0, y: 0 },
            data: { label: 'Filter2', cutoff: 500, exposedParameters: ['cutoff', 'resonance'] },
        });
        const counts = getUniqueExposedParams(inst);
        expect(counts.get('cutoff')).toBe(2);
        expect(counts.get('resonance')).toBe(1);
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
