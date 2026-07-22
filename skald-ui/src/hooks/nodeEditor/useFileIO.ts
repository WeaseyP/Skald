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
import { SequencerTrack } from '../../definitions/types';

// Song-level settings that live outside the graph/tracks but shape how the
// project sounds and exports. They used to be dropped from saves entirely:
// a 140 BPM / 32-step song reloaded as 120 BPM / 16 steps.
export interface SessionSettings {
    bpm: number;
    patternSteps: number;
    masterVolume: number;
}

export type FileStatus = { kind: 'success' | 'error'; message: string };

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

    const handleImportGraph = useCallback(async () => {
        if (!reactFlowInstance) return;
        const result = await window.electron.loadGraph().catch((e) => ({ content: null, error: String(e) }));
        if (result?.error) {
            notifyFileStatus({ kind: 'error', message: `Import failed — could not read the file: ${result.error}` });
            return;
        }
        if (!result?.content) return; // canceled

        const { flow, error } = parseSaveFile(result.content);
        if (error) {
            notifyFileStatus({ kind: 'error', message: `Import failed — ${error}. Your current graph is unchanged.` });
            return;
        }

        const importedNodes = flow.nodes as Node[];
        const importedEdges = flow.edges as Edge[] || [];
        const importedTracks = flow.sequencerTracks as SequencerTrack[] || [];

        // 1. Calculate boundaries of imported nodes
        let impMinX = Infinity, impMaxX = -Infinity;
        let impMinY = Infinity, impMaxY = -Infinity;

        importedNodes.forEach(n => {
            if (n.position.x < impMinX) impMinX = n.position.x;
            if (n.position.x > impMaxX) impMaxX = n.position.x;
            if (n.position.y < impMinY) impMinY = n.position.y;
            if (n.position.y > impMaxY) impMaxY = n.position.y;
        });

        const impWidth = impMaxX - impMinX;
        const impHeight = impMaxY - impMinY;
        const impCenterX = impMinX + impWidth / 2;
        const impCenterY = impMinY + impHeight / 2;

        // 2. Calculate Viewport Center in Graph Coordinates
        const { x: vpX, y: vpY, zoom } = reactFlowInstance.getViewport();

        // Canvas dimensions (Window - Sidebars)
        const canvasWidth = window.innerWidth - 550; // Sidebars (200 + 350)
        const canvasHeight = window.innerHeight - 300; // Estimate Sequencer height

        const targetCenterX = (-vpX + canvasWidth / 2) / zoom;
        const targetCenterY = (-vpY + canvasHeight / 2) / zoom;

        // 3. Remap IDs to avoid collisions & Reposition
        const idMap = new Map<string, string>();
        const timestamp = Date.now();

        const remappedNodes = importedNodes.map((node, index) => {
            const newId = `${timestamp}-${index}`; // Use timestamp-index for uniqueness
            idMap.set(node.id, newId);

            // Calculate new position relative to center
            const offsetX = node.position.x - impCenterX;
            const offsetY = node.position.y - impCenterY;

            return {
                ...node,
                id: newId,
                position: {
                    x: targetCenterX + offsetX,
                    y: targetCenterY + offsetY
                },
                selected: true, // Auto-select imported nodes
                data: {
                    ...node.data,
                    label: node.data.label // Keep label
                }
            };
        });

        // Only keep edges whose BOTH endpoints were imported — falling back
        // to the original id left dangling edges pointing at nodes that
        // don't exist in this graph. Handles + index keep ids unique for
        // multi-port targets.
        const remappedEdges = importedEdges
            .filter(edge => idMap.has(edge.source) && idMap.has(edge.target))
            .map((edge, index) => ({
                ...edge,
                id: `e${idMap.get(edge.source)}${edge.sourceHandle ?? ''}-${idMap.get(edge.target)}${edge.targetHandle ?? ''}-${timestamp}-${index}`,
                source: idMap.get(edge.source)!,
                target: idMap.get(edge.target)!,
                selected: true
            }));

        // 3. Remap Sequencer Tracks
        const remappedTracks = importedTracks.map(track => ({
            ...track,
            id: `${timestamp}-${track.id}`,
            targetNodeId: idMap.get(track.targetNodeId) || track.targetNodeId
        }));

        // 4. Update State
        // Deselect existing
        setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(remappedNodes));
        setEdges(eds => eds.concat(remappedEdges));

        // Merge tracks
        loadSequencerTracks([...sequencerTracks, ...remappedTracks]);

    }, [reactFlowInstance, setNodes, setEdges, loadSequencerTracks, sequencerTracks, notifyFileStatus]);

    return { handleSave, handleLoad, handleImportGraph };
};
