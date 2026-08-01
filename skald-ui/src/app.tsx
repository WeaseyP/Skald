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
import { nodeTypes } from './definitions/nodeTypes';

// Import your new hooks
import { useEditorState, suffixForStepExport } from './hooks/nodeEditor/useEditorState';
import { useWasmAudioEngine } from './hooks/nodeEditor/useWasmAudioEngine';
import { useFileIO, FileStatus } from './hooks/nodeEditor/useFileIO';
import { useCodeGeneration } from './hooks/useCodeGeneration';
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
    const [selectedStep, setSelectedStep] = useState<{ trackId: string, step: number } | null>(null);

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

    const { generatedCode, setGeneratedCode, handleGenerate } = useCodeGeneration();

    const { nearestInScale } = useScale();

    const { isPlaying, handlePlay, handleStop, analyserNode, masterGainNode, previewError, previewStale, isBuilding } = useWasmAudioEngine(
        nodes,
        edges,
        isLooping,
        bpm,
        tracks,
        setCurrentStep,
        patternSteps,
        nearestInScale
    );
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
    const { handleSave, handleLoad, handleImportGraph } = useFileIO(
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
    const onExportStep = useCallback((trackId: string, step: number) => {
        const newNodeId = handleExportStep(trackId, step);
        if (newNodeId) handleFocusNode(newNodeId);
    }, [handleExportStep, handleFocusNode]);

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
                    onUpdateNote={updateNote}
                    onUpdateSteps={updateTrackSteps}
                    analyserNode={analyserNode?.current || null}
                    masterGainNode={masterGainNode?.current || null}
                    onStepSelect={(trackId, step) => {
                        // Deselect nodes
                        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
                        setSelectedStep({ trackId, step });
                    }}
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
