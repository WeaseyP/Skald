
/*
================================================================================
| FILE: skald-ui/src/hooks/useCodeGeneration.ts                                |
|                                                                              |
| This hook encapsulates the logic for transforming the React Flow graph state |
| into a JSON structure suitable for the backend code generation engine.       |
|                                                                              |
| UPDATED: Support for Multi-Instrument, Global Params, and recursive subgraphs|
================================================================================
*/
import { useState } from 'react';
import { Node, Edge } from 'reactflow';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { NodeParams, SequencerTrack, InstrumentParams } from '../definitions/types';

interface ProjectStructure {
    project: {
        bpm: number;
        master_volume: number;
        pattern_steps: number;
        instruments: any[];
    }
}

export const useCodeGeneration = () => {
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    // Helper: Recursively format nodes, handling subgraphs
    const formatNodesForCodegen = (nodeList: Node<NodeParams>[]): any[] => {
        return nodeList.map(node => {
            const definition = NODE_DEFINITIONS[node.type!];
            const typeName = definition ? definition.codegenType : 'Unknown';

            let parameters: any = { ...node.data };

            // Clean up UI-only prarams
            delete parameters.label;
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

            // Note: Instruments are handled at the top level, but if nested (Group?), we recurse.
            // For now, Instruments contain subgraphs, but are not usually inside subgraphs.

            // BUG-TWO-IDS-IN-JSON: removed `id_raw` (duplicate of `id` —
            // backend never reads it) and the top-level `exposed_parameters`
            // (snake_case — also dead; the backend reads
            // `parameters.exposedParameters` carried by the spread above).
            const result: any = {
                id: node.id,
                type: typeName,
                position: node.position,
                parameters: parameters,
            };

            return result;
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

    const handleGenerate = async (
        nodes: Node<NodeParams>[],
        edges: Edge[],
        sequencerTracks: SequencerTrack[],
        bpm: number,
        masterVolume: number,
        packageName: string,
        outputPath: string,
        // Global pattern length: the loop boundary the preview engine uses.
        // Without it the generated loop silently reverted to 16 steps.
        patternSteps: number = 16,
        // Scale quantizer from ScaleContext: the preview quantizes at
        // schedule time, so exported notes must be quantized too or the
        // generated code plays the raw (out-of-key) pitches.
        nearestInScale?: (note: number) => number
    ) => {
        if (nodes.length === 0) {
            console.warn("Graph is empty.");
            setGeneratedCode("// Graph is empty.");
            return;
        }

        const projectData: ProjectStructure = {
            project: {
                bpm: bpm,
                master_volume: masterVolume,
                pattern_steps: patternSteps,
                instruments: []
            }
        };

        // 1. Identify Instruments
        const instrumentNodes = nodes.filter(n => n.type === 'instrument');

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
                        // P-locks: per-step parameter overrides.
                        patch_overrides: n.patchOverrides ?? {}
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
                voice_count: data.voiceCount || 8,
                glide: data.glide ?? 0.05,
                unison: data.unison ?? 1,
                detune: data.detune ?? 5.0,
                midi_config: midiConfig,
                audio_graph: subgraph
            };
        });

        // Fallback: If no instruments, maybe it's a raw generic graph? 
        // For Skald v2, we enforce Instruments.
        // If the user has loose nodes on the canvas, they are "Global" or "Master Chain"?
        // TODO: Handle Master Chain nodes (Output, Reverb on Master).
        // For now, we mainly generate the Instruments.

        try {
            const code = await (window as any).electron.invokeCodegen(JSON.stringify(projectData, null, 2), { packageName, outputPath });
            setGeneratedCode(code);
        } catch (error) {
            console.error("Error during code generation:", error);
            setGeneratedCode(`// ERROR: Failed to generate code.\n// ${error}`);
        }
    };

    return {
        generatedCode,
        setGeneratedCode,
        handleGenerate,
    };
};