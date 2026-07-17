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
import { Node, Edge } from 'reactflow';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { NodeParams, SequencerTrack, InstrumentParams } from '../definitions/types';

export interface ProjectStructure {
    project: {
        bpm: number;
        master_volume: number;
        pattern_steps: number;
        instruments: any[];
    }
}

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

// The instrument order every consumer (codegen asset indices, the wasm shim's
// asset dispatch, the preview engine's set_param addressing) agrees on.
export const getInstrumentNodes = (nodes: Node<NodeParams>[]): Node<NodeParams>[] =>
    nodes.filter(n => n.type === 'instrument');

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
            master_volume: masterVolume,
            pattern_steps: patternSteps,
            instruments: []
        }
    };

    const instrumentNodes = getInstrumentNodes(nodes);

    projectData.project.instruments = instrumentNodes.map(instNode => {
        const data = instNode.data as InstrumentParams;
        const track = sequencerTracks.find(t => t.targetNodeId === instNode.id);

        // Find connected MIDI Input
        // Check edges where target is this instrument and source is 'midiInput'
        const midiEdge = edges.find(e => e.target === instNode.id);
        let midiConfig = { device: "All", channel: 1 };

        if (midiEdge) {
            const sourceNode = nodes.find(n => n.id === midiEdge.source);
            if (sourceNode && sourceNode.type === 'midiInput') {
                midiConfig = {
                    device: (sourceNode.data as any).device || "All",
                    channel: 1 // TODO: Add channel param to MidiInput node
                };
            }
        }

        const subgraph = formatSubgraph(data.subgraph as any);

        // Inject Sequencer Track for this instrument
        if (subgraph && track) {
            subgraph.sequencer_tracks = [{
                target_node_id: track.targetNodeId,
                name: track.name,
                mute: track.isMuted,
                solo: track.isSolo,
                num_steps: track.steps,
                events: track.notes.map(n => ({
                    // Quantize at export with the same function the
                    // preview uses at schedule time — what you hear in
                    // the browser is what ships.
                    note: nearestInScale ? nearestInScale(n.note) : n.note,
                    velocity: n.velocity,
                    step: n.step,
                    // Seconds, BPM-derived (16th-note steps). The old
                    // value hardcoded 0.25s/step regardless of tempo.
                    start_time: n.step * (60.0 / bpm / 4.0),
                    // Duration is in STEPS; the preview defaults a
                    // missing/zero duration to 1 step, not 0.1.
                    duration: n.duration || 1,
                    // Chance the step fires each loop. Clamped away
                    // from 0 because the backend treats <=0 as
                    // "field absent — play always".
                    probability: Math.max(n.probability ?? 1, 0.001),
                    // P-locks: per-step parameter overrides. Numeric only:
                    // the backend applies them through the f32 set_param
                    // API (a string override — e.g. a waveform switch —
                    // would fail the whole JSON parse backend-side).
                    patch_overrides: Object.fromEntries(
                        Object.entries(n.patchOverrides ?? {})
                            .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
                    )
                }))
            }];
        } else if (subgraph) {
            subgraph.sequencer_tracks = [];
        }

        return {
            id: instNode.id,
            name: data.name || 'Unnamed Instrument',
            mute: track ? track.isMuted : false,
            solo: track ? track.isSolo : false,
            // Floor at 0.001, never 0: the backend reads an exact 0 as
            // "field absent" (older saves) and substitutes unity.
            volume: Math.max(data.volume ?? 1.0, 0.001),
            voice_count: data.voiceCount || 8,
            glide: data.glide ?? 0.05,
            unison: data.unison ?? 1,
            detune: data.detune ?? 5.0,
            midi_config: midiConfig,
            audio_graph: subgraph
        };
    });

    return projectData;
};

// Names exposed exactly once across an instrument's subgraph. Only these are
// safe for the instant (no-recompile) set_param path: the codegen suffixes
// COLLIDING exposed names into unique field names the UI can't predict, so
// collisions must go through the rebuild path instead.
export const getUniqueExposedParams = (instNode: Node<NodeParams>): Map<string, number> => {
    const counts = new Map<string, number>();
    const subgraph = (instNode.data as any)?.subgraph;
    for (const sn of subgraph?.nodes ?? []) {
        for (const name of (sn.data?.exposedParameters ?? []) as string[]) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    return counts;
};

// A stable fingerprint of everything that requires a re-codegen when it
// changes. Uniquely-exposed parameter VALUES are masked out — those apply
// live through skald_set_param without rebuilding the module.
export const topologySignature = (projectData: ProjectStructure): string => {
    const clone = JSON.parse(JSON.stringify(projectData)) as ProjectStructure;
    for (const inst of clone.project.instruments) {
        const nodes = inst.audio_graph?.nodes ?? [];
        const counts = new Map<string, number>();
        for (const n of nodes) {
            for (const name of (n.parameters?.exposedParameters ?? []) as string[]) {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
        for (const n of nodes) {
            for (const name of (n.parameters?.exposedParameters ?? []) as string[]) {
                if (counts.get(name) === 1 && name in n.parameters) {
                    n.parameters[name] = null;
                }
            }
        }
    }
    return JSON.stringify(clone);
};
