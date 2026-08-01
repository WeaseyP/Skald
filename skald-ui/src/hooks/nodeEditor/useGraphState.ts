/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useGraphState.ts                         |
|                                                                              |
| This hook encapsulates all state and logic related to managing the           |
| React Flow graph itself: nodes, edges, selection, clipboard and grouping.    |
|                                                                              |
| It no longer owns an undo stack. Every edit here pushes a labelled entry onto |
| THE editor history (useEditorHistory), which snapshots the whole document —   |
| graph, tracks and session together. See editorSnapshot.ts for why.           |
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
    NodePositionChange,
    EdgeChange,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    OnSelectionChangeParams,
} from '@xyflow/react';
import { NodeParams, SkaldGraphNode } from '../../definitions/types';
import { useNodeComposition } from './useNodeComposition';
import { EditorHistoryApi } from './editorSnapshot';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const initialNodes: Node<NodeParams>[] = [];
const initialEdges: Edge[] = [];

export type GraphHistoryHooks = Pick<EditorHistoryApi, 'pushHistory' | 'endGesture'>;

export const useGraphState = ({ pushHistory, endGesture }: GraphHistoryHooks) => {
    const [nodes, setNodesState] = useState<Node<NodeParams>[]>(initialNodes);
    const [edges, setEdgesState] = useState<Edge[]>(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node<NodeParams> | null>(null);
    const [selectedNodesForGrouping, setSelectedNodesForGrouping] = useState<Node<NodeParams>[]>([]);

    // Graph state is mirrored into refs and every write goes through the
    // wrappers below, so `nodesRef.current` is the authoritative CURRENT graph
    // even in the middle of a React batch. The old `saveStateForUndo` closed
    // over the last render's `nodes`/`edges`; a snapshot taken after a write
    // in the same tick recorded the wrong document.
    const nodesRef = useRef<Node<NodeParams>[]>(initialNodes);
    const edgesRef = useRef<Edge[]>(initialEdges);

    const setNodes = useCallback<React.Dispatch<React.SetStateAction<Node<NodeParams>[]>>>((updater) => {
        const next = typeof updater === 'function'
            ? (updater as (prev: Node<NodeParams>[]) => Node<NodeParams>[])(nodesRef.current)
            : updater;
        nodesRef.current = next;
        setNodesState(next);
    }, []);

    const setEdges = useCallback<React.Dispatch<React.SetStateAction<Edge[]>>>((updater) => {
        const next = typeof updater === 'function'
            ? (updater as (prev: Edge[]) => Edge[])(edgesRef.current)
            : updater;
        edgesRef.current = next;
        setEdgesState(next);
    }, []);

    const [isNamePromptVisible, setIsNamePromptVisible] = useState(false);

    useEffect(() => {
        if (selectedNode) {
            const updatedSelectedNode = nodes.find(node => node.id === selectedNode.id);
            if (updatedSelectedNode) {
                setSelectedNode(updatedSelectedNode);
            }
        }
    }, [nodes, selectedNode?.id]);

    const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
        const isRemove = changes.some(c => c.type === 'remove');
        const isAdd = changes.some(c => c.type === 'add');

        const positionChanges = changes.filter((c): c is NodePositionChange => c.type === 'position');
        // Snapshot on the FIRST `dragging: true` tick, not the last one
        // (F-B07-2). The old code pushed when `!c.dragging` — i.e. on the
        // drag-STOP change, by which time `nodes` already held the dragged
        // position, so undo moved the node back by the last mouse delta: a few
        // pixels. The gesture key folds every subsequent tick of the same drag
        // into that one entry, and the drag-stop tick closes it.
        const dragTick = positionChanges.some(c => c.dragging === true);
        const dragStopped = positionChanges.some(c => c.dragging === false);
        const dragKey = `move:${positionChanges.map(c => c.id).sort().join(',')}`;

        // A single deletion arrives as a node change AND (for its wires) an
        // edge change in the same task; `scope: 'tick'` folds them into one
        // entry so one Ctrl+Z restores the node together with its wiring.
        if (isRemove || isAdd) {
            pushHistory(isRemove ? 'Delete selection' : 'Add node', { gesture: 'structural', scope: 'tick' });
        }
        if (dragTick) {
            pushHistory(positionChanges.length > 1 ? 'Move nodes' : 'Move node', { gesture: dragKey });
        }

        setNodes(nds => applyNodeChanges(changes, nds) as Node<NodeParams>[]);

        if (dragStopped) endGesture(dragKey);
    }, [pushHistory, endGesture, setNodes]);

    const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
        const isRemove = changes.some(c => c.type === 'remove');
        const isAdd = changes.some(c => c.type === 'add');
        if (isRemove || isAdd) {
            pushHistory(isRemove ? 'Delete selection' : 'Add wire', { gesture: 'structural', scope: 'tick' });
        }
        setEdges(eds => applyEdgeChanges(changes, eds));
    }, [pushHistory, setEdges]);

    const onConnect: OnConnect = useCallback((connection) => {
        if (connection.source === connection.target) return; // no self-loops
        pushHistory('Connect wire', { gesture: 'structural', scope: 'tick' });
        // Handles are part of the id: `e{source}-{target}` alone collided
        // when two edges targeted different ports of the same node, so the
        // second wire silently replaced the first.
        const edge: Edge = {
            ...connection,
            id: `e${connection.source}${connection.sourceHandle ?? ''}-${connection.target}${connection.targetHandle ?? ''}-${generateId()}`,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
        };
        setEdges(eds => addEdge(edge, eds));
    }, [pushHistory, setEdges]);

    const updateNodeData = useCallback((nodeId: string, data: Partial<NodeParams>, subNodeId?: string) => {
        const fields = Object.keys(data);
        // Gesture key is target + field: a slider drag on `cutoff` coalesces
        // into one entry however long it lasts, while cutoff-then-resonance is
        // always two entries even if they arrive 10 ms apart. The old 500 ms
        // wall-clock window got both of those backwards (F-B07-9).
        pushHistory(
            fields.length === 1 ? `Change ${fields[0]}` : 'Change parameters',
            { gesture: `param:${nodeId}:${subNodeId ?? ''}:${fields.slice().sort().join(',')}` },
        );
        setNodes(nds => nds.map(node => {
            if (node.id === nodeId) {
                // subNodeId === nodeId means "the node itself" — callers pass
                // `subNodeId || node.id`. Without this check an instrument's
                // OWN params (voiceCount/glide/unison/detune) were hunted
                // inside its subgraph, never found, and silently dropped.
                if (subNodeId && subNodeId !== nodeId && 'subgraph' in node.data && node.data.subgraph?.nodes) {
                    const newSubgraphNodes = node.data.subgraph.nodes.map((subNode: SkaldGraphNode) => {
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
    }, [pushHistory, setNodes]);

    const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
        setSelectedNode(params.nodes.length === 1 ? params.nodes[0] : null);
        setSelectedNodesForGrouping(params.nodes);
    }, []);

    const [clipboard, setClipboard] = useState<{ nodes: Node<NodeParams>[]; edges: Edge[] } | null>(null);

    const handleCopy = useCallback(() => {
        const selected = nodes.filter(n => n.selected);
        if (selected.length === 0) return;

        const selectedIds = new Set(selected.map(n => n.id));
        const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));

        // Deep clone to prevent reference issues
        setClipboard({
            nodes: JSON.parse(JSON.stringify(selected)),
            edges: JSON.parse(JSON.stringify(internalEdges))
        });
    }, [nodes, edges]);

    const handlePaste = useCallback(() => {
        if (!clipboard) return;

        pushHistory('Paste');

        // 1. Assign every clipboard node a new id FIRST, in one pass, so
        // step 2 (below) can tell whether a child's parentId points at a
        // Group that was copied along with it (id present in the map) or
        // one left behind on the canvas (id absent) — that distinction
        // can't be made mid-loop if the parent happens to be visited after
        // the child.
        const idMap = new Map<string, string>();
        clipboard.nodes.forEach(node => {
            idMap.set(node.id, `${generateId()}`);
        });

        // Duplicate Instruments must not keep the original's name/label:
        // paste and Export-Step (app.tsx) would otherwise emit two assets
        // claiming the same identity (F-A09-7). No renaming convention
        // exists elsewhere in this file, so pasted copies get the plainest
        // reading a musician would expect: "Bass", "Bass 2", "Bass 3"...
        const existingInstrumentNames = new Set(
            nodes.filter(n => n.type === 'instrument').map(n => (n.data as { name?: string }).name).filter(Boolean)
        );
        const nextInstrumentName = (baseName: string): string => {
            if (!existingInstrumentNames.has(baseName)) {
                existingInstrumentNames.add(baseName);
                return baseName;
            }
            let n = 2;
            while (existingInstrumentNames.has(`${baseName} ${n}`)) n++;
            const suffixed = `${baseName} ${n}`;
            existingInstrumentNames.add(suffixed);
            return suffixed;
        };

        // 2. Create new Nodes with new IDs
        const newNodes: Node<NodeParams>[] = clipboard.nodes.map(node => {
            const newId = idMap.get(node.id)!;

            // Deep clone per paste: a shallow spread meant pasting an
            // instrument twice made both copies share ONE subgraph
            // object — editing one silently edited the other.
            const clonedData = JSON.parse(JSON.stringify(node.data));
            if (node.type === 'instrument' && typeof clonedData.name === 'string') {
                const suffixedName = nextInstrumentName(clonedData.name);
                clonedData.name = suffixedName;
                clonedData.label = suffixedName;
            }

            const newNode: Node<NodeParams> = {
                ...node,
                id: newId,
                position: {
                    x: node.position.x + 50,
                    y: node.position.y + 50
                },
                selected: true,
                data: clonedData,
            };

            // Group membership (F-B07-5): remap parentId/extent through the
            // paste id-map when the parent was copied along with the child,
            // exactly as edge.source/edge.target are remapped below.
            // Otherwise the pasted child kept pointing at the ORIGINAL
            // group. If the parent was NOT part of the copied selection,
            // drop parentId/extent entirely rather than leave the pasted
            // node silently confined to a box it was never part of.
            if (node.parentId) {
                const mappedParentId = idMap.get(node.parentId);
                if (mappedParentId) {
                    newNode.parentId = mappedParentId;
                } else {
                    delete newNode.parentId;
                    delete newNode.extent;
                }
            }

            return newNode;
        });

        // 3. Create new Edges
        const newEdges = clipboard.edges.map(edge => ({
            ...edge,
            id: `e${idMap.get(edge.source)}-${idMap.get(edge.target)}-${Math.random()}`,
            source: idMap.get(edge.source)!,
            target: idMap.get(edge.target)!,
            selected: true
        }));

        // 4. Deselect old nodes
        const deseplectedOldNodes = nodes.map(n => ({ ...n, selected: false }));
        const deseplectedOldEdges = edges.map(e => ({ ...e, selected: false }));

        setNodes([...deseplectedOldNodes, ...newNodes]);
        setEdges([...deseplectedOldEdges, ...newEdges]);

    }, [clipboard, nodes, edges, pushHistory, setNodes, setEdges]);

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
        pushHistory,
        setIsNamePromptVisible,
    });

    return {
        nodes,
        edges,
        nodesRef,
        edgesRef,
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
        handleCopy,
        handlePaste,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    };
};
