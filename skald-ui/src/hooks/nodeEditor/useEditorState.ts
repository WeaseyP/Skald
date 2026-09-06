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
import { effectiveTrackSteps } from '../../components/Sequencer/stepMetrics';
import { resolvePlockTargets } from '../../utils/plockTargets';
import { freshExportIdForClone } from '../../utils/assetIdentity';

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
     *
     * `notePitch` names WHICH note on the step is being exported. SKB-025: a
     * step can hold a chord whose members carry different P-locks, and this
     * used to bake `notes.find(n => n.step === step)` — the first in insertion
     * order — silently discarding the rest. An explicit pitch that is not at
     * the step exports nothing rather than falling back to a neighbour.
     */
    const handleExportStep = useCallback((trackId: string, step: number, notePitch?: number): string | null => {
        const track = tracksRef.current.find(t => t.id === trackId);
        if (!track) return null;
        // SKB-010: a step past min(track length, pattern length) is one the
        // generated `switch p.current_step % track_steps` can never reach, so
        // minting an Instrument "as this step sounds" would be minting a node
        // for a sound that never happens. The editors grey such steps; this is
        // the same judgement, from the same helper, at the action.
        if (step >= effectiveTrackSteps(track.steps, sessionRef.current.patternSteps)) return null;
        const atStep = track.notes.filter(n => n.step === step);
        const note = notePitch === undefined
            // No pitch given: only unambiguous when the step holds one note.
            // Picking one out of a chord is what this fix removes.
            ? (atStep.length === 1 ? atStep[0] : undefined)
            : atStep.find(n => n.note === notePitch);
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
            // C3: same rule as paste (useGraphState) — a pinned Export ID does
            // not travel with the clone, because two assets on one prefix stop
            // the build. Derived from the suffixed name, unique on the canvas.
            if (typeof newNode.data.exportId === 'string' && newNode.data.exportId.length > 0) {
                newNode.data.exportId = freshExportIdForClone(newNode.data.name, newNode.id, nodes);
            }
        }

        // Apply Overrides — through the SAME resolver the generator mirrors
        // (B5-x1, the SKB-002 pattern). resolvePlockTargets splits on the
        // FIRST ':' only, matches the label case-insensitively over ASCII and
        // falls back to the CODEGEN type for an unlabelled node. The inline
        // match this replaces split on every colon and compared the raw key
        // part against `label || n.type` (React Flow's type) case-sensitively,
        // so codegen applied `osc:frequency` to the node labelled `Osc` while
        // Export-Step baked nothing. The simple-node case resolves against the
        // SOURCE node: newNode's label has already been suffixed above.
        if (note.patchOverrides) {
            const isInstrument = newNode.type === 'instrument' && !!newNode.data.subgraph;
            const subNodes: Node<NodeParams>[] = isInstrument ? (newNode.data.subgraph.nodes as Node<NodeParams>[]) : [];
            const resolveAgainst: Node<NodeParams>[] = isInstrument ? subNodes : [sourceNode as Node<NodeParams>];
            Object.entries(note.patchOverrides).forEach(([key, val]) => {
                for (const t of resolvePlockTargets(resolveAgainst, key)) {
                    const target = isInstrument ? subNodes.find(n => n.id === t.nodeId) : newNode;
                    if (target) (target.data as Record<string, unknown>)[t.param] = val;
                }
            });
        }

        pushHistory('Export step to instrument');

        // Deselect others
        const updatedNodes = nodes.map(n => ({ ...n, selected: false }));
        setNodes([...updatedNodes, newNode as Node<NodeParams>]);

        return newNode.id as string;
    }, [tracksRef, nodesRef, sessionRef, setNodes, pushHistory]);

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
