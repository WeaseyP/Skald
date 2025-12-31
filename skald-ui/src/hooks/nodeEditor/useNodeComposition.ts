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
import { NodeParams, InstrumentParams } from '../../definitions/types';

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

    const handleExplodeInstrument = useCallback(() => {
        const instrumentNode = selectedNodesForGrouping.length === 1 ? selectedNodesForGrouping[0] : null;
        if (!instrumentNode || instrumentNode.type !== 'instrument') return;

        const instrumentData = instrumentNode.data as InstrumentParams;
        if (!instrumentData.subgraph) return;

        saveStateForUndo();

        const { subgraph } = instrumentData;
        const instrumentPos = instrumentNode.position;

        // Map internal IDs to new global IDs
        const internalToGlobalIdMap = new Map<string, string>();
        const validNodes: Node[] = [];

        // 1. Restore Nodes
        subgraph.nodes.forEach((subNode: any) => {
            // Skip IO nodes, they are just ports
            if (subNode.type === 'InstrumentInput' || subNode.type === 'InstrumentOutput') {
                // We map them purely for edge resolution, but don't create nodes
                // internalToGlobalIdMap.set(subNode.id, 'IO-' + subNode.data.name); 
                // Actually we can't map them 1:1 to a global ID easily. We handle edges separately.
                return;
            }

            const newId = `${getId()}`;
            internalToGlobalIdMap.set(subNode.id, newId);

            validNodes.push({
                ...subNode,
                id: newId,
                position: {
                    x: instrumentPos.x + subNode.position.x,
                    y: instrumentPos.y + subNode.position.y,
                },
                zIndex: (instrumentNode.zIndex || 0) + 1, // Ensure they sit on top if needed
                selected: false, // Explicitly deselect to prevent inherited 'selected: true' from subgraph
            });
        });

        // 2. Restore Edges
        const newEdges: Edge[] = [];

        // A. Internal - Internal
        subgraph.connections.forEach((conn: any) => {
            const globalSource = internalToGlobalIdMap.get(conn.from_node);
            const globalTarget = internalToGlobalIdMap.get(conn.to_node);

            // If both source and target are normal nodes, just recreate the edge
            if (globalSource && globalTarget) {
                newEdges.push({
                    id: `e${globalSource}-${globalTarget}-${Math.random()}`,
                    source: globalSource,
                    sourceHandle: conn.from_port,
                    target: globalTarget,
                    targetHandle: conn.to_port,
                });
            }
        });

        // B. Handle External Connections (The tricky part)
        // We look at edges connected to the Instrument Node in the main graph
        const externalEdges = edges.filter(e => e.source === instrumentNode.id || e.target === instrumentNode.id);

        externalEdges.forEach(extEdge => {
            if (extEdge.target === instrumentNode.id) {
                // Input into Instrument
                const portName = extEdge.targetHandle || 'input';

                // Find inside: InstrumentInput node with name == portName
                const inputNode = subgraph.nodes.find((n: any) => n.type === 'InstrumentInput' && n.data.name === portName);
                if (inputNode) {
                    // Find what that input node connects TO inside
                    const internalConn = subgraph.connections.find((c: any) => c.from_node === inputNode.id);
                    if (internalConn) {
                        const targetNodeGlobalId = internalToGlobalIdMap.get(internalConn.to_node);
                        if (targetNodeGlobalId) {
                            newEdges.push({
                                ...extEdge,
                                id: `e${extEdge.source}-${targetNodeGlobalId}`,
                                target: targetNodeGlobalId,
                                targetHandle: internalConn.to_port
                            });
                        }
                    }
                }
            } else if (extEdge.source === instrumentNode.id) {
                // Output from Instrument
                const portName = extEdge.sourceHandle || 'output';

                // Find inside: InstrumentOutput node with name == portName
                const outputNode = subgraph.nodes.find((n: any) => n.type === 'InstrumentOutput' && n.data.name === portName);
                if (outputNode) {
                    // Find what connects TO that output node inside
                    const internalConn = subgraph.connections.find((c: any) => c.to_node === outputNode.id);
                    if (internalConn) {
                        const sourceNodeGlobalId = internalToGlobalIdMap.get(internalConn.from_node);
                        if (sourceNodeGlobalId) {
                            newEdges.push({
                                ...extEdge,
                                id: `e${sourceNodeGlobalId}-${extEdge.target}`,
                                source: sourceNodeGlobalId,
                                sourceHandle: internalConn.from_port
                            });
                        }
                    }
                }
            }
        });

        // Remove Instrument Node, Add Exploded Nodes
        const otherNodes = nodes.filter(n => n.id !== instrumentNode.id);
        const otherEdges = edges.filter(e => e.source !== instrumentNode.id && e.target !== instrumentNode.id);

        setNodes([...otherNodes, ...validNodes]);
        setEdges([...otherEdges, ...newEdges]);

    }, [nodes, edges, selectedNodesForGrouping, saveStateForUndo, setNodes, setEdges]);

    return {
        onDrop,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    };
};