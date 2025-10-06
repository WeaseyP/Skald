/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useNodeComposition.ts                    |
|                                                                              |
| This hook provides functions for composing and manipulating the node graph,  |
| such as adding nodes, creating groups, and building instruments. It is       |
| designed to be used in conjunction with useGraphState, which manages the     |
| actual state of the nodes and edges.                                         |
================================================================================
*/
import { useCallback } from 'react';
import {
    Node,
    Edge,
    useReactFlow,
} from 'reactflow';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';
import { NodeParams } from '../../definitions/types';

let id = 0;
const getId = () => ++id;

type UseNodeCompositionArgs = {
    nodes: Node<NodeParams>[];
    edges: Edge[];
    setNodes: (nodes: Node<NodeParams>[] | ((prevNodes: Node<NodeParams>[]) => Node<NodeParams>[])) => void;
    setEdges: (edges: Edge[] | ((prevEdges: Edge[]) => Edge[])) => void;
    selectedNodesForGrouping: Node<NodeParams>[];
    saveStateForUndo: () => void;
    setIsNamePromptVisible: (isVisible: boolean) => void;
};

export const useNodeComposition = ({
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNodesForGrouping,
    saveStateForUndo,
    setIsNamePromptVisible,
}: UseNodeCompositionArgs) => {

    const { screenToFlowPosition } = useReactFlow();

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
                label: definition.label,
            } as NodeParams,
        };

        setNodes((nds) => nds.concat(newNode));
    }, [screenToFlowPosition, setNodes]);

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

    const handleCreateInstrument = useCallback(() => {
        if (selectedNodesForGrouping.length < 0) return;
        setIsNamePromptVisible(true);
    }, [selectedNodesForGrouping, setIsNamePromptVisible]);

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
    }, [nodes, selectedNodesForGrouping, saveStateForUndo, setNodes]);

    return {
        onDrop,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
    };
};