/*
================================================================================
| FILE: skald-ui/src/hooks/useCodeGeneration.ts                                |
|                                                                              |
| This hook encapsulates the logic for transforming the React Flow graph state |
| into a JSON structure suitable for the backend code generation engine.       |
================================================================================
*/
import { useState } from 'react';
import { Node, Edge } from 'reactflow';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { NodeParams, SequencerTrack } from '../definitions/types';

export const useCodeGeneration = () => {
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    const formatNodesForCodegen = (nodeList: Node<NodeParams>[]): any[] => {
        return nodeList.map(node => {
            const definition = NODE_DEFINITIONS[node.type!];
            const typeName = definition ? definition.codegenType : 'Unknown';

            let parameters: any = { ...node.data };
            let subgraph: any = null;

            delete parameters.label;

            if (node.type === 'output') {
                parameters = {};
            } else if (node.type === 'instrument' || node.type === 'group') {
                parameters = { name: node.data.label || 'Unnamed' };
                if ((node.data as any).subgraph && (node.data as any).subgraph.nodes) {
                    subgraph = {
                        nodes: formatNodesForCodegen((node.data as any).subgraph.nodes),
                        connections: (node.data as any).subgraph.connections.map((edge: any) => ({
                            from_node: parseInt(edge.from_node, 10),
                            from_port: edge.from_port || 'output',
                            to_node: parseInt(edge.to_node, 10),
                            to_port: edge.to_port || 'input'
                        }))
                    };
                }
            }

            const result: any = {
                id: parseInt(node.id, 10),
                type: typeName,
                position: node.position,
                parameters: parameters,
                exposed_parameters: node.data.exposedParameters || []
            };

            if (subgraph) {
                result.subgraph = subgraph;
            }
            return result;
        });
    };

    const handleGenerate = async (nodes: Node<NodeParams>[], edges: Edge[], sequencerTracks: SequencerTrack[]) => {
        if (nodes.length === 0) {
            console.warn("Graph is empty. Add some nodes first.");
            setGeneratedCode("// Graph is empty. Add some nodes to generate code.");
            return;
        }

        const graphNodes = formatNodesForCodegen(nodes);

        const graphConnections = edges.map(edge => ({
            from_node: parseInt(edge.source, 10),
            from_port: edge.sourceHandle || 'output',
            to_node: parseInt(edge.target, 10),
            to_port: edge.targetHandle || 'input'
        }));

        const formattedTracks = sequencerTracks.map(track => ({
            target_node_id: parseInt(track.targetNodeId, 10),
            name: track.name,
            events: track.notes.map(n => ({
                note: n.note,
                velocity: n.velocity,
                start_time: n.step * 0.25, // Convert steps to beats (16th notes)
                duration: n.duration * 0.25
            })),
            mute: track.isMuted,
            solo: track.isSolo
        }));

        const audioGraph = {
            nodes: graphNodes,
            connections: graphConnections,
            sequencer_tracks: formattedTracks,
            master: {
                volume: 0.8, // Default, will need to be dynamic later if we want to save it
                effects: []
            }
        };

        try {
            const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
            setGeneratedCode(code);
        } catch (error) {
            console.error("Error during code generation:", error);
            setGeneratedCode(`// ERROR: Failed to generate code.`);
        }
    };

    return {
        generatedCode,
        setGeneratedCode,
        handleGenerate,
    };
};