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
import { ReactFlow, Background, Controls, ReactFlowInstance, ReactFlowProvider } from '@xyflow/react';
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

const EditorLayout = () => {
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    // Playback preference, not part of the document: neither saved nor
    // undoable, so it stays local instead of joining the session block.
    const [isLooping, setIsLooping] = useState(false);
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

    const { isPlaying, handlePlay, handleStop, analyserNode, previewError, previewStale, isBuilding } = useWasmAudioEngine(
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
            // Check for valid targets (ignore inputs)
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

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
    const graphActions = useMemo(() => ({ updateNodeData }), [updateNodeData]);

    // The Export-Step action itself lives in useEditorState (so its undo entry
    // is pushed next to the edit it describes); the component keeps only the
    // viewport concern.
    const onExportStep = useCallback((trackId: string, step: number, notePitch: number) => {
        const newNodeId = handleExportStep(trackId, step, notePitch);
        if (newNodeId) handleFocusNode(newNodeId);
    }, [handleExportStep, handleFocusNode]);

    // One definition of "select this note", shared by the grid and by the
    // chord-member buttons in the step editor.
    const onSelectStep = useCallback((trackId: string, step: number, notePitch: number) => {
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        setSelectedStep({ trackId, step, notePitch });
    }, [setNodes]);

    return (
        <div style={appContainerStyles}>
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
                <div style={workspaceContainerStyles}>
                    <div style={sidebarPanelStyles}>
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
                            edges={edges}
                            nodeTypes={memoizedNodeTypes}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                            onDrop={onDrop}
                            onSelectionChange={onSelectionChange}
                            onInit={setReactFlowInstance}
                            multiSelectionKeyCode={['Shift', 'Control']}
                            deleteKeyCode={['Backspace', 'Delete']}
                            fitView
                            style={{ width: '100%', height: '100%' }}
                        >
                            <Background />
                            <Controls />
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
                            blocksBuild={projectIssues.blocksBuild}
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
                    </div>


                    <div style={parameterPanelStyles}>
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
                            />
                        )}
                    </div>
                </div>

                <SequencerDock
                    state={sequencerState}
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
                    onStepSelect={onSelectStep}
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
