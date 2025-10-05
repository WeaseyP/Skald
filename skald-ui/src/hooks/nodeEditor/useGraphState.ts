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
    useReactFlow,
    OnSelectionChangeParams,
} from 'reactflow';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';
import { NodeParams } from '../../definitions/types';

const initialNodes: Node<NodeParams>[] = [];
const initialEdges: Edge[] = [];

let id = 0;
const getId = () => ++id;

type HistoryState = { nodes: Node<NodeParams>[]; edges: Edge[] };

export const useGraphState = () => {
    const { screenToFlowPosition } = useReactFlow();
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

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const type = event.dataTransfer.getData('application/reactflow');
        if (!type || !NODE_DEFINITIONS[type]) return;

        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const newId = `${getId()}`;
        const definition = NODE_DEFINITIONS[type];

        const newNode: Node<NodeParams> = {
            id: newId,
            type,
            position,
            data: {
                ...definition.defaultParameters,
                label: definition.label, // Add label from definition
            } as NodeParams,
        };

        setNodes((nds) => nds.concat(newNode));
    }, [screenToFlowPosition]);

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        isRestoring.current = true;
        const lastState = history[history.length - 1];
        setHistory(history.slice(0, -1));
        setFuture(prevFuture => [ { nodes, edges }, ...prevFuture]);
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

    const handleCreateInstrument = useCallback(() => {
        if (selectedNodesForGrouping.length < 0) return;
        setIsNamePromptVisible(true);
    }, [selectedNodesForGrouping]);

    const handleInstrumentNameSubmit = (instrumentName: string) => {
        const newInstrumentId = `${getId()}`;
        const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));

        const oldIdToNewIdMap = new Map<string, string>();
        let subGraphNodeIdCounter = 1;
        const subgraphNodes: Node[] = selectedNodesForGrouping.map(node => {
            const newId = `${subGraphNodeIdCounter++}`;
            oldIdToNewIdMap.set(node.id, newId);
            return { ...node, id: newId, data: JSON.parse(JSON.stringify(node.data)), position: { ...node.position } };
        });

        const internalConnections = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
        const subgraphConnections = internalConnections.map(edge => ({
            from_node: oldIdToNewIdMap.get(edge.source)!,
            from_port: edge.sourceHandle || 'output',
            to_node: oldIdToNewIdMap.get(edge.target)!,
            to_port: edge.targetHandle || 'input',
        }));

        const externalEdges = edges.filter(edge => selectedIds.has(edge.source) !== selectedIds.has(edge.target));
        const newMainGraphEdges: Edge[] = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target));
        
        const inputPorts = new Map<string, { id: string }>();
        const outputPorts = new Map<string, { id: string }>();

        externalEdges.forEach(edge => {
            if (selectedIds.has(edge.target)) {
                const portName = edge.targetHandle || 'input';
                if (!inputPorts.has(portName)) {
                    const newInputNodeId = `${subGraphNodeIdCounter++}`;
                    inputPorts.set(portName, { id: newInputNodeId });
                    subgraphNodes.push({
                        id: newInputNodeId,
                        type: 'InstrumentInput',
                        position: { x: 50, y: (inputPorts.size + 1) * 70 },
                        data: { label: `In: ${portName}`, name: portName },
                    });
                }
                subgraphConnections.push({
                    from_node: inputPorts.get(portName)!.id,
                    from_port: 'output',
                    to_node: oldIdToNewIdMap.get(edge.target)!,
                    to_port: portName,
                });
                newMainGraphEdges.push({ ...edge, id: `e${edge.source}-${newInstrumentId}`, target: newInstrumentId, targetHandle: portName });

            } else { 
                const portName = edge.sourceHandle || 'output';
                if (!outputPorts.has(portName)) {
                    const newOutputNodeId = `${subGraphNodeIdCounter++}`;
                    outputPorts.set(portName, { id: newOutputNodeId });
                    subgraphNodes.push({
                        id: newOutputNodeId,
                        type: 'InstrumentOutput',
                        position: { x: 400, y: (outputPorts.size + 1) * 70 },
                        data: { label: `Out: ${portName}`, name: portName },
                    });
                }
                subgraphConnections.push({
                    from_node: oldIdToNewIdMap.get(edge.source)!,
                    from_port: portName,
                    to_node: outputPorts.get(portName)!.id,
                    to_port: 'input',
                });
                newMainGraphEdges.push({ ...edge, id: `e${newInstrumentId}-${edge.target}`, source: newInstrumentId, sourceHandle: portName });
            }
        });

        const avgPosition = selectedNodesForGrouping.reduce(
            (acc, node) => ({ x: acc.x + node.position.x, y: acc.y + node.position.y }), { x: 0, y: 0 }
        );
        if (selectedNodesForGrouping.length > 0) {
            avgPosition.x /= selectedNodesForGrouping.length;
            avgPosition.y /= selectedNodesForGrouping.length;
        }

        const newInstrumentNode: Node = {
            id: newInstrumentId,
            type: 'instrument',
            position: avgPosition,
            data: {
                name: instrumentName,
                label: instrumentName,
                voiceCount: 8,
                voiceStealing: 'oldest',
                glide: 0.05,
                unison: 1,
                detune: 5,
                inputs: Array.from(inputPorts.keys()),
                outputs: Array.from(outputPorts.keys()),
                subgraph: {
                    nodes: subgraphNodes,
                    connections: subgraphConnections,
                },
            },
        };
        
        saveStateForUndo();
        const remainingNodes = nodes.filter(n => !selectedIds.has(n.id));
        setNodes([...remainingNodes, newInstrumentNode]);
        setEdges(newMainGraphEdges);
        setIsNamePromptVisible(false);
    };

    const handleCreateGroup = useCallback(() => {
        if (selectedNodesForGrouping.length <= 1) return;

        saveStateForUndo();

        const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));
        const newGroupId = `group-${getId()}`;
        
        const minX = Math.min(...selectedNodesForGrouping.map(n => n.position.x));
        const minY = Math.min(...selectedNodesForGrouping.map(n => n.position.y));
        const maxX = Math.max(...selectedNodesForGrouping.map(n => n.position.x + (n.width || 150)));
        const maxY = Math.max(...selectedNodesForGrouping.map(n => n.position.y + (n.height || 50)));

        const padding = 40;
        const groupNodePosition = { x: minX - padding, y: minY - padding };

        const newGroupNode: Node = {
            id: newGroupId,
            type: 'group',
            position: groupNodePosition,
            data: { label: 'New Group' },
            style: { 
                width: maxX - minX + (padding * 2), 
                height: maxY - minY + (padding * 2),
            }
        };

        const updatedNodes = nodes.map(n => {
            if (selectedIds.has(n.id)) {
                return { 
                    ...n, 
                    parentNode: newGroupId, 
                    extent: 'parent',
                    position: {
                        x: n.position.x - groupNodePosition.x,
                        y: n.position.y - groupNodePosition.y,
                    },
                };
            }
            return n;
        });

        setNodes([...updatedNodes, newGroupNode]);
    }, [nodes, selectedNodesForGrouping, saveStateForUndo]);

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
    };
};
