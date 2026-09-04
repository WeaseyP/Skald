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
import { getInstrumentNodes } from '../../utils/projectSerializer';
import { EditorHistoryApi, SessionSettings } from './editorSnapshot';
import { dedupeTrackNotes } from '../../utils/trackNotes';

// SessionSettings (bpm / patternSteps / masterVolume / packageName) is defined
// with the undo snapshot it belongs to, in editorSnapshot.ts — the session block
// is part of the save file AND part of one undo step. Re-exported here because
// this hook is where the save/load schema is read and written.
export type { SessionSettings };

/**
 * The history operations the file layer needs.
 *
 * `resetHistory` (not "push"): Load replaces the entire document, so the only
 * safe history is an empty one. Import Patch, by contrast, is an edit like any
 * other and pushes one entry.
 *
 * `isDirty` (packet B4): the confirm-on-Load guard below reads it to decide
 * whether Load has anything to ask permission for.
 */
export type FileIOHistoryHooks = Pick<EditorHistoryApi, 'pushHistory' | 'resetHistory' | 'markSaved' | 'isDirty'>;

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

// Packet B4 (b) — there is no `confirm(` anywhere in skald-ui/src and no
// promise-based dialog primitive to reach for instead: NamePromptModal (the
// one existing modal convention) resolves through onConfirm/onCancel props
// wired into a visible component tree, not a value handleLoad can `await`,
// and retrofitting that shape onto this callback would mean threading modal
// state through app.tsx for a single yes/no question. `window.confirm` is a
// real, native (Chromium) dialog in Electron's renderer — not a stub — so it
// is the pragmatic default here. It is injected (not called directly) so a
// test can supply a stub instead of hitting jsdom's unimplemented version.
const defaultConfirmDiscard = (): boolean =>
    window.confirm('You have unsaved changes. Loading a different project will discard them. Continue?');

export const useFileIO = (
    reactFlowInstance: ReactFlowInstance | null,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    history: FileIOHistoryHooks,
    sequencerTracks: SequencerTrack[],
    loadSequencerTracks: (tracks: SequencerTrack[]) => void,
    sessionSettings: SessionSettings,
    applySessionSettings: (settings: Partial<SessionSettings>) => void,
    // Visible outcome reporting — saves used to be fire-and-forget (a disk
    // error looked identical to success) and load failures died silently.
    notifyFileStatus: (status: FileStatus) => void = () => undefined,
    // Packet B4 (b) — asks permission before Load discards unsaved edits.
    // Only consulted when `history.isDirty`; see defaultConfirmDiscard above
    // for why the default is `window.confirm` rather than an in-app dialog.
    confirmDiscardUnsaved: () => boolean | Promise<boolean> = defaultConfirmDiscard
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
                // The save point for the dirty flag exposed to packet B4. B3
                // only records it; B4 decides what to do about it (title bar,
                // confirm-on-Load, autosave).
                history.markSaved();
                notifyFileStatus({ kind: 'success', message: `Saved to ${result.path}` });
            } else if (result?.error) {
                notifyFileStatus({ kind: 'error', message: `Save FAILED — nothing was written: ${result.error}` });
            }
            // saved:false with no error = user canceled the dialog; stay quiet.
        } catch (e) {
            notifyFileStatus({ kind: 'error', message: `Save FAILED — nothing was written: ${e instanceof Error ? e.message : e}` });
        }
    }, [reactFlowInstance, sequencerTracks, sessionSettings, notifyFileStatus, history]);

    const applySaveData = useCallback((content: string, sourceName?: string): boolean => {
        const { flow, error } = parseSaveFile(content);
        if (error) {
            notifyFileStatus({ kind: 'error', message: `Load failed — ${error}. Your current graph is unchanged.` });
            return false;
        }

        setNodes(flow.nodes);
        setEdges(flow.edges || []);
        if (flow.sequencerTracks) {
            loadSequencerTracks(flow.sequencerTracks);
            // B5-x3: loadTracks drops later duplicates at one (step, pitch)
            // silently — it has no channel to speak on. Load does, and a note
            // that was in the file and is not on the grid is worth one line.
            const { dropped } = dedupeTrackNotes(flow.sequencerTracks);
            if (dropped > 0) {
                notifyFileStatus({
                    kind: 'error',
                    message: `${dropped} duplicate note${dropped === 1 ? '' : 's'} dropped: the file held more than one note at the same step and pitch, which the sequencer addresses as one. The first of each pair was kept.`,
                });
            }
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
            if (typeof flow.session.packageName === 'string' && flow.session.packageName.trim().length > 0) {
                restored.packageName = flow.session.packageName;
            }
            applySessionSettings(restored);
        }

        // Restore the camera (SKB-035 / F-B06-10). Older saves carry no
        // viewport at all — for those, fitView() is the fallback rather than
        // leaving the camera wherever the PREVIOUS project's viewport left
        // it, which could easily be scrolled off every node in the new one
        // (an empty-looking canvas with a perfectly good graph loaded).
        const viewport = flow.viewport;
        const hasValidViewport =
            viewport && typeof viewport === 'object' &&
            Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.zoom);
        if (hasValidViewport) {
            setTimeout(() => reactFlowInstance?.setViewport(viewport), 0);
        } else {
            setTimeout(() => reactFlowInstance?.fitView(), 0);
        }

        // The whole document was just replaced, so there is nothing coherent to
        // undo BACK to: the pre-load graph and the newly loaded tracks are not a
        // state the user ever authored.
        history.resetHistory();

        // SKB-019 / packet B6-1: a graph with no Instrument node auto-wraps as
        // one "Asset" SFX instrument on Play/Generate (buildProjectData). That
        // is announced HERE — once, via the same auto-clearing success toast
        // Save/Load already uses (app.tsx's notifyFileStatus auto-clears a
        // 'success' after 4s) — rather than as a permanent banner: an earlier
        // revision reported it in ProjectIssuesBanner instead, which is
        // non-dismissible BY DESIGN (it reports unplayable data) and painted a
        // problem's styling over a build that actually succeeds, on all 24
        // shipped loose-graph examples. Same predicate buildProjectData uses,
        // so this can't announce a wrap that doesn't actually happen (or stay
        // silent about one that does).
        const looseGraphNotice =
            flow.nodes.length > 0 && getInstrumentNodes(flow.nodes).length === 0
                ? 'no Instrument node — the whole graph will auto-wrap as one "Asset" SFX instrument for Play/Generate (SKB-019)'
                : null;

        if (sourceName || looseGraphNotice) {
            const base = sourceName ? `Loaded "${sourceName}"` : 'Loaded';
            notifyFileStatus({
                kind: 'success',
                message: looseGraphNotice ? `${base} — ${looseGraphNotice}` : base,
            });
        }
        return true;
    }, [reactFlowInstance, setNodes, setEdges, history, loadSequencerTracks, applySessionSettings, notifyFileStatus]);

    const loadContent = useCallback(async (content: string, sourceName?: string): Promise<boolean> => {
        if (history.isDirty) {
            const proceed = await confirmDiscardUnsaved();
            if (!proceed) return false;
        }
        return applySaveData(content, sourceName);
    }, [history, confirmDiscardUnsaved, applySaveData]);

    const handleLoad = useCallback(async () => {
        // SKB-005, the still-open half — Load replaced the session with no
        // dirty check at all. Ask BEFORE anything happens: before the file
        // picker even opens, so a decline touches nothing (no dialog was
        // shown, no file was read, no state was mutated, no history reset).
        // A clean document has nothing to lose, so it skips the prompt.
        if (history.isDirty) {
            const proceed = await confirmDiscardUnsaved();
            if (!proceed) return;
        }

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

        applySaveData(content);
    }, [history, confirmDiscardUnsaved, notifyFileStatus, applySaveData]);

    const importBatch = useCallback((
        files: { name: string; content: string }[],
        skippedInit: { name: string; error: string }[] = []
    ) => {
        if (!reactFlowInstance) return;
        const skipped = [...skippedInit];
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

        // Import Patch merges nodes, wires and tracks into the live document
        // and left NO undo entry (F-B07-3): importing a whole drum kit by
        // mistake could not be taken back, and Ctrl+Z afterwards undid whatever
        // edit came before the import instead. Pushed before any state changes,
        // so the entry holds the pre-import document.
        history.pushHistory(graphs.length === 1 ? 'Import patch' : 'Import patches');

        setNodes(nds => nds.map((n): Node => ({ ...n, selected: false })).concat(placed.nodes));
        setEdges(eds => eds.concat(placed.edges));
        loadSequencerTracks([...sequencerTracks, ...placed.tracks]);

        const patchWord = graphs.length === 1 ? 'patch' : 'patches';
        notifyFileStatus({
            kind: skipped.length ? 'error' : 'success',
            message: `Imported ${graphs.length} ${patchWord} (${placed.nodes.length} nodes, ${placed.tracks.length} tracks).${skippedNote}`,
        });
    }, [reactFlowInstance, setNodes, setEdges, loadSequencerTracks, sequencerTracks, notifyFileStatus, history]);

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

        importBatch(files, skipped);
    }, [reactFlowInstance, importBatch]);

    return { handleSave, handleLoad, handleImportGraph, loadContent, importBatch };
};
