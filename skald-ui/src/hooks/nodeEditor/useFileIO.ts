/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useFileIO.ts                             |
|                                                                              |
| This hook handles all file input/output operations, like saving and loading  |
| the graph to and from the filesystem via the Electron main process.          |
================================================================================
*/
import { useCallback } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { SequencerTrack } from '../../definitions/types';
import { ImportedGraph, layOutImportBatch } from '../../utils/importLayout';

// Song-level settings that live outside the graph/tracks but shape how the
// project sounds and exports. They used to be dropped from saves entirely:
// a 140 BPM / 32-step song reloaded as 120 BPM / 16 steps.
export interface SessionSettings {
    bpm: number;
    patternSteps: number;
    masterVolume: number;
}

export type FileStatus = { kind: 'success' | 'error'; message: string };

// Parameters that must never appear in a node's `exposedParameters`, because
// exposing them mints public API the DSP provably never reads.
//
// `syncRate` stores a note-division STRING ("1/8"). It was exposable in one
// click until the three sidebar wrappers were corrected; anything saved while
// that was true still carries the dead entry, which resolves to the
// unknown-parameter range {-1e6, 1e6, 0.0, ""} and emits a `set_syncRate`
// writing a field nothing reads. Strip it at parse time so existing files stop
// carrying it. This is deliberately a value-level scrub, not a schema
// migration (roadmap §4 constraint 4 gates those behind C1's version field):
// removing a name from a list needs no version to be safe or idempotent.
const NEVER_EXPOSABLE = ['syncRate'];

// Applies the scrub to a node and, recursively, to any Instrument subgraph
// nodes — which is where nearly every BPM-syncable node actually lives.
const stripDeadExposedParameters = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    const data = node.data;
    if (data && typeof data === 'object') {
        if (Array.isArray(data.exposedParameters)) {
            data.exposedParameters = data.exposedParameters.filter(
                (p: unknown) => typeof p !== 'string' || !NEVER_EXPOSABLE.includes(p)
            );
        }
        const subNodes = data.subgraph?.nodes;
        if (Array.isArray(subNodes)) {
            for (const sub of subNodes) stripDeadExposedParameters(sub);
        }
    }
};

// Parse + shape-check a save file BEFORE any state is touched. A truncated
// or foreign JSON used to either throw at the boundary or silently clobber
// the graph with `undefined` fields.
const parseSaveFile = (graphJson: string): { flow?: any; error?: string } => {
    let flow: any;
    try {
        flow = JSON.parse(graphJson);
    } catch (e) {
        return { error: `not valid JSON (${e instanceof Error ? e.message : e})` };
    }
    if (!flow || typeof flow !== 'object' || !Array.isArray(flow.nodes)) {
        return { error: 'not a Skald save file (missing nodes array)' };
    }
    if (flow.edges !== undefined && !Array.isArray(flow.edges)) {
        return { error: 'not a Skald save file (edges is not an array)' };
    }
    if (flow.sequencerTracks !== undefined && !Array.isArray(flow.sequencerTracks)) {
        return { error: 'not a Skald save file (sequencerTracks is not an array)' };
    }
    // React Flow v11 saves stored a group child's parent as `parentNode`;
    // v12 reads `parentId`. Rehydrate the old key here so pre-migration
    // grouped saves keep their grouping instead of silently flattening.
    for (const n of flow.nodes) {
        if (n && typeof n === 'object' && n.parentId === undefined && typeof n.parentNode === 'string') {
            n.parentId = n.parentNode;
            delete n.parentNode;
        }
        stripDeadExposedParameters(n);
    }
    return { flow };
};

export const useFileIO = (
    reactFlowInstance: ReactFlowInstance | null,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    setHistory: (history: any[]) => void,
    setFuture: (future: any[]) => void,
    sequencerTracks: SequencerTrack[],
    loadSequencerTracks: (tracks: SequencerTrack[]) => void,
    sessionSettings: SessionSettings,
    applySessionSettings: (settings: Partial<SessionSettings>) => void,
    // Visible outcome reporting — saves used to be fire-and-forget (a disk
    // error looked identical to success) and load failures died silently.
    notifyFileStatus: (status: FileStatus) => void = () => undefined
) => {
    const handleSave = useCallback(async () => {
        if (!reactFlowInstance) return;
        const flow = reactFlowInstance.toObject();
        const saveData = {
            ...flow,
            sequencerTracks,
            session: sessionSettings
        };
        const graphJson = JSON.stringify(saveData, null, 2);
        try {
            const result = await window.electron.saveGraph(graphJson);
            if (result?.saved) {
                notifyFileStatus({ kind: 'success', message: `Saved to ${result.path}` });
            } else if (result?.error) {
                notifyFileStatus({ kind: 'error', message: `Save FAILED — nothing was written: ${result.error}` });
            }
            // saved:false with no error = user canceled the dialog; stay quiet.
        } catch (e) {
            notifyFileStatus({ kind: 'error', message: `Save FAILED — nothing was written: ${e instanceof Error ? e.message : e}` });
        }
    }, [reactFlowInstance, sequencerTracks, sessionSettings, notifyFileStatus]);

    const handleLoad = useCallback(async () => {
        let content: string | null;
        try {
            const result = await window.electron.loadGraph();
            if (result?.error) {
                notifyFileStatus({ kind: 'error', message: `Load failed — could not read the file: ${result.error}` });
                return;
            }
            content = result?.content ?? null;
        } catch (e) {
            notifyFileStatus({ kind: 'error', message: `Load failed: ${e instanceof Error ? e.message : e}` });
            return;
        }
        if (content === null) return; // canceled

        const { flow, error } = parseSaveFile(content);
        if (error) {
            // The current graph is untouched — say so explicitly.
            notifyFileStatus({ kind: 'error', message: `Load failed — ${error}. Your current graph is unchanged.` });
            return;
        }

        setNodes(flow.nodes);
        setEdges(flow.edges || []);
        if (flow.sequencerTracks) {
            loadSequencerTracks(flow.sequencerTracks);
        }
        // Older saves have no session block — leave the current
        // settings alone rather than inventing defaults, and only
        // apply fields that hold sane numbers.
        if (flow.session) {
            const restored: Partial<SessionSettings> = {};
            if (Number.isFinite(flow.session.bpm) && flow.session.bpm > 0) {
                restored.bpm = flow.session.bpm;
            }
            if (Number.isFinite(flow.session.patternSteps) && flow.session.patternSteps > 0) {
                restored.patternSteps = flow.session.patternSteps;
            }
            if (Number.isFinite(flow.session.masterVolume) && flow.session.masterVolume >= 0) {
                restored.masterVolume = flow.session.masterVolume;
            }
            applySessionSettings(restored);
        }
        setHistory([]);
        setFuture([]);
    }, [setNodes, setEdges, setHistory, setFuture, loadSequencerTracks, applySessionSettings, notifyFileStatus]);

    // Import Patch merges one or more saved patches into the current graph.
    // The dialog is a multi-selection, so picking a whole drum kit is one trip
    // rather than four; layout and id remapping live in layOutImportBatch.
    const handleImportGraph = useCallback(async () => {
        if (!reactFlowInstance) return;
        const result = await window.electron
            .importPatches()
            .catch((e: unknown) => ({
                files: [] as { name: string; content: string }[],
                skipped: [{ name: 'selection', error: String(e) }],
            }));

        const files = result?.files ?? [];
        const skipped = [...(result?.skipped ?? [])];
        if (files.length === 0 && skipped.length === 0) return; // canceled

        // Parse everything before touching state: a bad file in the selection
        // must not leave the canvas half-imported.
        const graphs: ImportedGraph[] = [];
        for (const file of files) {
            const { flow, error } = parseSaveFile(file.content);
            if (error || !flow) {
                skipped.push({ name: file.name, error: error ?? 'unreadable' });
                continue;
            }
            graphs.push({
                name: file.name,
                nodes: flow.nodes as Node[],
                edges: (flow.edges as Edge[]) || [],
                tracks: (flow.sequencerTracks as SequencerTrack[]) || [],
            });
        }

        const skippedNote = skipped.length
            ? ` Skipped ${skipped.map((s) => `${s.name} (${s.error})`).join(', ')}.`
            : '';

        if (graphs.length === 0) {
            notifyFileStatus({
                kind: 'error',
                message: `Import failed — nothing importable in the selection.${skippedNote} Your current graph is unchanged.`,
            });
            return;
        }

        // Viewport centre in graph coordinates — where the batch gets dropped.
        const { x: vpX, y: vpY, zoom } = reactFlowInstance.getViewport();
        const canvasWidth = window.innerWidth - 550;  // Sidebars (200 + 350)
        const canvasHeight = window.innerHeight - 300; // Estimate sequencer height
        const center = {
            x: (-vpX + canvasWidth / 2) / zoom,
            y: (-vpY + canvasHeight / 2) / zoom,
        };

        const placed = layOutImportBatch(graphs, center, Date.now());

        setNodes(nds => nds.map((n): Node => ({ ...n, selected: false })).concat(placed.nodes));
        setEdges(eds => eds.concat(placed.edges));
        loadSequencerTracks([...sequencerTracks, ...placed.tracks]);

        const patchWord = graphs.length === 1 ? 'patch' : 'patches';
        notifyFileStatus({
            kind: skipped.length ? 'error' : 'success',
            message: `Imported ${graphs.length} ${patchWord} (${placed.nodes.length} nodes, ${placed.tracks.length} tracks).${skippedNote}`,
        });
    }, [reactFlowInstance, setNodes, setEdges, loadSequencerTracks, sequencerTracks, notifyFileStatus]);

    return { handleSave, handleLoad, handleImportGraph };
};
