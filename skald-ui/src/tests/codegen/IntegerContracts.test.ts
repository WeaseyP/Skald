import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { buildProjectData } from '../../utils/projectSerializer';
import { SequencerTrack, NoteEvent } from '../../definitions/types';

// BUG-INTEGER-CONTROLS-EMIT-FLOATS: the serializer is the last line of defense.
// Every field mapped to an `int`/`u8` in skald-backend/core/types.odin must be
// emitted as a finite, in-range whole number — even when a *stale saved project
// or an import* feeds a fractional value straight into buildProjectData (the one
// transform both the live preview and the export share). A single `17.151` in an
// int field makes the Odin unmarshaller hard-fail and takes the whole build down.

const makeInstrument = (data: Record<string, unknown>): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Loaded',
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [{ from_node: 'osc', from_port: 'output', to_node: 'out', to_port: 'input' }],
        },
        ...data,
    },
} as unknown as Node);

const makeTrack = (overrides: Partial<SequencerTrack> = {}): SequencerTrack => ({
    id: 'track-1',
    targetNodeId: 'inst-1',
    name: 'Track',
    color: '#fff',
    steps: 16,
    isMuted: false,
    isSolo: false,
    notes: [],
    ...overrides,
});

const note = (o: Partial<NoteEvent> = {}): NoteEvent => ({ step: 0, note: 60, velocity: 1, duration: 1, ...o });

describe('integer contracts — instrument voice_count / unison', () => {
    it('normalizes the verbatim 17.151 voiceCount from a stale saved project', () => {
        const data = buildProjectData([makeInstrument({ voiceCount: 17.151 })], [], [], 120, 1.0, 16);
        const inst = data.project.instruments[0];
        expect(inst.voice_count).toBe(17);
        expect(Number.isInteger(inst.voice_count)).toBe(true);
    });

    it('never lets a fractional voice_count reach the serialized JSON', () => {
        const json = JSON.stringify(buildProjectData([makeInstrument({ voiceCount: 17.151 })], [], [], 120, 1.0));
        expect(json).not.toContain('17.151');
    });

    it('rounds and clamps unison to 1..16', () => {
        expect(buildProjectData([makeInstrument({ unison: 3.9 })], [], [], 120, 1.0).project.instruments[0].unison).toBe(4);
        expect(buildProjectData([makeInstrument({ unison: 99 })], [], [], 120, 1.0).project.instruments[0].unison).toBe(16);
    });

    it('rejects NaN / Infinity to the backend default (1, not clamped) and leaves a missing value absent', () => {
        // B6-1-x2: the backend owns absent-value defaults. A non-finite
        // authored value is garbage the JSON cannot even carry (NaN -> null
        // -> 0 -> 1 in build_project_from_raw), so it resolves to the same 1
        // here; a MISSING value is not invented at all — the key is left out
        // and the generator resolves it exactly as it does for a -in: run.
        // This used to pin 8, the editor's invented default.
        expect(buildProjectData([makeInstrument({ voiceCount: NaN })], [], [], 120, 1.0).project.instruments[0].voice_count).toBe(1);
        expect(buildProjectData([makeInstrument({ voiceCount: Infinity })], [], [], 120, 1.0).project.instruments[0].voice_count).toBe(1);
        const missing = JSON.parse(JSON.stringify(buildProjectData([makeInstrument({})], [], [], 120, 1.0)));
        expect(missing.project.instruments[0]).not.toHaveProperty('voice_count');
    });
});

describe('integer contracts — project pattern_steps & track num_steps', () => {
    it('rounds a fractional pattern_steps', () => {
        expect(buildProjectData([makeInstrument({})], [], [], 120, 1.0, 24.6).project.pattern_steps).toBe(25);
    });

    it('rounds a fractional track.steps into num_steps', () => {
        const data = buildProjectData([makeInstrument({})], [], [makeTrack({ steps: 8.4, notes: [note()] })], 120, 1.0);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks[0].num_steps).toBe(8);
    });
});

describe('integer contracts — note event step (int) & note (u8)', () => {
    it('rounds fractional step and note, clamping note to 0..127', () => {
        const track = makeTrack({ notes: [note({ step: 3.9, note: 60.7 }), note({ step: 1, note: 999 })] });
        const events = buildProjectData([makeInstrument({})], [], [track], 120, 1.0).project.instruments[0].audio_graph.sequencer_tracks[0].events;
        expect(events[0].step).toBe(4);
        expect(events[0].note).toBe(61);
        expect(events[1].note).toBe(127); // clamped into u8 MIDI range
    });

    it('keeps nearestInScale output whole (quantizer can return fractional garbage)', () => {
        const track = makeTrack({ notes: [note({ note: 60 })] });
        const data = buildProjectData([makeInstrument({})], [], [track], 120, 1.0, 16, () => 61.5);
        expect(data.project.instruments[0].audio_graph.sequencer_tracks[0].events[0].note).toBe(62);
    });
});

describe('integer contracts — midi channel', () => {
    it('normalizes a fractional channel carried on a midiInput node', () => {
        const nodes: Node[] = [
            { id: 'midi-1', type: 'midiInput', position: { x: 0, y: 0 }, data: { device: 'K', channel: 2.9 } } as unknown as Node,
            makeInstrument({}),
        ];
        const data = buildProjectData(nodes, [{ id: 'e', source: 'midi-1', target: 'inst-1' }] as any, [], 120, 1.0);
        expect(data.project.instruments[0].midi_config.channel).toBe(3);
    });
});

describe('fractional fields retain precision (no blanket rounding)', () => {
    it('preserves bpm, glide, detune, volume, velocity, duration, probability', () => {
        const track = makeTrack({ notes: [note({ step: 0, velocity: 0.87, duration: 1.5, probability: 0.33 })] });
        const data = buildProjectData(
            [makeInstrument({ glide: 0.055, detune: 30.024, volume: 0.42 })],
            [], [track], 120.5, 0.77
        );
        const inst = data.project.instruments[0];
        expect(data.project.bpm).toBe(120.5);
        expect(data.project.master_volume).toBe(0.77);
        expect(inst.glide).toBe(0.055);
        expect(inst.detune).toBe(30.024);
        expect(inst.volume).toBe(0.42);
        const ev = inst.audio_graph.sequencer_tracks[0].events[0];
        expect(ev.velocity).toBe(0.87);
        expect(ev.duration).toBe(1.5);
        expect(ev.probability).toBe(0.33);
    });
});
