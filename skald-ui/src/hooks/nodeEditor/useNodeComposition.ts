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
} from '@xyflow/react';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';
import { NodeParams, InstrumentParams } from '../../definitions/types';
import { PushHistory } from './editorSnapshot';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

// Roadmap packet B9-5 — the authoring-time half of SKB-028. The generator
// refuses an Instrument nested inside an Instrument (graph_validate.odin,
// validate_no_nested_instruments), so a wrap that would produce one must be
// refused HERE, where it is drawn, instead of at Generate time from another
// process naming node ids the user never typed. One predicate, read by the
// Sidebar button (to grey out and explain) and by both hook handlers (to
// refuse) — a second reading in either place is how the two drift.
//
// Returns the reason the selection cannot be wrapped, or undefined when it
// can. An EMPTY selection returns undefined on purpose: emptiness is the
// existing `length === 0` guard's job and has its own button tooltip.
export const instrumentSelectionBlockedReason = (selection: Node<NodeParams>[]): string | undefined => {
    const inner = selection.find(n => n.type === 'instrument');
    if (!inner) return undefined;
    const name = (inner.data as InstrumentParams).name || (inner.data as NodeParams).label || inner.id;
    return `The selection contains the instrument "${name}", and an instrument cannot contain another instrument. Explode it first, or leave it out of the selection.`;
};

type UseNodeCompositionArgs = {
    nodes: Node<NodeParams>[];
    edges: Edge[];
    setNodes: (nodes: Node<NodeParams>[] | ((prevNodes: Node<NodeParams>[]) => Node<NodeParams>[])) => void;
    setEdges: (edges: Edge[] | ((prevEdges: Edge[]) => Edge[])) => void;
    selectedNodesForGrouping: Node<NodeParams>[];
    pushHistory: PushHistory;
    setIsNamePromptVisible: (isVisible: boolean) => void;
};

export const useNodeComposition = ({
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNodesForGrouping,
    pushHistory,
    setIsNamePromptVisible,
}: UseNodeCompositionArgs) => {

    const { screenToFlowPosition } = useReactFlow();

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const type = event.dataTransfer.getData('application/reactflow');
        if (!type || !NODE_DEFINITIONS[type]) return;

        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const newId = `${generateId()}`;
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

        // Dropping from the palette is the single most common way to add a
        // node, and it left NO undo entry (F-B07-3): the drop went straight to
        // setNodes, bypassing React Flow's `add` change, so onNodesChange never
        // saw it either. Ctrl+Z after a drop undid whatever came before it.
        pushHistory(`Add ${definition.label}`);

        setNodes((nds) => nds.concat(newNode));
    }, [screenToFlowPosition, setNodes, pushHistory]);

    const handleInstrumentNameSubmit = (instrumentName: string) => {
        // B9-5: guarded here as well as in handleCreateInstrument. The prompt
        // is normally only reachable through that handler, but this one is
        // exported on its own, and the selection can change between the
        // prompt opening and the name being confirmed.
        if (instrumentSelectionBlockedReason(selectedNodesForGrouping)) {
            setIsNamePromptVisible(false);
            return;
        }

        const newInstrumentId = `${generateId()}`;
        const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));

        // Resolve FRESH node objects from graph state. The selection array
        // holds snapshots captured when the selection was MADE — any param
        // tweaked after selecting (but before clicking Create Instrument)
        // would otherwise be baked into the instrument stale.
        const selectedNodes = nodes.filter(n => selectedIds.has(n.id));

        const avgPosition = selectedNodes.reduce(
            (acc, node) => ({ x: acc.x + node.position.x, y: acc.y + node.position.y }), { x: 0, y: 0 }
        );
        if (selectedNodes.length > 0) {
            avgPosition.x /= selectedNodes.length;
            avgPosition.y /= selectedNodes.length;
        }

        const oldIdToNewIdMap = new Map<string, string>();
        let subGraphNodeIdCounter = 1;

        // Store nodes relative to the center of the instrument
        const subgraphNodes: Node[] = selectedNodes.map(node => {
            const newId = `${subGraphNodeIdCounter++}`;
            oldIdToNewIdMap.set(node.id, newId);
            return {
                ...node,
                id: newId,
                data: JSON.parse(JSON.stringify(node.data)),
                position: {
                    x: node.position.x - avgPosition.x,
                    y: node.position.y - avgPosition.y
                }
            };
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

        // Ports are keyed by (internal node, handle) — NOT by handle name
        // alone. Keying by name alone merged unrelated edges that happened to
        // share a port name (e.g. two different sources into two different
        // 'input' handles) onto ONE InstrumentInput, silently cross-wiring
        // every source into every target.
        const inputPorts = new Map<string, { id: string; portName: string }>();
        const outputPorts = new Map<string, { id: string; portName: string }>();
        const usedInputNames = new Set<string>();
        const usedOutputNames = new Set<string>();
        const uniqueName = (base: string, used: Set<string>) => {
            let name = base;
            let n = 2;
            while (used.has(name)) name = `${base}_${n++}`;
            used.add(name);
            return name;
        };

        externalEdges.forEach(edge => {
            if (selectedIds.has(edge.target)) {
                const handle = edge.targetHandle || 'input';
                const key = `${edge.target}:${handle}`;
                if (!inputPorts.has(key)) {
                    const newInputNodeId = `${subGraphNodeIdCounter++}`;
                    const portName = uniqueName(handle, usedInputNames);
                    inputPorts.set(key, { id: newInputNodeId, portName });
                    subgraphNodes.push({
                        id: newInputNodeId,
                        type: 'InstrumentInput',
                        position: { x: -200, y: (inputPorts.size + 1) * 70 - 100 }, // Relative pos
                        data: { label: `In: ${portName}`, name: portName },
                    });
                    subgraphConnections.push({
                        from_node: newInputNodeId,
                        from_port: 'output',
                        to_node: oldIdToNewIdMap.get(edge.target)!,
                        to_port: handle,
                    });
                }
                const port = inputPorts.get(key)!;
                newMainGraphEdges.push({ ...edge, id: `e${edge.source}-${newInstrumentId}-${port.portName}-${generateId()}`, target: newInstrumentId, targetHandle: port.portName });

            } else {
                const handle = edge.sourceHandle || 'output';
                const key = `${edge.source}:${handle}`;
                if (!outputPorts.has(key)) {
                    const newOutputNodeId = `${subGraphNodeIdCounter++}`;
                    const portName = uniqueName(handle, usedOutputNames);
                    outputPorts.set(key, { id: newOutputNodeId, portName });
                    subgraphNodes.push({
                        id: newOutputNodeId,
                        type: 'InstrumentOutput',
                        position: { x: 200, y: (outputPorts.size + 1) * 70 - 100 }, // Relative pos
                        data: { label: `Out: ${portName}`, name: portName },
                    });
                    subgraphConnections.push({
                        from_node: oldIdToNewIdMap.get(edge.source)!,
                        from_port: handle,
                        to_node: newOutputNodeId,
                        to_port: 'input',
                    });
                }
                const port = outputPorts.get(key)!;
                newMainGraphEdges.push({ ...edge, id: `e${newInstrumentId}-${edge.target}-${port.portName}-${generateId()}`, source: newInstrumentId, sourceHandle: port.portName });
            }
        });

        const newInstrumentNode: Node = {
            id: newInstrumentId,
            type: 'instrument',
            position: avgPosition,
            data: {
                name: instrumentName,
                label: instrumentName,
                voiceCount: 8,
                // G5/KI-018: stealMode left unset (byte-identical
                // 'release-first' default) rather than carrying forward the
                // old dead `voiceStealing: 'oldest'` — see node-definitions.ts.
                glide: 0.05,
                unison: 1,
                detune: 5,
                inputs: Array.from(inputPorts.values()).map(p => p.portName),
                outputs: Array.from(outputPorts.values()).map(p => p.portName),
                subgraph: {
                    nodes: subgraphNodes,
                    connections: subgraphConnections,
                },
            },
        };

        pushHistory('Create instrument');
        const remainingNodes = nodes.filter(n => !selectedIds.has(n.id));
        setNodes([...remainingNodes, newInstrumentNode]);
        setEdges(newMainGraphEdges);
        setIsNamePromptVisible(false);
    };

    const handleCreateInstrument = useCallback(() => {
        // (was `< 0` — a dead guard that let an empty selection create an
        // empty instrument)
        if (selectedNodesForGrouping.length === 0) return;
        // B9-5 / SKB-028: the Sidebar button is already greyed out with the
        // reason when this is set; the guard here covers the keyboard path
        // and any future caller that does not go through the button.
        if (instrumentSelectionBlockedReason(selectedNodesForGrouping)) return;
        setIsNamePromptVisible(true);
    }, [selectedNodesForGrouping, setIsNamePromptVisible]);

    const handleCreateGroup = useCallback(() => {
        // Sidebar enables "Create Group" whenever ANY node is selected (it
        // reuses `canCreateInstrument`, `selectedNodesForGrouping.length > 0`
        // — app.tsx:379) and its enabled-state tooltip promises "Group
        // selected nodes visually" with no mention of a minimum count. A
        // group box around a single node is a legitimate (if small) visual
        // container — nothing below this guard requires 2+ nodes to behave
        // correctly. So the button's promise is the truth to honor: make
        // the operation work for one node instead of silently refusing it.
        if (selectedNodesForGrouping.length === 0) return;

        pushHistory('Create group');

        const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));
        const newGroupId = `group-${generateId()}`;

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
                    parentId: newGroupId,
                    extent: 'parent' as const,
                    position: {
                        x: n.position.x - groupNodePosition.x,
                        y: n.position.y - groupNodePosition.y,
                    },
                };
            }
            return n;
        });

        setNodes([...updatedNodes, newGroupNode]);
    }, [nodes, selectedNodesForGrouping, pushHistory, setNodes]);

    const handleExplodeInstrument = useCallback(() => {
        const selectedSnapshot = selectedNodesForGrouping.length === 1 ? selectedNodesForGrouping[0] : null;
        // Same staleness trap as Create Instrument: resolve the live node
        // from graph state, not the selection-time snapshot.
        const instrumentNode = selectedSnapshot ? nodes.find(n => n.id === selectedSnapshot.id) ?? selectedSnapshot : null;
        if (!instrumentNode || instrumentNode.type !== 'instrument') return;

        const instrumentData = instrumentNode.data as InstrumentParams;
        if (!instrumentData.subgraph) return;

        pushHistory('Explode instrument');

        const { subgraph } = instrumentData;
        const instrumentPos = instrumentNode.position;

        // Map internal IDs to new global IDs
        const internalToGlobalIdMap = new Map<string, string>();
        const validNodes: Node[] = [];

        // 1. Restore Nodes
        // Calculate Centroid of the Subgraph to align it with the Instrument Node
        const subgraphNodesList = subgraph.nodes.filter((n: any) => n.type !== 'InstrumentInput' && n.type !== 'InstrumentOutput');

        let centroid = { x: 0, y: 0 };
        let boundingWidth = 200;
        let boundingHeight = 200;

        if (subgraphNodesList.length > 0) {
            const sum = subgraphNodesList.reduce((acc: any, n: any) => ({ x: acc.x + n.position.x, y: acc.y + n.position.y }), { x: 0, y: 0 });
            centroid = { x: sum.x / subgraphNodesList.length, y: sum.y / subgraphNodesList.length };

            // rough size logic
            const minX = Math.min(...subgraphNodesList.map((n: any) => n.position.x));
            const maxX = Math.max(...subgraphNodesList.map((n: any) => n.position.x + (n.width || 150)));
            const minY = Math.min(...subgraphNodesList.map((n: any) => n.position.y));
            const maxY = Math.max(...subgraphNodesList.map((n: any) => n.position.y + (n.height || 50)));

            boundingWidth = maxX - minX;
            boundingHeight = maxY - minY;
        }

        // Spiral Search for valid position
        const checkCollision = (pos: { x: number, y: number }, w: number, h: number, existingNodes: Node[]) => {
            const padding = 20;
            const newRect = {
                left: pos.x - w / 2 - padding,
                right: pos.x + w / 2 + padding,
                top: pos.y - h / 2 - padding,
                bottom: pos.y + h / 2 + padding
            };

            return existingNodes.some(node => {
                if (node.id === instrumentNode.id) return false; // Ignore self (being replaced)
                const nw = node.width || 150;
                const nh = node.height || 50;
                const nodeRect = {
                    left: node.position.x,
                    right: node.position.x + nw,
                    top: node.position.y,
                    bottom: node.position.y + nh
                };

                return !(newRect.right < nodeRect.left ||
                    newRect.left > nodeRect.right ||
                    newRect.bottom < nodeRect.top ||
                    newRect.top > nodeRect.bottom);
            });
        };

        let validPosition = { ...instrumentPos };
        // If the instrument position itself is occupied (unlikely if we just removed it, but other nodes might invade), search out
        // Actually, we want to find NEAREST space that fits the bounding box.
        // Since we are replacing an instrument, start at instrument pos.

        // Simple Spiral
        let angle = 0;
        let radius = 0;
        const spacing = 50; // Step size
        let step = 0;
        const maxSteps = 100;

        while (checkCollision(validPosition, boundingWidth, boundingHeight, nodes) && step < maxSteps) {
            angle += 0.5;
            radius = 50 + (step * 5); // Grow radius
            validPosition = {
                x: instrumentPos.x + radius * Math.cos(angle),
                y: instrumentPos.y + radius * Math.sin(angle)
            };
            step++;
        }

        const offset = {
            x: validPosition.x - centroid.x, // Align centroid to valid position
            y: validPosition.y - centroid.y
        };

        subgraph.nodes.forEach((subNode: any) => {
            // Skip IO nodes, they are just ports
            if (subNode.type === 'InstrumentInput' || subNode.type === 'InstrumentOutput') {
                return;
            }

            const newId = `${generateId()}`;
            internalToGlobalIdMap.set(subNode.id, newId);

            validNodes.push({
                ...subNode,
                id: newId,
                position: {
                    x: subNode.position.x + offset.x,
                    y: subNode.position.y + offset.y,
                },
                zIndex: (instrumentNode.zIndex || 0) + 1, // Ensure they sit on top if needed
                selected: true, // Select them so user can immediately move them if needed
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
                    // Restore EVERY internal connection off this port —
                    // .find() used to keep only the first and silently drop
                    // fan-out edges.
                    const internalConns = subgraph.connections.filter((c: any) => c.from_node === inputNode.id);
                    internalConns.forEach((internalConn: any) => {
                        const targetNodeGlobalId = internalToGlobalIdMap.get(internalConn.to_node);
                        if (targetNodeGlobalId) {
                            newEdges.push({
                                ...extEdge,
                                id: `e${extEdge.source}-${targetNodeGlobalId}-${generateId()}`,
                                target: targetNodeGlobalId,
                                targetHandle: internalConn.to_port
                            });
                        }
                    });
                }
            } else if (extEdge.source === instrumentNode.id) {
                // Output from Instrument
                const portName = extEdge.sourceHandle || 'output';

                // Find inside: InstrumentOutput node with name == portName
                const outputNode = subgraph.nodes.find((n: any) => n.type === 'InstrumentOutput' && n.data.name === portName);
                if (outputNode) {
                    const internalConns = subgraph.connections.filter((c: any) => c.to_node === outputNode.id);
                    internalConns.forEach((internalConn: any) => {
                        const sourceNodeGlobalId = internalToGlobalIdMap.get(internalConn.from_node);
                        if (sourceNodeGlobalId) {
                            newEdges.push({
                                ...extEdge,
                                id: `e${sourceNodeGlobalId}-${extEdge.target}-${generateId()}`,
                                source: sourceNodeGlobalId,
                                sourceHandle: internalConn.from_port
                            });
                        }
                    });
                }
            }
        });

        // Remove Instrument Node, Add Exploded Nodes
        const otherNodes = nodes.filter(n => n.id !== instrumentNode.id);
        const otherEdges = edges.filter(e => e.source !== instrumentNode.id && e.target !== instrumentNode.id);

        setNodes([...otherNodes, ...validNodes]);
        setEdges([...otherEdges, ...newEdges]);

    }, [nodes, edges, selectedNodesForGrouping, pushHistory, setNodes, setEdges]);

    return {
        onDrop,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    };
};