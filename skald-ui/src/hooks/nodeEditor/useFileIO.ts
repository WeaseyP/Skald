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

        // 1. Calculate boundaries of imported nodes
        let impMinX = Infinity, impMaxX = -Infinity;
        let impMinY = Infinity, impMaxY = -Infinity;

        importedNodes.forEach(n => {
            if (n.position.x < impMinX) impMinX = n.position.x;
            if (n.position.x > impMaxX) impMaxX = n.position.x;
            if (n.position.y < impMinY) impMinY = n.position.y;
            if (n.position.y > impMaxY) impMaxY = n.position.y;
        });

        const impWidth = impMaxX - impMinX;
        const impHeight = impMaxY - impMinY;
        const impCenterX = impMinX + impWidth / 2;
        const impCenterY = impMinY + impHeight / 2;

        // 2. Calculate Viewport Center in Graph Coordinates
        const { x: vpX, y: vpY, zoom } = reactFlowInstance.getViewport();

        // Canvas dimensions (Window - Sidebars)
        const canvasWidth = window.innerWidth - 550; // Sidebars (200 + 350)
        const canvasHeight = window.innerHeight - 300; // Estimate Sequencer height

        const targetCenterX = (-vpX + canvasWidth / 2) / zoom;
        const targetCenterY = (-vpY + canvasHeight / 2) / zoom;

        // 3. Remap IDs to avoid collisions & Reposition
        const idMap = new Map<string, string>();
        const timestamp = Date.now();

        const remappedNodes = importedNodes.map((node, index) => {
            const newId = `${timestamp}-${index}`; // Use timestamp-index for uniqueness
            idMap.set(node.id, newId);

            // Calculate new position relative to center
            const offsetX = node.position.x - impCenterX;
            const offsetY = node.position.y - impCenterY;

            return {
                ...node,
                id: newId,
                position: {
                    x: targetCenterX + offsetX,
                    y: targetCenterY + offsetY
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
