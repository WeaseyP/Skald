/*
================================================================================
| FILE: skald-ui/src/utils/projectSerializer.ts                                |
|                                                                              |
| Pure transform from React Flow graph state to the Project JSON the backend  |
| codegen consumes. Shared by the explicit Generate flow (useCodeGeneration)  |
| and the live wasm preview (useWasmAudioEngine) so the preview build and the |
| shipped export are fed byte-identical project descriptions.                 |
================================================================================
*/
import { Node, Edge } from '@xyflow/react';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { NodeParams, SequencerTrack, InstrumentParams } from '../definitions/types';
import { isExportablePlockValue } from './plockTargets';

export interface ProjectStructure {
    project: {
        bpm: number;
        master_volume: number;
        pattern_steps: number;
        instruments: any[];
    }
}

// Last line of defense for BUG-INTEGER-CONTROLS-EMIT-FLOATS. Every field that
// maps to an `int`/`u8` in skald-backend/core/types.odin MUST cross IPC as a
// finite whole number in range — the Odin json unmarshaller hard-fails on a
// fractional value for an int field (Unsupported_Type_Error{id = int, kind =
// Float}), which kills the whole codegen/preview build. This normalizes even
// when the value arrives fractional from a stale saved project or an import,
// not only from a live control. Fractional fields (bpm, volume, glide, detune,
// velocity, duration, probability, DSP params) never pass through here — they
// keep their full precision.
const toInt = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
};

// Helper: Recursively format nodes, handling subgraphs
const formatNodesForCodegen = (nodeList: Node<NodeParams>[]): any[] => {
    return nodeList.map(node => {
        const definition = NODE_DEFINITIONS[node.type!];
        const typeName = definition ? definition.codegenType : 'Unknown';

        let parameters: any = { ...node.data };

        // Clean up UI-only params. `label` is NOT UI-only: the backend
        // resolves P-lock keys ("Label:param") and collision-prefixed
        // field names from it — deleting it made every P-lock unresolvable.
        delete parameters.analyser;
        delete parameters.subgraph; // Subgraph handled separately

        // Special Handling per Type
        if (node.type === 'output' || node.type === 'GraphOutput') {
            parameters = {};
        }
        else if (node.type === 'gain') {
            // Ensure gain is a float
            parameters.gain = parseFloat(parameters.gain);
        }

        // BUG-TWO-IDS-IN-JSON: removed `id_raw` (duplicate of `id` —
        // backend never reads it) and the top-level `exposed_parameters`
        // (snake_case — also dead; the backend reads
        // `parameters.exposedParameters` carried by the spread above).
        return {
            id: node.id,
            type: typeName,
            position: node.position,
            parameters: parameters,
        };
    });
};

const formatSubgraph = (subgraph: { nodes: Node[], connections: any[] }): any => {
    if (!subgraph) return null;

    return {
        nodes: formatNodesForCodegen(subgraph.nodes),
        connections: subgraph.connections.map((edge: any) => ({
            from_node: edge.source || edge.from_node,
            from_port: edge.sourceHandle || edge.from_port || 'output',
            to_node: edge.target || edge.to_node,
            to_port: edge.targetHandle || edge.to_port || 'input'
        }))
    };
};

// The event-level view of a sequencer track the backend consumes: quantized
// note, BPM-derived start_time, the probability floor, and the P-lock export
// filter. Used IDENTICALLY by a real instrument's subgraph.sequencer_tracks
// and the loose-graph wrap's audio_graph.sequencer_tracks (SKB-019 / packet
// B6-1) — extracted so the BPM formula, the probability floor and the
// patch_overrides filter live in exactly one place rather than two copies
// that can silently drift apart (the defect class this whole packet exists to
// stop, SKB-002).
const serializeTracks = (
    tracks: SequencerTrack[],
    bpm: number,
    nearestInScale?: (note: number) => number
): any[] => tracks.map(track => ({
    target_node_id: track.targetNodeId,
    name: track.name,
    mute: track.isMuted,
    solo: track.isSolo,
    // num_steps is an int track length (Sequencer_Track.num_steps).
    num_steps: toInt(track.steps, 16, 1, 1024),
    events: track.notes.map(n => ({
        // Quantize at export with the same function the preview uses at
        // schedule time — what you hear in the browser is what ships.
        // `note` is a u8 (0..127 MIDI); force it whole and in range so it
        // unmarshals.
        note: toInt(nearestInScale ? nearestInScale(n.note) : n.note, 60, 0, 127),
        velocity: n.velocity,
        // step is an int grid index (Note_Event.step).
        step: toInt(n.step, 0, 0, 1023),
        // Seconds, BPM-derived (16th-note steps). The old value hardcoded
        // 0.25s/step regardless of tempo.
        start_time: n.step * (60.0 / bpm / 4.0),
        // Duration is in STEPS; the preview defaults a missing/zero duration
        // to 1 step, not 0.1.
        duration: n.duration || 1,
        // Chance the step fires each loop. Clamped away from 0 because the
        // backend treats <=0 as "field absent — play always".
        probability: Math.max(n.probability ?? 1, 0.001),
        // P-locks: per-step parameter overrides. Numeric only: the backend
        // applies them through the f32 set_param API (a string override —
        // e.g. a waveform switch — would fail the whole JSON parse
        // backend-side).
        //
        // The filter is still silent HERE, on purpose: this is a pure
        // transform shared by the preview and the export, and it must stay
        // pure. SKB-045's report happens where the user is — the step editor
        // flags the override and useCodeGeneration surfaces it on Generate —
        // through isExportablePlockValue, this same predicate, so what is
        // flagged is exactly what is dropped.
        patch_overrides: Object.fromEntries(
            Object.entries(n.patchOverrides ?? {})
                .filter(([, v]) => isExportablePlockValue(v))
        )
    }))
}));

// Mirror of normalize_node_type's Instrument arm (skald-backend/core/json.odin):
//
//     case "Instrument", "instrument": return "Instrument"
//
// EXACTLY those two spellings — an exact-match switch, not strings.equal_fold
// (the comment this replaces claimed equal_fold; it was wrong, and a
// toLowerCase() mirror of it would have accepted "INSTRUMENT", which the
// generator does not). The wrap decision below (packet B6-1) rides on this
// predicate, so a hand-authored "Instrument" used to be auto-wrapped by the
// editor into an Asset whose only node serialized as type "Unknown" while the
// CLI saw a real instrument and did not wrap (B6-1-x3).
export const isInstrumentNodeType = (type: string | undefined): boolean =>
    type === 'instrument' || type === 'Instrument';

// The instrument nodes in the order they appear on the canvas. For the order
// the emitted project uses, see orderedInstrumentNodes.
export const getInstrumentNodes = (nodes: Node<NodeParams>[]): Node<NodeParams>[] =>
    nodes.filter(n => isInstrumentNodeType(n.type));

// Mirror of sanitize_identifier(s, allow_leading_digit = true)
// (skald-backend/core/param_utils.odin), byte for byte: the Odin walks the
// UTF-8 BYTES of the id and maps every byte outside [A-Za-z0-9_] to '_', so a
// three-byte character becomes three underscores, and an empty id becomes
// "n". A char-based JS loop would produce ONE underscore per character and
// could order two ids differently from the backend.
export const sanitizeIdentifier = (s: string): string => {
    const bytes = new TextEncoder().encode(s);
    let out = '';
    for (const b of bytes) {
        const ok = (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a) || (b >= 0x30 && b <= 0x39) || b === 0x5f;
        out += ok ? String.fromCharCode(b) : '_';
    }
    return out.length === 0 ? 'n' : out;
};

// The instrument order every consumer agrees on — asset indices in the
// emitted project, the wasm shim's `switch asset` dispatch, the engine's
// set-param and step-clock addressing: SORTED BY SANITIZED ID, byte order,
// exactly build_project_from_graph_raw's `a.id < b.id` (SKB-003 / F-B04-1).
// B6-1-x1: this used to be canvas order, so every multi-instrument song came
// out of the editor in a different order from the CLI and the two paths'
// asset 0 were different instruments. Ties cannot occur: two nodes
// sanitizing to one id are a hard error in the generator (B9-2). The keys
// are ASCII by construction, so JS string `<` is byte order here.
export const orderedInstrumentNodes = (nodes: Node<NodeParams>[]): Node<NodeParams>[] =>
    getInstrumentNodes(nodes)
        .map(n => ({ n, key: sanitizeIdentifier(n.id) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map(x => x.n);

export const buildProjectData = (
    nodes: Node<NodeParams>[],
    edges: Edge[],
    sequencerTracks: SequencerTrack[],
    bpm: number,
    masterVolume: number,
    // Global pattern length: the loop boundary the preview engine uses.
    // Without it the generated loop silently reverted to 16 steps.
    patternSteps = 16,
    // Scale quantizer from ScaleContext: notes must be quantized at export
    // exactly as they are at preview-schedule time.
    nearestInScale?: (note: number) => number
): ProjectStructure => {
    const projectData: ProjectStructure = {
        project: {
            bpm: bpm,
            // THE one documented editor/CLI difference (B6-1-x2 decision,
            // 2026-09-05): the editor exports its live master fader, which
            // for a session-less legacy file is the fader's default, while
            // the CLI resolves an absent masterVolume to unity. The
            // cross-path corpus gate (B6-1-x4) strips this literal before
            // comparing the two emissions; everything else must match.
            master_volume: masterVolume,
            // pattern_steps is an int loop length; never let a fractional value
            // reach the backend. Min 1 (0 = "fall back to track length" is a
            // backend concept the UI never emits explicitly here).
            pattern_steps: toInt(patternSteps, 16, 1, 1024),
            instruments: []
        }
    };

    const instrumentNodes = orderedInstrumentNodes(nodes);

    // SKB-019 / packet B6-1: a graph with no Instrument node at all is a
    // legacy "loose graph" — nearly every pre-Instrument-node example ships
    // this shape. Without this branch it serialized to a ZERO-instrument
    // project, which the backend rejects outright ("Input JSON must be valid
    // Project or Graph", exit 1) — Play and Generate could not touch 24
    // shipped examples the CLI has always been able to build.
    //
    // MIRROR, not a second fallback: this reproduces
    // build_project_from_graph_raw's own loose-graph branch
    // (skald-backend/core/json.odin:531) field-for-field — same id/name
    // ("Asset"), same voice_count/unison (1/1), and volume/limit are left OUT
    // of the emitted JSON entirely (not defaulted to 1.0/true here) so the
    // backend's own absent-value resolution (`volume <= 0 -> 1.0`,
    // `limit.? or_else true` in build_project_from_raw) is the ONE place that
    // decides them, exactly as it is for the CLI's wrap. Guarded the same way
    // too: an empty canvas (`nodes.length === 0`) must NOT be wrapped into a
    // phantom instrument — buildModule's "No instruments on the canvas" guard
    // (useWasmAudioEngine.ts) depends on a truly empty graph still producing
    // zero instruments.
    if (instrumentNodes.length === 0 && nodes.length > 0) {
        // Same translation formatSubgraph does for a real instrument's
        // subgraph (`edge.source`/`sourceHandle` -> `from_node`/`from_port`):
        // the whole top-level graph stands in for a subgraph here, so it must
        // go through the identical connection shape rather than a second copy
        // of the mapping.
        const audioGraph = formatSubgraph({ nodes, connections: edges } as any);
        audioGraph.sequencer_tracks = serializeTracks(sequencerTracks, bpm, nearestInScale);

        projectData.project.instruments = [{
            id: 'Asset',
            name: 'Asset',
            voice_count: 1,
            unison: 1,
            audio_graph: audioGraph,
        }];
        return projectData;
    }

    projectData.project.instruments = instrumentNodes.map(instNode => {
        const data = instNode.data as InstrumentParams;
        // ALL tracks targeting this instrument. Only the first used to be
        // serialized — any additional track silently vanished from both the
        // preview and the export (four notes of data loss per lost track).
        const tracks = sequencerTracks.filter(t => t.targetNodeId === instNode.id);

        // Find connected MIDI Input
        // Check edges where target is this instrument and source is 'midiInput'
        const midiEdge = edges.find(e => e.target === instNode.id);
        let midiConfig = { device: "All", channel: 1 };

        if (midiEdge) {
            const sourceNode = nodes.find(n => n.id === midiEdge.source);
            if (sourceNode && sourceNode.type === 'midiInput') {
                midiConfig = {
                    device: (sourceNode.data as any).device || "All",
                    // channel is an int (Midi_Config.channel). Normalize any
                    // value a MidiInput node might carry to a whole 1..16.
                    channel: toInt((sourceNode.data as any).channel, 1, 1, 16)
                };
            }
        }

        const subgraph = formatSubgraph(data.subgraph as any);

        // Inject the Sequencer Tracks for this instrument. `serializeTracks`
        // on an empty `tracks` array already yields `[]` — no separate
        // "else assign []" branch needed.
        if (subgraph) {
            subgraph.sequencer_tracks = serializeTracks(tracks, bpm, nearestInScale);
        }

        return {
            id: instNode.id,
            name: data.name || 'Unnamed Instrument',
            // Instrument-level mute silences the whole asset — only when
            // EVERY track is muted (per-track mute lives on the track).
            // Solo bubbles up if any track solos.
            mute: tracks.length > 0 && tracks.every(t => t.isMuted),
            solo: tracks.some(t => t.isSolo),
            // Floor at 0.001, never 0: the backend reads an exact 0 as
            // "field absent" (older saves) and substitutes unity.
            volume: Math.max(data.volume ?? 1.0, 0.001),
            // voice_count and unison are ints (Project_Instrument_Raw). A
            // fractional value here — e.g. 17.151 from a stale save or an old
            // slider — is exactly what broke unmarshalling. Round + clamp to
            // the UI's valid ranges (1..32 voices, 1..16 unison).
            //
            // B6-1-x2: ABSENT stays absent. This used to invent 8 voices, a
            // 50 ms glide and 5 cents of detune for any instrument that did
            // not author them, while the CLI (build_project_from_raw) resolves
            // the same absence to 1 / 0.0 / 0.0 — an editor Generate baked a
            // portamento a `-in:` run of the same file did not. The backend is
            // the one reader of absent values (decided 2026-09-05);
            // JSON.stringify drops undefined keys, so the generator sees from
            // the editor exactly what it sees from the file.
            voice_count: data.voiceCount === undefined ? undefined : toInt(data.voiceCount, 1, 1, 32),
            glide: data.glide,
            unison: toInt(data.unison, 1, 1, 16),
            detune: data.detune,
            midi_config: midiConfig,
            audio_graph: subgraph
        };
    });

    return projectData;
};

/**
 * The instrument-shaped node list live-edit plumbing (useWasmAudioEngine's
 * sendChangedExposedParams / prevInstruments) should diff against: the real
 * Instrument nodes normally, or — when buildProjectData's loose-graph wrap
 * fires (SKB-019 / packet B6-1) — a single synthetic node standing in for the
 * "Asset" instrument, whose `data.subgraph.nodes` IS the whole top-level
 * graph.
 *
 * Without this, a loose graph's live exposed-param edits vanished with
 * NEITHER effect happening: `getInstrumentNodes(nodes)` is `[]`, so
 * `sendChangedExposedParams` has nothing to diff and posts no `set-param`;
 * meanwhile `topologySignature` DOES walk the wrapped Asset's `audio_graph`
 * (built by buildProjectData, independently of this list) and masks the same
 * param there, so the signature does not change either — the exact
 * silent-drop hazard `topologySignature`'s own header comment forbids, newly
 * reachable because loose graphs can now be played at all.
 *
 * One predicate, same guard as the wrap itself, so this can't drift from what
 * buildProjectData actually emits.
 */
export const wrappedInstrumentNodes = (nodes: Node<NodeParams>[]): Node<NodeParams>[] => {
    const instrumentNodes = orderedInstrumentNodes(nodes);
    if (instrumentNodes.length > 0 || nodes.length === 0) return instrumentNodes;
    return [{
        id: 'Asset',
        type: 'instrument',
        position: { x: 0, y: 0 },
        data: { name: 'Asset', subgraph: { nodes, connections: [] } },
    } as unknown as Node<NodeParams>];
};

// The key the generated set_param dispatch accepts for ANY exposed param,
// unique or not: the codegen emits a "<nodeId>::<param>" alias next to every
// collision-resolved field name. Addressing by node id is what lets several
// nodes exposing the SAME name (e.g. three filters all exposing `cutoff`)
// take the instant path individually — by bare name only the uniquely-exposed
// ones were addressable, and everything else fell back to a full rebuild.
export const liveParamKey = (nodeId: string, param: string): string => `${nodeId}::${param}`;

// The generated wasm shim's param-name mailbox is 128 bytes; a key that
// doesn't fit can't be applied live and must go through the rebuild path.
const MAX_PARAM_KEY_BYTES = 128;

// skald_set_param carries the value as an f32. Anything a float32 cannot
// represent finitely — non-numbers, NaN/Infinity, magnitudes past f32 max —
// must not be dropped into the worklet, where it would either corrupt the
// running DSP or be discarded without a sound changing.
const MAX_LIVE_PARAM_MAGNITUDE = 3.4028234663852886e38; // largest finite f32

// True only when BOTH the key fits the shim's name buffer AND the value is
// something skald_set_param can actually carry. Returning false here is what
// routes a bad edit to the full-rebuild path: topologySignature leaves the
// value unmasked, the signature changes, and a rebuild fires — instead of the
// edit being silently dropped into (or by) the worklet. The value predicate
// narrows to number so callers can post it without re-checking.
export const canApplyParamLive = (nodeId: string, param: string, value: unknown): value is number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (Math.abs(value) > MAX_LIVE_PARAM_MAGNITUDE) return false;
    return new TextEncoder().encode(liveParamKey(nodeId, param)).length <= MAX_PARAM_KEY_BYTES;
};

// A stable fingerprint of everything that requires a re-codegen when it
// changes. Exposed parameter VALUES are masked out — those apply live
// through skald_set_param (keyed by liveParamKey) without rebuilding the
// module. Masking and live-applicability MUST agree: a param masked here but
// skipped by the instant path would change nothing until an unrelated
// rebuild.
export const topologySignature = (projectData: ProjectStructure): string => {
    const clone = JSON.parse(JSON.stringify(projectData)) as ProjectStructure;
    for (const inst of clone.project.instruments) {
        for (const n of inst.audio_graph?.nodes ?? []) {
            for (const name of (n.parameters?.exposedParameters ?? []) as string[]) {
                if (name in n.parameters && canApplyParamLive(n.id, name, n.parameters[name])) {
                    // The mask sentinel must not collide with anything a
                    // stored value can serialize to. `null` collided with
                    // NaN/Infinity (JSON.stringify → null): editing a live
                    // param from a number (masked → null) to NaN (unmasked →
                    // null) produced IDENTICAL signatures, so neither the
                    // instant path nor a rebuild fired — the silent drop this
                    // masking exists to prevent.
                    n.parameters[name] = '\0__SKALD_LIVE_MASKED__';
                }
            }
        }
    }
    return JSON.stringify(clone);
};
