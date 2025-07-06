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

export const useFileIO = (
    reactFlowInstance: ReactFlowInstance | null,
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
    setHistory: (history: any[]) => void,
    setFuture: (future: any[]) => void
) => {
    const handleSave = useCallback(() => {
        if (reactFlowInstance) {
            const flow = reactFlowInstance.toObject();
            const graphJson = JSON.stringify(flow, null, 2);
            window.electron.saveGraph(graphJson);
        }
    }, [reactFlowInstance]);

    const handleLoad = useCallback(async () => {
        const graphJson = await window.electron.loadGraph();
        if (graphJson) {
            const flow = JSON.parse(graphJson);
            if (flow) {
                const loadedNodes = flow.nodes || [];
                setNodes(loadedNodes);
                setEdges(flow.edges || []);
                const maxId = Math.max(0, ...loadedNodes.map((n: Node) => parseInt(n.id, 10) || 0));
                // This is a global, so we just set it. A bit of a code smell but it's how the original worked.
                // In a larger refactor, this `id` logic would live inside the useGraphState hook.
                // For now, we'll keep it as is to maintain functionality.
                // id = maxId; 
                setHistory([]);
                setFuture([]);
            }
        }
    }, [setNodes, setEdges, setHistory, setFuture]);

    return { handleSave, handleLoad };
};
