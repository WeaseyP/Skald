import { describe, it, expect } from 'vitest';
import { Node, Edge } from 'reactflow';
import { buildProjectData } from '../../utils/projectSerializer';
import { SequencerTrack, NoteEvent } from '../../definitions/types';

// ---------------------------------------------------------------------------
// Fixtures. buildProjectData is the ONE transform both the live preview and the
// shipped export feed through, so these tests pin its observable output rather
// than any internal step. Style mirrors ProjectSerializer.test.ts.
// ---------------------------------------------------------------------------

const makeInstrument = (id: string, name: string, extraData: Record<string, unknown> = {}): Node => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name,
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: `${id}-osc`, type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
                { id: `${id}-out`, type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: `${id}-osc`, from_port: 'output', to_node: `${id}-out`, to_port: 'input' },
            ],
        },
        ...extraData,
    },
} as unknown as Node);

const makeTrack = (targetNodeId: string, overrides: Partial<SequencerTrack> = {}): SequencerTrack => ({
    id: `track-${targetNodeId}`,
    targetNodeId,
    name: `Track ${targetNodeId}`,
    color: '#fff',
    steps: 16,
    isMuted: false,
    isSolo: false,
    notes: [],
    ...overrides,
});

const note = (overrides: Partial<NoteEvent> = {}): NoteEvent => ({
    step: 0,
    note: 60,
    velocity: 1.0,
    duration: 1,
    ...overrides,
});

describe('buildProjectData — global params plumbing', () => {
    it('plumbs bpm, master_volume and pattern_steps onto project', () => {
        const data = buildProjectData([makeInstrument('i1', 'A')], [], [], 140, 0.7, 24);
        expect(data.project.bpm).toBe(140);
        expect(data.project.master_volume).toBe(0.7);
        expect(data.project.pattern_steps).toBe(24);
    });

    it('defaults pattern_steps to 16 when omitted', () => {
        const data = buildProjectData([makeInstrument('i1', 'A')], [], [], 120, 1.0);
        expect(data.project.pattern_steps).toBe(16);
    });

    it('emits instruments ONLY from instrument nodes; loose canvas nodes are ignored', () => {
        const loose: Node[] = [
            { id: 'midi-1', type: 'midiInput', position: { x: 0, y: 0 }, data: { device: 'Keystep' } } as unknown as Node,
            { id: 'gain-1', type: 'gain', position: { x: 0, y: 0 }, data: { gain: 0.5 } } as unknown as Node,
            makeInstrument('i1', 'OnlyOne'),
        ];
        const data = buildProjectData(loose, [], [], 120, 1.0);
        expect(data.project.instruments).toHaveLength(1);
        expect(data.project.instruments[0].name).toBe('OnlyOne');
    });
});

describe('buildProjectData — mute / solo handling', () => {
    it('does NOT drop a muted track: instrument stays in the array, flagged mute=true, events preserved', () => {
        const track = makeTrack('i1', { isMuted: true, notes: [note({ step: 0 }), note({ step: 4 })] });
        const data = buildProjectData([makeInstrument('i1', 'Muted')], [], [track], 120, 1.0);

        // Instrument is still emitted — muting is a flag the backend honours,
        // not an exclusion the serializer performs.
        expect(data.project.instruments).toHaveLength(1);
        const inst = data.project.instruments[0];
        expect(inst.mute).toBe(true);
        // Its track and its events survive serialization.
        expect(inst.audio_graph.sequencer_tracks[0].mute).toBe(true);
        expect(inst.audio_graph.sequencer_tracks[0].events).toHaveLength(2);
    });

    it('passes solo through per-track without muting the non-soloed instruments', () => {
        // Two instruments; only the first is soloed. The serializer performs NO
        // cross-track solo resolution — both are emitted, each carrying its own
        // solo flag verbatim. (Solo enforcement lives downstream, not here.)
        const soloed = makeTrack('i1', { isSolo: true, notes: [note()] });
        const other = makeTrack('i2', { isSolo: false, notes: [note()] });
        const data = buildProjectData(
            [makeInstrument('i1', 'Lead'), makeInstrument('i2', 'Pad')],
            [], [soloed, other], 120, 1.0
        );

        expect(data.project.instruments).toHaveLength(2);
        const [lead, pad] = data.project.instruments;
        expect(lead.solo).toBe(true);
        expect(pad.solo).toBe(false);
        // Non-soloed instrument is NOT muted as a side effect of another's solo.
        expect(pad.mute).toBe(false);
        expect(pad.audio_graph.sequencer_tracks[0].events).toHaveLength(1);
    });

    it('defaults mute/solo to false when an instrument has no track', () => {
        const data = buildProjectData([makeInstrument('i1', 'Untracked')], [], [], 120, 1.0);
        expect(data.project.instruments[0].mute).toBe(false);
        expect(data.project.instruments[0].solo).toBe(false);
        // No track => empty sequencer_tracks list, but the subgraph still exists.
        expect(data.project.instruments[0].audio_graph.sequencer_tracks).toEqual([]);
    });
});

describe('buildProjectData — per-step patch overrides (p-locks)', () => {
    it('demuxes each note.patchOverrides into its own emitted event; missing overrides become {}', () => {
        const track = makeTrack('i1', {
            notes: [
                note({ step: 0, patchOverrides: { cutoff: 800, resonance: 3 } }),
                note({ step: 2, patchOverrides: { cutoff: 200 } }),
                note({ step: 4 }), // no overrides
            ],
        });
        const data = buildProjectData([makeInstrument('i1', 'PLock')], [], [track], 120, 1.0);
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;

        expect(events[0].patch_overrides).toEqual({ cutoff: 800, resonance: 3 });
        expect(events[1].patch_overrides).toEqual({ cutoff: 200 });
        // The default is a fresh empty object — the field is always present so
        // the backend never has to distinguish "absent" from "no locks".
        expect(events[2].patch_overrides).toEqual({});
    });

    it('passes label-scoped override keys through verbatim (the backend resolves them)', () => {
        const track = makeTrack('i1', {
            notes: [note({ step: 0, patchOverrides: { 'Filter:cutoff': 4000 } })],
        });
        const data = buildProjectData([makeInstrument('i1', 'PLock')], [], [track], 120, 1.0);
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;
        expect(events[0].patch_overrides).toEqual({ 'Filter:cutoff': 4000 });
    });

    it('drops non-numeric overrides (backend applies P-locks via the f32 set_param API)', () => {
        const track = makeTrack('i1', {
            notes: [note({ step: 0, patchOverrides: { 'Osc:waveform': 'Saw', 'Osc:frequency': 220, 'Osc:phase': NaN } as any })],
        });
        const data = buildProjectData([makeInstrument('i1', 'PLock')], [], [track], 120, 1.0);
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;
        // A string override would fail the whole JSON parse backend-side
        // (patch_overrides is map[string]f32); NaN is not representable.
        expect(events[0].patch_overrides).toEqual({ 'Osc:frequency': 220 });
    });

    it('serializes node labels — the backend resolves P-lock keys and collision prefixes from them', () => {
        const data = buildProjectData([makeInstrument('i1', 'L')], [], [], 120, 1.0);
        const nodes = data.project.instruments[0].audio_graph.nodes;
        const osc = nodes.find((n: any) => n.type === 'Oscillator');
        expect(osc.parameters.label).toBe('Osc');
    });
});

describe('buildProjectData — note event derivation', () => {
    it('applies nearestInScale quantization to each note (and nothing else)', () => {
        // Snap every odd MIDI number down one semitone; leave evens alone.
        const quantize = (n: number) => (n % 2 === 1 ? n - 1 : n);
        const track = makeTrack('i1', {
            notes: [note({ step: 0, note: 61, velocity: 0.9 }), note({ step: 1, note: 64 })],
        });
        const data = buildProjectData([makeInstrument('i1', 'Q')], [], [track], 120, 1.0, 16, quantize);
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;

        expect(events[0].note).toBe(60); // 61 -> 60
        expect(events[1].note).toBe(64); // even, untouched
        // Quantization only rewrites pitch; velocity passes through.
        expect(events[0].velocity).toBe(0.9);
    });

    it('passes notes through unchanged when no quantizer is supplied', () => {
        const track = makeTrack('i1', { notes: [note({ note: 61 })] });
        const data = buildProjectData([makeInstrument('i1', 'NoQ')], [], [track], 120, 1.0, 16);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks[0].events[0].note).toBe(61);
    });

    it('derives per-track num_steps from track.steps, independent of the global pattern_steps', () => {
        const track = makeTrack('i1', { steps: 8, notes: [note()] });
        const data = buildProjectData([makeInstrument('i1', 'S')], [], [track], 120, 1.0, 32);
        // Global loop length and this track's own length are distinct fields.
        expect(data.project.pattern_steps).toBe(32);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks[0].num_steps).toBe(8);
    });

    it('derives BPM-true start_time (16th-note grid) and defaults a 0 duration to 1 step', () => {
        const track = makeTrack('i1', { notes: [note({ step: 4, duration: 0 })] });
        const data = buildProjectData([makeInstrument('i1', 'T')], [], [track], 120, 1.0);
        const ev = data.project.instruments[0].audio_graph.sequencer_tracks[0].events[0];
        expect(ev.start_time).toBeCloseTo(4 * (60 / 120 / 4)); // 0.5s at 120 BPM
        expect(ev.duration).toBe(1); // 0 -> 1 step
    });

    it('clamps probability away from 0 (<=0 would read as "field absent" downstream)', () => {
        const track = makeTrack('i1', {
            notes: [note({ step: 0, probability: 0 }), note({ step: 1, probability: 0.5 }), note({ step: 2 })],
        });
        const data = buildProjectData([makeInstrument('i1', 'P')], [], [track], 120, 1.0);
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;
        expect(events[0].probability).toBe(0.001); // clamped, never 0
        expect(events[1].probability).toBe(0.5);
        expect(events[2].probability).toBe(1); // absent -> full chance
    });
});

describe('buildProjectData — MIDI wiring', () => {
    it('reads device from a connected midiInput node; defaults to All otherwise', () => {
        const nodes: Node[] = [
            { id: 'midi-1', type: 'midiInput', position: { x: 0, y: 0 }, data: { device: 'Keystep' } } as unknown as Node,
            makeInstrument('i1', 'Wired'),
        ];
        const edges: Edge[] = [{ id: 'e1', source: 'midi-1', target: 'i1' }];
        const data = buildProjectData(nodes, edges, [], 120, 1.0);
        expect(data.project.instruments[0].midi_config).toEqual({ device: 'Keystep', channel: 1 });

        const noWire = buildProjectData([makeInstrument('i1', 'Bare')], [], [], 120, 1.0);
        expect(noWire.project.instruments[0].midi_config).toEqual({ device: 'All', channel: 1 });
    });
});

describe('buildProjectData — malformed / edge inputs (pinning current behavior)', () => {
    it('tolerates an instrument whose subgraph is undefined: audio_graph is null, no throw', () => {
        const inst: Node = { id: 'i1', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'Empty', voiceCount: 4 } } as unknown as Node;
        const data = buildProjectData([inst], [], [makeTrack('i1', { notes: [note()] })], 120, 1.0);
        expect(data.project.instruments).toHaveLength(1);
        // formatSubgraph(undefined) -> null; no sequencer_tracks are attached
        // because there is no subgraph object to hang them on.
        expect(data.project.instruments[0].audio_graph).toBeNull();
    });

    it('handles an instrument with an empty-but-present subgraph: nodes [] and an empty track list', () => {
        const inst: Node = {
            id: 'i1', type: 'instrument', position: { x: 0, y: 0 },
            data: { name: 'Hollow', voiceCount: 4, subgraph: { nodes: [], connections: [] } },
        } as unknown as Node;
        const data = buildProjectData([inst], [], [], 120, 1.0);
        expect(data.project.instruments[0].audio_graph.nodes).toEqual([]);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks).toEqual([]);
    });

    it('silently drops a track that targets a non-existent node', () => {
        // The track points at 'ghost'; the only real instrument is 'i1'. Since
        // instruments come from instrument nodes and each finds its own track by
        // id, the orphan track produces no output at all — no error, no event.
        const orphan = makeTrack('ghost', { notes: [note(), note({ step: 2 })] });
        const data = buildProjectData([makeInstrument('i1', 'Real')], [], [orphan], 120, 1.0);
        expect(data.project.instruments).toHaveLength(1);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks).toEqual([]);
    });
});
