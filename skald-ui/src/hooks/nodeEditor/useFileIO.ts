/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useFileIO.ts                             |
|                                                                              |
| This hook handles all file input/output operations, like saving and loading  |
| the graph to and from the filesystem via the Electron main process.          |
================================================================================
*/
import { useCallback } from 'react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { SequencerTrack } from '../../definitions/types';

export const useFileIO = (
    reactFlowInstance: ReactFlowInstance | null,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    setHistory: (history: any[]) => void,
    setFuture: (future: any[]) => void,
    sequencerTracks: SequencerTrack[],
    loadSequencerTracks: (tracks: SequencerTrack[]) => void
) => {
    const handleSave = useCallback(() => {
        if (reactFlowInstance) {
            const flow = reactFlowInstance.toObject();
            const saveData = {
                ...flow,
                sequencerTracks
            };
            const graphJson = JSON.stringify(saveData, null, 2);
            window.electron.saveGraph(graphJson);
        }
    }, [reactFlowInstance, sequencerTracks]);

    const handleLoad = useCallback(async () => {
        const graphJson = await window.electron.loadGraph();
        if (graphJson) {
            const flow = JSON.parse(graphJson);
            if (flow) {
                const loadedNodes = flow.nodes || [];
                setNodes(loadedNodes);
                setEdges(flow.edges || []);
                if (flow.sequencerTracks) {
                    loadSequencerTracks(flow.sequencerTracks);
                }
                setHistory([]);
                setFuture([]);
            }
        }
    }, [setNodes, setEdges, setHistory, setFuture, loadSequencerTracks]);

    const handleImportGraph = useCallback(async () => {
        if (!reactFlowInstance) return;
        const graphJson = await window.electron.loadGraph();
        if (!graphJson) return;

        const flow = JSON.parse(graphJson);
        if (!flow || !flow.nodes) return;

        const importedNodes = flow.nodes as Node[];
        const importedEdges = flow.edges as Edge[] || [];
        const importedTracks = flow.sequencerTracks as SequencerTrack[] || [];

        // 1. Calculate boundaries of current graph to offset imported nodes
        const currentNodes = reactFlowInstance.getNodes();
        const currentEdges = reactFlowInstance.getEdges();

        // Handle empty graph case
        let maxX = 0;
        let minY = 0;
        if (currentNodes.length > 0) {
            maxX = Math.max(...currentNodes.map(n => n.position.x + (n.width || 200)));
            // Align Y with the top-most node roughly, or just 0
            minY = Math.min(...currentNodes.map(n => n.position.y));
        }

        const X_OFFSET = 100; // Padding
        const Y_OFFSET = 0; // Align top

        // 2. Remap IDs to avoid collisions
        const idMap = new Map<string, string>();
        const timestamp = Date.now();

        const remappedNodes = importedNodes.map((node, index) => {
            const newId = `${timestamp}-${index}`; // Use timestamp-index for uniqueness
            idMap.set(node.id, newId);

            // Calculate new position
            // Shift entire imported graph's origin to (maxX + offset, minY)
            return {
                ...node,
                id: newId,
                position: {
                    x: node.position.x + maxX + X_OFFSET,
                    y: node.position.y // Keep original Y or offset if needed
                },
                selected: true, // Auto-select imported nodes
                data: {
                    ...node.data,
                    label: node.data.label // Keep label
                }
            };
        });

        const remappedEdges = importedEdges.map(edge => ({
            ...edge,
            id: `e${idMap.get(edge.source)}-${idMap.get(edge.target)}`, // New edge ID
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
            selected: true
        }));

        // 3. Remap Sequencer Tracks
        const remappedTracks = importedTracks.map(track => ({
            ...track,
            id: `${timestamp}-${track.id}`,
            targetNodeId: idMap.get(track.targetNodeId) || track.targetNodeId
        }));

        // 4. Update State
        // Deselect existing
        setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(remappedNodes));
        setEdges(eds => eds.concat(remappedEdges));

        // Merge tracks
        loadSequencerTracks([...sequencerTracks, ...remappedTracks]);

    }, [reactFlowInstance, setNodes, setEdges, loadSequencerTracks, sequencerTracks]);

    return { handleSave, handleLoad, handleImportGraph };
};
