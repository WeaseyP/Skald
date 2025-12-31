/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useGraphState.ts                         |
|                                                                              |
| This hook encapsulates all state and logic related to managing the           |
| React Flow graph itself, including nodes, edges, undo/redo, and grouping.    |
================================================================================
*/
import { useState, useCallback, useRef, useEffect } from 'react';
import {
    Node,
    Edge,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    NodeChange,
    EdgeChange,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    OnSelectionChangeParams,
} from 'reactflow';
import { NodeParams } from '../../definitions/types';
import { useNodeComposition } from './useNodeComposition';

const initialNodes: Node<NodeParams>[] = [];
const initialEdges: Edge[] = [];

type HistoryState = { nodes: Node<NodeParams>[]; edges: Edge[] };

export const useGraphState = () => {
    const [nodes, setNodes] = useState<Node<NodeParams>[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node<NodeParams> | null>(null);
    const [selectedNodesForGrouping, setSelectedNodesForGrouping] = useState<Node<NodeParams>[]>([]);

    const [history, setHistory] = useState<HistoryState[]>([]);
    const [future, setFuture] = useState<HistoryState[]>([]);
    const isRestoring = useRef(false);

    const [isNamePromptVisible, setIsNamePromptVisible] = useState(false);

    useEffect(() => {
        if (selectedNode) {
            const updatedSelectedNode = nodes.find(node => node.id === selectedNode.id);
            if (updatedSelectedNode) {
                setSelectedNode(updatedSelectedNode);
            }
        }
    }, [nodes, selectedNode?.id]);

    const saveStateForUndo = useCallback(() => {
        if (isRestoring.current) return;
        setHistory(prev => [...prev, { nodes, edges }]);
        setFuture([]);
    }, [nodes, edges]);

    const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
        const isUndoable = changes.some(c => c.type === 'add' || c.type === 'remove' || (c.type === 'position' && !c.dragging));
        if (isUndoable) saveStateForUndo();
        setNodes(nds => applyNodeChanges(changes, nds));
    }, [saveStateForUndo]);

    const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
        const isUndoable = changes.some(c => c.type === 'add' || c.type === 'remove');
        if (isUndoable) saveStateForUndo();
        setEdges(eds => applyEdgeChanges(changes, eds));
    }, [saveStateForUndo]);

    const onConnect: OnConnect = useCallback((connection) => {
        saveStateForUndo();
        const edge = { ...connection, id: `e${connection.source}-${connection.target}`, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle };
        setEdges(eds => addEdge(edge, eds));
    }, [saveStateForUndo]);

    const updateNodeData = useCallback((nodeId: string, data: Partial<NodeParams>, subNodeId?: string) => {
        saveStateForUndo();
        setNodes(nds => nds.map(node => {
            if (node.id === nodeId) {
                if (subNodeId && node.data.subgraph?.nodes) {
                    const newSubgraphNodes = node.data.subgraph.nodes.map(subNode => {
                        if (subNode.id === subNodeId) {
                            return { ...subNode, data: { ...subNode.data, ...data } };
                        }
                        return subNode;
                    });
                    return { ...node, data: { ...node.data, subgraph: { ...node.data.subgraph, nodes: newSubgraphNodes } } };
                }
                return { ...node, data: { ...node.data, ...data } };
            }
            return node;
        }));
    }, [saveStateForUndo]);

    const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
        setSelectedNode(params.nodes.length === 1 ? params.nodes[0] : null);
        setSelectedNodesForGrouping(params.nodes);
    }, []);

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        isRestoring.current = true;
        const lastState = history[history.length - 1];
        setHistory(history.slice(0, -1));
        setFuture(prevFuture => [{ nodes, edges }, ...prevFuture]);
        setNodes(lastState.nodes);
        setEdges(lastState.edges);
        isRestoring.current = false;
    }, [history, nodes, edges]);

    const handleRedo = useCallback(() => {
        if (future.length === 0) return;
        isRestoring.current = true;
        const nextState = future[0];
        setFuture(future.slice(1));
        setHistory(prevHistory => [...prevHistory, { nodes, edges }]);
        setNodes(nextState.nodes);
        setEdges(nextState.edges);
        isRestoring.current = false;
    }, [future, nodes, edges]);

    const {
        onDrop,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    } = useNodeComposition({
        nodes,
        edges,
        setNodes,
        setEdges,
        selectedNodesForGrouping,
        saveStateForUndo,
        setIsNamePromptVisible,
    });

    return {
        nodes,
        edges,
        setNodes,
        setEdges,
        selectedNode,
        selectedNodesForGrouping,
        isNamePromptVisible,
        setIsNamePromptVisible,
        onNodesChange,
        onEdgesChange,
        onConnect,
        updateNodeData,
        onDrop,
        onSelectionChange,
        handleUndo,
        handleRedo,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    };
};