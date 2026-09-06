/*
================================================================================
| FILE: skald-ui/src/app.tsx (Refactored)                                      |
|                                                                              |
| The main app component is now much cleaner. It's responsible for initializing|
| the hooks and rendering the UI layout, passing down the state and functions  |
| from the hooks to the appropriate child components.                          |
================================================================================
*/
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Panel, ReactFlowInstance, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Import your components
import Sidebar from './components/Sidebar';
import { ShortcutLegend } from './components/ShortcutLegend';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import NamePromptModal from './components/NamePromptModal';
import ExamplesModal from './components/ExamplesModal';
import { nodeTypes } from './definitions/nodeTypes';

// Import your new hooks
import { useEditorState, suffixForStepExport } from './hooks/nodeEditor/useEditorState';
import { useWasmAudioEngine } from './hooks/nodeEditor/useWasmAudioEngine';
import { useOfflineBounce } from './hooks/nodeEditor/useOfflineBounce';
import { barsForPatternSteps } from './audio/offlineRender';
import { useFileIO, FileStatus } from './hooks/nodeEditor/useFileIO';
import { useWindowTitle } from './hooks/nodeEditor/useWindowTitle';
import { useAutosave, readAutosave, clearAutosave, AutosaveRecord } from './hooks/nodeEditor/useAutosave';
import { useCodeGeneration } from './hooks/useCodeGeneration';
import { useProjectIssues } from './hooks/nodeEditor/useProjectIssues';
import { ProjectIssuesBanner } from './components/ProjectIssuesBanner';
// import { NODE_DEFINITIONS } from './definitions/node-definitions'; // Unused
import { SequencerDock } from './components/Sequencer/SequencerDock';
import { useScale , ScaleProvider } from './contexts/ScaleContext';
import { GraphActionsProvider } from './contexts/GraphActionsContext';
import { instrumentSelectionBlockedReason } from './hooks/nodeEditor/useNodeComposition';
import { shouldLoadFirstRunPatch, useFirstRunPatch } from './hooks/nodeEditor/useFirstRunPatch';
import { useQwertyKeyboard } from './hooks/useQwertyKeyboard';
import { useGraphKeyboardTraversal } from './hooks/useGraphKeyboardTraversal';
import { isTypingTarget } from './utils/keyboardTarget';
import { useSnapToGridPreference } from './hooks/nodeEditor/useSnapToGridPreference';
import { useViewport } from './hooks/useViewport';
import { accentFor } from './components/Nodes/NodeStyles';
import { styleEdgesBySemanticKind } from './components/Edges/edgeKind';

// Re-exported: the Export-Step naming rule now lives with the Export-Step
// action itself (useEditorState), which is where its undo entry is pushed.
export { suffixForStepExport };



const workspaceContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
};

const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1E1E1E',
    position: 'relative', // Context for absolute children
};

const sidebarPanelStyles: React.CSSProperties = {
    width: '200px',
    backgroundColor: '#252526',
    borderRight: '1px solid #333',
    height: '100%',
};

const mainCanvasStyles: React.CSSProperties = {
    flex: 1,
    height: '100%',
    position: 'relative',
};

const parameterPanelStyles: React.CSSProperties = {
    width: '350px',
    backgroundColor: '#252526',
    borderLeft: '1px solid #333',
};

/*
--------------------------------------------------------------------------------
E13 — the narrow layout.

The three columns above are 200px of palette, 350px of parameter panel and
whatever is left for the canvas. On a Pixel 9 Pro in portrait — 448 CSS px —
"whatever is left" is negative, and the web build (docs/PRIVATE_WEB_APP_SETUP.md)
serves this same renderer to that phone.

Below useViewport's breakpoint both side panels come out of flow: the palette
slides in from the left, the parameter panel rises from the bottom, and the
canvas gets the whole screen. They are children of the WORKSPACE row, which is
a sibling of the sequencer dock — that containment, not a z-index, is what
guarantees neither can ever cover the transport.

Both are kept mounted and translated off-screen rather than unmounted, so the
panel's own state (a half-typed package name, a scrolled parameter list)
survives a drawer close. Closed means `inert`: a translated-away drawer is
still in the tab order and still takes taps otherwise.
--------------------------------------------------------------------------------
*/

/** Height of the narrow-layout bottom nav, and the floor the panels stop at. */
const MOBILE_NAV_HEIGHT = 44;

const drawerSidebarStyles = (open: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: MOBILE_NAV_HEIGHT,
    left: 0,
    width: 'min(260px, 82vw)',
    backgroundColor: '#252526',
    borderRight: '1px solid #333',
    zIndex: 320,
    transform: open ? 'translateX(0)' : 'translateX(-100%)',
    boxShadow: open ? '2px 0 12px rgba(0,0,0,0.6)' : 'none',
});

const sheetParameterStyles = (open: boolean): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: MOBILE_NAV_HEIGHT,
    maxHeight: '55%',
    backgroundColor: '#252526',
    borderTop: '1px solid #333',
    overflowY: 'auto',
    zIndex: 310,
    transform: open ? 'translateY(0)' : 'translateY(calc(100% + 44px))',
    boxShadow: open ? '0 -2px 12px rgba(0,0,0,0.6)' : 'none',
});

const mobileNavStyles: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: MOBILE_NAV_HEIGHT,
    zIndex: 330,
    display: 'flex',
    alignItems: 'stretch',
    gap: '1px',
    backgroundColor: '#1A1A1A',
    borderTop: '1px solid #333',
};

const mobileNavButtonStyles = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: 'none',
    background: active ? '#3182CE' : '#252526',
    color: '#E2E8F0',
    fontFamily: 'sans-serif',
    fontSize: '0.8em',
    cursor: 'pointer',
});

const EditorLayout = () => {
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    // Playback preference, not part of the document: neither saved nor
    // undoable, so it stays local instead of joining the session block.
    const [isLooping, setIsLooping] = useState(false);
    // E6: view preference, same rule as isLooping above — not the document,
    // not undoable, persisted only so it survives a reload.
    const [snapToGrid, setSnapToGrid] = useSnapToGridPreference();
    // E13: the one reader of "small screen" / "finger". Everything below that
    // branches on layout asks these two booleans, and responsive.css selects
    // on the attributes they stamp on the root — never on a second copy of
    // the breakpoint.
    const { isNarrow, isCoarsePointer } = useViewport();
    // Both panels start closed on a phone: the canvas is what the user came
    // for, and a drawer that opens itself on load is a drawer the user has to
    // dismiss before they can see anything.
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    // `notePitch` is part of the selection now: a step can hold a chord, and a
    // step-only selection meant every edit landed on an arbitrary member
    // (SKB-025).
    const [selectedStep, setSelectedStep] = useState<{ trackId: string, step: number, notePitch: number } | null>(null);

    // Not part of the document either: the Generate destination is a
    // session-scoped path, not project data.
    const [outputPath, setOutputPath] = useState("");

    const handleSelectOutputPath = async () => {
        // Pass the current selection back so the dialog defaults to it next
        // time instead of resetting to the tester path on every click.
        const path = await window.electron.selectOutputPath(outputPath || undefined);
        if (path) setOutputPath(path);
    };

    // Memoize the imported nodeTypes to ensure referential stability across HMR updates
    const memoizedNodeTypes = useMemo(() => nodeTypes, []);

    // ONE editor document behind ONE history (SKB-008 / packet B3): graph,
    // sequencer tracks and session settings snapshot together, so one Ctrl+Z is
    // one edit undone rather than one pop off each of two diverging stacks.
    const {
        nodes,
        edges,
        nodesRef,
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
        handleExplodeInstrument,
        handleCopy,
        handlePaste,
        handleExportStep,
        history,
        tracks,
        currentStep,
        setCurrentStep,
        loadTracks,
        toggleStep,
        clearStep,
        toggleMute,
        toggleSolo,
        updateNote,
        updateTrackSteps,
        setTrackViewMode,
        setTrackDefaultNote,
        session,
        setBpm,
        setPatternSteps,
        setMasterVolume,
        setPackageName,
        applySessionSettings,
    } = useEditorState();
    const { bpm, patternSteps, masterVolume, packageName } = session;

    // Sync node selection to clear step selection
    React.useEffect(() => {
        if (selectedNode) {
            setSelectedStep(null);
        }
    }, [selectedNode]);

    // Save/load outcome, shown in a banner over the canvas. Errors stay up
    // until the next file action; successes auto-clear after a few seconds.
    const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
    const fileStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notifyFileStatus = useCallback((status: FileStatus) => {
        if (fileStatusTimer.current) clearTimeout(fileStatusTimer.current);
        setFileStatus(status);
        if (status.kind === 'success') {
            fileStatusTimer.current = setTimeout(() => setFileStatus(null), 4000);
        }
    }, []);

    // Generate reports what serialization is about to drop through the same
    // banner (SKB-009/045/010) — it used to drop it with no report at all.
    const { generatedCode, setGeneratedCode, handleGenerate } = useCodeGeneration(notifyFileStatus);

    const { nearestInScale } = useScale();

    // SKB-009 (b): the P-lock/step-range verdict, recomputed from the live
    // document. Renaming a node breaks every override that named it, and until
    // this existed the only thing that ever noticed was codegen — which does
    // not warn, it exits.
    const projectIssues = useProjectIssues(nodes, tracks, patternSteps);

    const { isPlaying, handlePlay, handleStop, analyserNode, meterAnalysers, previewError, previewStale, isBuilding, sendNoteOn, sendNoteOff } = useWasmAudioEngine(
        nodes,
        edges,
        isLooping,
        bpm,
        tracks,
        setCurrentStep,
        patternSteps,
        nearestInScale,
        // Live master fader (SKB-011): applied inside the DSP graph via
        // skald_set_master_volume, not a post-worklet JS GainNode. See the
        // hook's masterVolume param comment for why the two never agreed.
        masterVolume
    );
    // Roadmap G1/G2 (§9.12) — offline bounce and stem export. Deliberately a
    // separate hook from the preview engine: a bounce builds and renders its
    // own module and must never touch the worklet that is currently playing.
    const bounce = useOfflineBounce({
        nodes,
        edges,
        tracks,
        bpm,
        patternSteps,
        masterVolume,
        packageName,
        nearestInScale,
        notify: notifyFileStatus,
    });

    const [isExamplesModalOpen, setIsExamplesModalOpen] = useState(false);

    const { handleSave, handleLoad, handleImportGraph, loadContent, importBatch } = useFileIO(
        reactFlowInstance,
        setNodes,
        setEdges,
        history,
        tracks,
        loadTracks,
        session,
        applySessionSettings,
        notifyFileStatus
    );

    const handleLoadExample = useCallback((content: string, name: string) => {
        void loadContent(content, name);
    }, [loadContent]);

    const handleImportExample = useCallback((content: string, name: string) => {
        importBatch([{ name, content }]);
    }, [importBatch]);

    // Packet B4 (c) — the title bar (Electron mirrors document.title by
    // default; see useWindowTitle.ts) marks unsaved edits the same way every
    // other editor does, so "did I save?" never depends on remembering.
    useWindowTitle(history.isDirty);

    // Packet B4 (d) — a debounced write-behind of the whole document to
    // localStorage, cleared the instant there is nothing left to recover.
    // See useAutosave.ts for why `editsSinceSave` drives the write and
    // `isDirty` drives the clear.
    useAutosave(history.captureSnapshot, history.editsSinceSave, history.isDirty);

    // A crash or a closed window can leave a recovery record behind from a
    // PREVIOUS session; read it once, on mount, before this session's own
    // edits have a chance to overwrite or clear it.
    const [recoverableAutosave, setRecoverableAutosave] = useState<AutosaveRecord | null>(() => readAutosave());

    const handleRestoreAutosave = useCallback((record: AutosaveRecord) => {
        // Same shape as a Load: replace every slice of the document, then
        // reset the history — the pre-recovery state (whatever this fresh
        // session opened with, i.e. nothing) is not something to undo BACK to.
        setNodes(record.snapshot.nodes);
        setEdges(record.snapshot.edges);
        loadTracks(record.snapshot.tracks);
        applySessionSettings(record.snapshot.session);
        history.resetHistory();
        clearAutosave();
        setRecoverableAutosave(null);
        notifyFileStatus({ kind: 'success', message: `Restored autosave from ${new Date(record.savedAt).toLocaleString()}` });
    }, [setNodes, setEdges, loadTracks, applySessionSettings, history, notifyFileStatus]);

    const handleDismissAutosave = useCallback(() => {
        clearAutosave();
        setRecoverableAutosave(null);
    }, []);

    // Packet B6-6 — a fresh install opens with a patch that makes a sound.
    // Decided ONCE at mount from the same facts the recovery banner uses: an
    // autosave to offer wins, a non-empty canvas means this is not a fresh
    // start, and the marker means it already happened on this profile. The
    // hook itself reads the marker (storage may be blocked) and latches it
    // only after the example actually loaded.
    const [firstRunEligible] = useState(() =>
        shouldLoadFirstRunPatch({
            hasRecoverableAutosave: recoverableAutosave !== null,
            nodeCount: nodesRef.current.length,
            marker: null,
        }),
    );
    useFirstRunPatch({ enabled: firstRunEligible, load: handleLoadExample });

    // Roadmap E1 — the computer keyboard plays the patch live, through the same
    // note door and the same scale quantiser as a hardware MIDI keyboard, so
    // the two cannot disagree about what a keypress means.
    const qwerty = useQwertyKeyboard({
        enabled: isPlaying,
        sendNoteOn,
        sendNoteOff,
        nearestInScale,
    });

    // Roadmap E10 — `[` / `]` already walked the nodes; this walks the selected
    // node's ports with `,` / `.` and draws a wire with Enter, through the same
    // onConnect a mouse drag ends in, so a keyboard-drawn edge is one ordinary
    // undo step and not a second way of mutating the graph.
    const traversal = useGraphKeyboardTraversal({
        selectedNodeId: selectedNode?.id ?? null,
        onConnect,
    });

    const sequencerState = {
        isPlaying,
        currentStep,
        tracks
    };

    const handleFocusNode = useCallback((nodeId: string) => {
        if (!reactFlowInstance) return;
        // nodesRef, not the render closure: Export-Step focuses the node it just
        // created in the same tick, which is not in `nodes` yet.
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (node) {
            // Select the node
            setNodes(nds => nds.map(n => ({
                ...n,
                selected: n.id === nodeId
            })));

            // Focus view
            reactFlowInstance.fitView({ nodes: [node], duration: 800, padding: 1.5 });
        }
    }, [reactFlowInstance, nodesRef, setNodes]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for valid targets (ignore inputs). One reader of "is the
            // user typing" (utils/keyboardTarget.ts) — the inline tag list this
            // replaced knew nothing about <select> or contenteditable.
            if (isTypingTarget(e.target)) return;

            // Global Undo/Redo. ONE stack, ONE pop — this used to call the
            // graph's undo and the sequencer's undo side by side, which is
            // exactly how the two stacks came apart (SKB-008 item 1).
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo(); else handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
                return;
            }

            // Copy / Paste
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                handleCopy();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                handlePaste();
                return;
            }

            // Cycle nodes with [ and ]
            if (e.key === ']' || e.key === '[') {
                const sortedNodes = [...nodes].sort((a, b) => {
                    // Sort by position y, then x
                    if (Math.abs(a.position.y - b.position.y) > 50) return a.position.y - b.position.y;
                    return a.position.x - b.position.x;
                });

                if (sortedNodes.length === 0) return;

                const selectedIndex = sortedNodes.findIndex(n => n.selected);
                let nextIndex = 0;

                if (selectedIndex !== -1) {
                    if (e.key === ']') {
                        nextIndex = (selectedIndex + 1) % sortedNodes.length;
                    } else {
                        nextIndex = (selectedIndex - 1 + sortedNodes.length) % sortedNodes.length;
                    }
                }

                const nextNode = sortedNodes[nextIndex];
                if (nextNode) {
                    handleFocusNode(nextNode.id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, handleFocusNode, handleUndo, handleRedo, handleCopy, handlePaste]);

    // Inject AnalyserNode into Output Nodes for Visualizer
    useEffect(() => {
        if (!analyserNode || !analyserNode.current) return;

        // Only update if not already set preventing loop
        const needsUpdate = nodes.some(n => (n.type === 'output' || n.type === 'GraphOutput' || n.type === 'InstrumentOutput') && !n.data.analyser);
        if (needsUpdate) {
            setNodes(nds => nds.map(n => {
                if ((n.type === 'output' || n.type === 'GraphOutput' || n.type === 'InstrumentOutput') && !n.data.analyser) {
                    return {
                        ...n,
                        data: { ...n.data, analyser: analyserNode.current }
                    };
                }
                return n;
            }));
        }
    }, [isPlaying, nodes, setNodes, analyserNode]);

    // On-canvas node editors (ADSR, Filter) write node data through THIS
    // updater so their edits land in useGraphState — the store the audio
    // engine, save and codegen actually read. (Writing to React Flow's
    // internal store made those edits silently inert.)
    // `bpm` rides along (C7) so synced node cards can print the time their
    // division resolves to at the project tempo.
    // E9: meterAnalysers rides along the same context bpm already uses to
    // reach node cards — a second prop threaded through every node component
    // for one visualizer's correlation mode would be the kind of duplicate
    // wiring CLAUDE.md's "one reader" note warns about.
    const graphActions = useMemo(() => ({ updateNodeData, bpm, meterAnalysers }), [updateNodeData, bpm, meterAnalysers]);

    // E7: a rendering-only derivation (styleEdgesBySemanticKind), never fed
    // back into setEdges — the document's `edges` (what save/undo/codegen
    // read) never gains a `style` field. Edges are re-derived on every graph
    // change, so this is one memoised pass over `edges`, not a per-edge
    // lookup buried in a component render.
    const displayEdges = useMemo(() => styleEdgesBySemanticKind(nodes, edges), [nodes, edges]);

    // The Export-Step action itself lives in useEditorState (so its undo entry
    // is pushed next to the edit it describes); the component keeps only the
    // viewport concern.
    const onExportStep = useCallback((trackId: string, step: number, notePitch: number) => {
        const newNodeId = handleExportStep(trackId, step, notePitch);
        if (newNodeId) handleFocusNode(newNodeId);
    }, [handleExportStep, handleFocusNode]);

    // One definition of "select this note", shared by the grid and by the
    // chord-member buttons in the step editor.
    // E13. Deleting a node or a wire was reachable exactly one way — the
    // Delete/Backspace key, through React Flow's `deleteKeyCode`. Undo, redo,
    // play, save and load all have buttons; delete had none, so on a phone a
    // node once dropped could never be removed again. `deleteElements` is the
    // library's own path and emits the same 'remove' changes the key does, so
    // the deletion joins the one editor history exactly as a keyboard delete
    // does rather than becoming a mutation that bypasses pushHistory (B3).
    const deletableSelection = useMemo(
        () => ({
            nodes: nodes.filter(n => n.selected),
            edges: edges.filter(e => e.selected),
        }),
        [nodes, edges],
    );
    const canDeleteSelection = deletableSelection.nodes.length > 0 || deletableSelection.edges.length > 0;
    const handleDeleteSelection = useCallback(() => {
        if (!reactFlowInstance || !canDeleteSelection) return;
        void reactFlowInstance.deleteElements(deletableSelection);
    }, [reactFlowInstance, canDeleteSelection, deletableSelection]);

    const onSelectStep = useCallback((trackId: string, step: number, notePitch: number) => {
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        setSelectedStep({ trackId, step, notePitch });
    }, [setNodes]);

    return (
        <div
            style={appContainerStyles}
            data-testid="app-root"
            // The two attributes responsive.css selects on. They exist so the
            // stylesheet never has to restate a breakpoint useViewport already
            // owns (see styles/responsive.css).
            data-viewport={isNarrow ? 'narrow' : 'wide'}
            data-pointer={isCoarsePointer ? 'coarse' : 'fine'}
        >
            {isNamePromptVisible && (
                <NamePromptModal
                    title="Create New Instrument"
                    defaultValue="MyInstrument"
                    onNameConfirm={handleInstrumentNameSubmit}
                    onCancel={() => setIsNamePromptVisible(false)}
                />
            )}

            <ExamplesModal
                isOpen={isExamplesModalOpen}
                onClose={() => setIsExamplesModalOpen(false)}
                onLoadExample={handleLoadExample}
                onImportExample={handleImportExample}
            />

            <div style={{
                flex: 1,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={workspaceContainerStyles} data-testid="workspace-row">
                    <div
                        style={isNarrow ? drawerSidebarStyles(isDrawerOpen) : sidebarPanelStyles}
                        className={isNarrow ? 'skald-drawer' : undefined}
                        data-testid="sidebar-panel"
                        data-layout={isNarrow ? 'drawer' : 'static'}
                        data-open={isNarrow ? String(isDrawerOpen) : undefined}
                        // A drawer translated off-screen is still focusable and
                        // still swallows taps aimed at the canvas underneath it.
                        inert={isNarrow && !isDrawerOpen}
                    >
                        <Sidebar
                            onGenerate={() => handleGenerate(nodes, edges, tracks, bpm, masterVolume, packageName, outputPath, patternSteps, nearestInScale)}
                            onPlay={handlePlay}
                            onStop={handleStop}
                            isPlaying={isPlaying}
                            onSave={handleSave}
                            onLoad={handleLoad}
                            onOpenExamples={() => setIsExamplesModalOpen(true)}
                            onImport={handleImportGraph}
                            onCreateInstrument={handleCreateInstrument}
                            onCreateGroup={handleCreateGroup}
                            canCreateInstrument={selectedNodesForGrouping.length > 0}
                            createInstrumentBlockedReason={instrumentSelectionBlockedReason(selectedNodesForGrouping)}
                            bpm={bpm}
                            onBpmChange={setBpm}
                            isLooping={isLooping}
                            onLoopToggle={() => setIsLooping(!isLooping)}
                            onExplodeInstrument={handleExplodeInstrument}
                            canExplodeInstrument={selectedNodesForGrouping.length === 1 && selectedNodesForGrouping[0].type === 'instrument'}
                            packageName={packageName}
                            onPackageNameChange={setPackageName}
                            outputPath={outputPath}
                            onSelectOutputPath={handleSelectOutputPath}
                            onBounce={bounce.bounceToWav}
                            onCancelBounce={bounce.cancelBounce}
                            isBouncing={bounce.isBouncing}
                            bounceProgress={bounce.progress}
                            defaultBounceBars={barsForPatternSteps(patternSteps)}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            canUndo={history.canUndo}
                            canRedo={history.canRedo}
                            undoDepth={history.undoDepth}
                            redoDepth={history.redoDepth}
                            undoLabel={history.undoLabel}
                            redoLabel={history.redoLabel}
                        />
                    </div>
                    <div style={mainCanvasStyles} ref={reactFlowWrapper}>
                        <GraphActionsProvider value={graphActions}>
                        <ReactFlow
                            nodes={nodes}
                            edges={displayEdges}
                            nodeTypes={memoizedNodeTypes}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                            onDrop={onDrop}
                            onSelectionChange={onSelectionChange}
                            onInit={setReactFlowInstance}
                            // E13, touch: this element deliberately sets none
                            // of zoomOnPinch / panOnDrag / preventScrolling /
                            // selectionOnDrag. @xyflow/react 12's defaults are
                            // already the ones a finger needs — pinch zooms,
                            // a drag on the pane pans, the page does not
                            // scroll under the canvas, and selectionOnDrag is
                            // OFF so dragging a node cannot also start a lasso.
                            // Restating them here would be four more props to
                            // keep in step with the library for no change in
                            // behaviour; `touch-action: none` on the pane is
                            // React Flow's own rule, and responsive.css only
                            // extends it to the handles and nodes it misses.
                            multiSelectionKeyCode={['Shift', 'Control']}
                            deleteKeyCode={['Backspace', 'Delete']}
                            fitView
                            style={{ width: '100%', height: '100%' }}
                            // E6: 20 matches Background's default dot gap below,
                            // so the grid a dragged node snaps to is the one
                            // the user can actually see.
                            snapToGrid={snapToGrid}
                            snapGrid={[20, 20]}
                        >
                            <Background />
                            {/* E13: bottom-left is where the narrow layout's
                                nav bar goes, so the zoom buttons move out of
                                its way rather than hiding under it. */}
                            <Controls position={isNarrow ? 'top-left' : 'bottom-left'} />
                            {/* E6: bottom-right, same corner React Flow uses by
                                default — the sequencer dock lives in a separate
                                row below this canvas (see workspaceContainerStyles/
                                SequencerDock below) and ShortcutLegend's "?" sits
                                in the parameter panel's corner, not this one, so
                                nothing else claims this space.
                                E13: a 150x100 overview costs a third of a phone's
                                canvas to save a pan gesture that is cheaper by
                                finger than by mouse, so the narrow layout drops
                                it. */}
                            {!isNarrow && (
                                <MiniMap
                                    nodeColor={(node) => accentFor(node.type)}
                                    maskColor="rgba(30, 30, 30, 0.6)"
                                    style={{ backgroundColor: '#252526', border: '1px solid #4A5568' }}
                                />
                            )}
                            <Panel position="top-right">
                                <label
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        background: '#252526', border: '1px solid #4A5568',
                                        borderRadius: '4px', padding: '4px 8px',
                                        color: '#E2E8F0', fontSize: '0.8em', fontFamily: 'Inter, system-ui, sans-serif',
                                        cursor: 'pointer', userSelect: 'none',
                                    }}
                                    title="Snap dragged and dropped nodes to the grid"
                                >
                                    <input
                                        type="checkbox"
                                        checked={snapToGrid}
                                        onChange={(e) => setSnapToGrid(e.target.checked)}
                                    />
                                    Snap to grid
                                </label>
                            </Panel>
                        </ReactFlow>
                        </GraphActionsProvider>
                        <ShortcutLegend />
                        {(previewError || previewStale) && (
                            <div
                                data-testid="preview-status-banner"
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 50,
                                    maxWidth: '85%',
                                    padding: '8px 14px',
                                    borderRadius: 6,
                                    fontSize: '0.85em',
                                    whiteSpace: 'pre-wrap',
                                    color: '#fff',
                                    backgroundColor: previewError ? 'rgba(178,45,45,0.95)' : 'rgba(178,120,25,0.95)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    pointerEvents: 'none',
                                }}
                            >
                                <strong>{previewError ? 'Preview failed' : 'Preview out of date — last edit failed to build'}</strong>
                                {' — '}
                                {previewError ?? previewStale}
                            </div>
                        )}
                        <ProjectIssuesBanner
                            lines={projectIssues.lines}
                            severity={projectIssues.severity}
                        />
                        {recoverableAutosave && (
                            <div
                                data-testid="autosave-recovery-banner"
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 51,
                                    maxWidth: '85%',
                                    padding: '8px 14px',
                                    borderRadius: 6,
                                    fontSize: '0.85em',
                                    color: '#fff',
                                    backgroundColor: 'rgba(49,130,206,0.95)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                }}
                            >
                                <span>Recovered unsaved changes from {new Date(recoverableAutosave.savedAt).toLocaleString()}.</span>
                                <button
                                    data-testid="autosave-restore-button"
                                    onClick={() => handleRestoreAutosave(recoverableAutosave)}
                                    style={{ background: '#fff', color: '#1E1E1E', border: 'none', borderRadius: 4, padding: '4px 10px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    Restore
                                </button>
                                <button
                                    data-testid="autosave-dismiss-button"
                                    onClick={handleDismissAutosave}
                                    style={{ background: 'transparent', color: '#fff', border: '1px solid #fff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                        {/* Where the keyboard is on the graph. A focus ring on the
                            port alone cannot say what the port is called or that a
                            wire is waiting for a destination; role="status" also
                            makes it the announcement a screen reader hears. */}
                        {(traversal.focusedPort || traversal.pendingSource) && (
                            <div
                                data-testid="port-focus-readout"
                                role="status"
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    left: 10,
                                    zIndex: 50,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: '0.8em',
                                    fontFamily: 'sans-serif',
                                    color: '#E0E0E0',
                                    backgroundColor: 'rgba(37,37,38,0.95)',
                                    border: `1px solid ${traversal.pendingSource ? '#d69e2e' : '#444'}`,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    pointerEvents: 'none',
                                }}
                            >
                                {traversal.pendingSource
                                    ? `Wiring from ${traversal.pendingSource.nodeId} → ${traversal.pendingSource.handleId ?? 'out'} — Enter on an input to connect, Esc to cancel`
                                    : `Port ${traversal.focusedPort?.nodeId} → ${traversal.focusedPort?.handleId ?? '(unnamed)'} (${traversal.focusedPort?.type === 'source' ? 'output' : 'input'}) — , / . to move, Enter to wire`}
                            </div>
                        )}
                        {/* Which octave the letter keys are playing, shown while
                            they are held. Without a readout, Z / X shift a
                            number the user cannot see, and a note key pressed
                            with the preview stopped is silent with no
                            explanation — the hook reports that as
                            `needsPreview` rather than starting playback (see
                            useQwertyKeyboard.ts for why). */}
                        {(qwerty.activeNotes.length > 0 || qwerty.needsPreview) && (
                            <div
                                data-testid="qwerty-keyboard-readout"
                                style={{
                                    position: 'absolute',
                                    bottom: 10,
                                    left: 10,
                                    zIndex: 50,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: '0.8em',
                                    fontFamily: 'sans-serif',
                                    color: '#E0E0E0',
                                    backgroundColor: 'rgba(37,37,38,0.95)',
                                    border: '1px solid #444',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    pointerEvents: 'none',
                                }}
                            >
                                {`Keyboard octave C${qwerty.octave} (Z / X to shift)`}
                                {qwerty.needsPreview && ' — press Play to hear it'}
                            </div>
                        )}
                        {fileStatus && (
                            <div
                                data-testid="file-status-banner"
                                style={{
                                    position: 'absolute',
                                    bottom: 10,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 50,
                                    maxWidth: '85%',
                                    padding: '8px 14px',
                                    borderRadius: 6,
                                    fontSize: '0.85em',
                                    whiteSpace: 'pre-wrap',
                                    color: '#fff',
                                    backgroundColor: fileStatus.kind === 'error' ? 'rgba(178,45,45,0.95)' : 'rgba(35,130,65,0.95)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    pointerEvents: 'none',
                                }}
                            >
                                {fileStatus.message}
                            </div>
                        )}
                        {/* E13: the narrow layout's only chrome. Everything the
                            three-column desktop shows at once is reachable from
                            here — the palette and transport buttons in the
                            drawer, the parameter panel in the sheet. It sits
                            inside the canvas column, so the desktop render is
                            byte-for-byte the one that shipped. */}
                        {isNarrow && (
                            <>
                                {isDrawerOpen && (
                                    <div
                                        data-testid="drawer-scrim"
                                        onClick={() => setIsDrawerOpen(false)}
                                        style={{
                                            position: 'absolute', inset: 0, zIndex: 300,
                                            background: 'rgba(0,0,0,0.45)',
                                        }}
                                    />
                                )}
                                <div style={mobileNavStyles} data-testid="mobile-nav">
                                    <button
                                        data-testid="sidebar-drawer-toggle"
                                        aria-expanded={isDrawerOpen}
                                        onClick={() => setIsDrawerOpen(o => !o)}
                                        style={mobileNavButtonStyles(isDrawerOpen)}
                                    >
                                        ☰ Nodes
                                    </button>
                                    <button
                                        data-testid="mobile-transport-toggle"
                                        onClick={isPlaying ? handleStop : handlePlay}
                                        style={mobileNavButtonStyles(isPlaying)}
                                    >
                                        {isPlaying ? '■ Stop' : '▶ Play'}
                                    </button>
                                    <button
                                        data-testid="mobile-delete-selection"
                                        onClick={handleDeleteSelection}
                                        disabled={!canDeleteSelection}
                                        title={canDeleteSelection
                                            ? 'Delete the selected nodes and wires'
                                            : 'Select a node or a wire first'}
                                        style={{
                                            ...mobileNavButtonStyles(false),
                                            opacity: canDeleteSelection ? 1 : 0.45,
                                        }}
                                    >
                                        ⌫ Delete
                                    </button>
                                    <button
                                        data-testid="parameter-sheet-toggle"
                                        aria-expanded={isSheetOpen}
                                        onClick={() => setIsSheetOpen(o => !o)}
                                        style={mobileNavButtonStyles(isSheetOpen)}
                                    >
                                        ⚙ Settings
                                    </button>
                                </div>
                            </>
                        )}
                    </div>


                    <div
                        style={isNarrow ? sheetParameterStyles(isSheetOpen) : parameterPanelStyles}
                        className={isNarrow ? 'skald-drawer' : undefined}
                        data-testid="parameter-panel"
                        data-layout={isNarrow ? 'sheet' : 'static'}
                        data-open={isNarrow ? String(isSheetOpen) : undefined}
                        inert={isNarrow && !isSheetOpen}
                    >
                        {generatedCode ? (
                            <CodePreviewPanel code={generatedCode} onClose={() => setGeneratedCode(null)} />
                        ) : (
                            <ParameterPanel
                                selectedNode={selectedNode}
                                onUpdateNode={updateNodeData}
                                allNodes={nodes}
                                allEdges={edges}
                                bpm={bpm}
                                selectedStep={selectedStep}
                                tracks={tracks}
                                onUpdateNote={updateNote}
                                onSelectStep={onSelectStep}
                                onExportStep={onExportStep}
                                // E12 (recording half): the macro pad's Record
                                // toggle needs the playhead to know which step
                                // it is baking a P-lock onto, and needs
                                // playback state so stopping the transport
                                // ends recording (ParameterPanel.tsx threads
                                // both into MacroPadSection's `recording` prop
                                // only for the Instrument's own panel render).
                                isPlaying={isPlaying}
                                currentStep={currentStep}
                            />
                        )}
                    </div>
                </div>

                <SequencerDock
                    state={sequencerState}
                    nodes={nodes}
                    isBuilding={isBuilding}
                    bpm={bpm}
                    setBpm={setBpm}
                    patternSteps={patternSteps}
                    setPatternSteps={setPatternSteps}
                    masterVolume={masterVolume}
                    setMasterVolume={setMasterVolume}
                    onPlay={handlePlay}
                    onStop={handleStop}
                    onToggleLoop={() => setIsLooping(!isLooping)}
                    isLooping={isLooping}
                    onMuteToggle={toggleMute}
                    onSoloToggle={toggleSolo}
                    onFocusTrack={(trackId) => {
                        const track = tracks.find(t => t.id === trackId);
                        if (track) handleFocusNode(track.targetNodeId);
                        setSelectedStep(null);
                    }}
                    onToggleStep={toggleStep}
                    onClearStep={clearStep}
                    onUpdateNote={updateNote}
                    onUpdateSteps={updateTrackSteps}
                    analyserNode={analyserNode?.current || null}
                    meterAnalysers={meterAnalysers}
                    onStepSelect={onSelectStep}
                    onSetTrackViewMode={setTrackViewMode}
                    onSetTrackDefaultNote={setTrackDefaultNote}
                />
            </div>
        </div>
    );
}

const App = () => (
    <ReactFlowProvider>
        <ScaleProvider>
            <EditorLayout />
        </ScaleProvider>
    </ReactFlowProvider>
);

export default App;
