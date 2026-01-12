
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

            const result: any = {
                id: node.id, // Keep ID as string or int? Backend likely expects int if possible, but UUIDs are strings.
                // Previous code parsed int. Let's try to keep strings if backend supports them, 
                // OR hash them. For now, sticking to string for flexibility unless strictly typed as int.
                // WARNING: Old code parsed int. If backend requires int, we might need a mapping table.
                // Let's assume ID can be string for now to support UUIDs.
                id_raw: node.id,
                type: typeName,
                position: node.position,
                parameters: parameters,
                exposed_parameters: node.data.exposedParameters || []
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
        outputPath: string
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
                    events: track.notes.map(n => ({
                        note: n.note,
                        velocity: n.velocity,
                        step: n.step,
                        start_time: (n.step * 0.25), // Step 0 = 0.0, Step 1 = 0.25 (16th notes?) 
                        // TODO: Verify timing. Skald sequencer steps are likely 16th notes.
                        // Backend expects seconds? Or beats?
                        // `codegen.odin`: `event_start_sample := u64(event.start_time * sample_rate)`
                        // So `start_time` is in SECONDS.
                        // We need to convert Steps -> Seconds based on BPM.
                        // `event.start_time = (step / 4.0) * (60.0 / bpm)` ??? 
                        // New `codegen.odin` loops events.
                        // Actually, let's keep it simple.
                        // If `Project` receives `bpm`, maybe backend handles conversion?
                        // `codegen.odin`: `event_start_sample := u64(event.start_time * sample_rate)` implies RAW TIME.
                        // So we MUST calculate seconds here.

                        // duration: n.duration...?
                        duration: n.duration || 0.1
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