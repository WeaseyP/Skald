/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useEditorState.ts                        |
|                                                                              |
| Composes the three slices of the editor document — graph, sequencer tracks,   |
| session settings — around ONE history, and registers them with it.            |
|                                                                              |
| This is the seam the roadmap expects the store to fall out of (§7 / F-B09b-8):|
| app.tsx no longer owns document state, and there is exactly one place that     |
| knows what "the document" is: HistoryIO.capture/restore below.                |
================================================================================
*/
import { useCallback, useEffect, useMemo } from 'react';
import { Node } from '@xyflow/react';
import { NodeParams } from '../../definitions/types';
import { useEditorHistory } from './useEditorHistory';
import { useGraphState } from './useGraphState';
import { useSessionSettings } from './useSessionSettings';
import { useSequencerState } from '../sequencer/useSequencerState';
import { useInstrumentRegistry } from '../sequencer/useInstrumentRegistry';
import { EditorSnapshot, HistoryIO } from './editorSnapshot';

// Export-Step's existing "(Step N)" suffix convention, applied to both the
// node's display label and (F-A09-7) an Instrument's `name` — the field
// codegen actually derives asset identity from. A pure function so the naming
// rule is directly unit-testable.
export const suffixForStepExport = (base: string, step: number): string => `${base} (Step ${step})`;

export const useEditorState = () => {
    const history = useEditorHistory();
    const { pushHistory } = history;

    const graph = useGraphState(history);
    const sequencer = useSequencerState(history);
    const session = useSessionSettings(pushHistory);

    // Tracks follow the Instrument nodes on the canvas, silently — see
    // useInstrumentRegistry for why that is what makes the cascade undoable.
    useInstrumentRegistry(graph.nodes, sequencer);

    const { nodesRef, edgesRef, setNodes, setEdges } = graph;
    const { tracksRef, loadTracks } = sequencer;
    const { sessionRef, applySessionSettings } = session;

    // The one definition of "the document". Everything the history stores and
    // everything it puts back goes through these two functions.
    const io = useMemo<HistoryIO>(() => ({
        capture: (): EditorSnapshot => ({
            nodes: nodesRef.current,
            edges: edgesRef.current,
            tracks: tracksRef.current,
            session: sessionRef.current,
        }),
        restore: (snapshot: EditorSnapshot) => {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
            loadTracks(snapshot.tracks);
            applySessionSettings(snapshot.session);
        },
    }), [nodesRef, edgesRef, tracksRef, sessionRef, setNodes, setEdges, loadTracks, applySessionSettings]);

    useEffect(() => history.connect(io), [history.connect, io]);

    /**
     * "Export Step to Instrument" — clone the track's source node, baked with
     * this step's P-lock overrides, onto the canvas. It wrote straight to
     * setNodes with no history entry (F-B07-3 / SKB-008 item 5), so the clone
     * could not be taken back and Ctrl+Z afterwards undid the edit before it.
     *
     * Lives here rather than in app.tsx so the pushHistory call site is
     * reachable from a hook test. Returns the new node's id for the caller to
     * focus, keeping viewport concerns in the component.
     */
    const handleExportStep = useCallback((trackId: string, step: number): string | null => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return null;
        const note = track.notes.find(n => n.step === step);
        if (!note) return null;

        const nodes = nodesRef.current;
        const sourceNode = nodes.find(n => n.id === track.targetNodeId);
        if (!sourceNode) return null;

        // Clone
        const newNode = JSON.parse(JSON.stringify(sourceNode));
        const generateSimpleId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        newNode.id = generateSimpleId();

        // Offset
        newNode.position.x += 250;
        newNode.position.y += 0;
        newNode.selected = true;

        const label: string = (sourceNode.data.label as string) || sourceNode.type || 'Node';
        newNode.data.label = suffixForStepExport(label, step);

        // An Instrument's `name` (not `label`) is the identity codegen
        // derives asset names from. Without this, an exported step and its
        // source Instrument claim the same identity in generated code
        // (F-A09-7) even though the label above already reads as distinct.
        if (newNode.type === 'instrument' && typeof newNode.data.name === 'string') {
            newNode.data.name = suffixForStepExport(newNode.data.name, step);
        }

        // Apply Overrides
        if (note.patchOverrides) {
            Object.entries(note.patchOverrides).forEach(([key, val]) => {
                const [targetLabel, paramName] = key.split(':');

                if (newNode.type === 'instrument' && newNode.data.subgraph) {
                    const internalNode = newNode.data.subgraph.nodes.find((n: { data: { label?: string }; type?: string }) => (n.data.label || n.type) === targetLabel);
                    if (internalNode) {
                        internalNode.data[paramName] = val;
                    }
                } else {
                    // Simple node matches label
                    if (targetLabel === label) {
                        newNode.data[paramName] = val;
                    }
                }
            });
        }

        pushHistory('Export step to instrument');

        // Deselect others
        const updatedNodes = nodes.map(n => ({ ...n, selected: false }));
        setNodes([...updatedNodes, newNode as Node<NodeParams>]);

        return newNode.id as string;
    }, [tracksRef, nodesRef, setNodes, pushHistory]);

    return {
        history,
        ...graph,
        ...sequencer,
        ...session,
        handleExportStep,
        // Undo/Redo are document-wide, not graph-wide. Named handleUndo/
        // handleRedo because that is what the keyboard handler and the toolbar
        // buttons bind to.
        handleUndo: history.handleUndo,
        handleRedo: history.handleRedo,
        resetHistory: history.resetHistory,
    };
};
