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
import ReactFlow, { Background, Controls, ReactFlowInstance, ReactFlowProvider, Node } from 'reactflow';
import 'reactflow/dist/style.css';

// Import your components
import Sidebar from './components/Sidebar';
import { ShortcutLegend } from './components/ShortcutLegend';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import NamePromptModal from './components/NamePromptModal';
import { nodeTypes } from './definitions/nodeTypes';

// Import your new hooks
import { useGraphState } from './hooks/nodeEditor/useGraphState';
import { useAudioEngine } from './hooks/nodeEditor/useAudioEngine';
import { useFileIO } from './hooks/nodeEditor/useFileIO';
import { useCodeGeneration } from './hooks/useCodeGeneration';
// import { NODE_DEFINITIONS } from './definitions/node-definitions'; // Unused
import { SequencerDock } from './components/Sequencer/SequencerDock';
import { useSequencerState } from './hooks/sequencer/useSequencerState';
import { useInstrumentRegistry } from './hooks/sequencer/useInstrumentRegistry';
import { useScale , ScaleProvider } from './contexts/ScaleContext';



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
    const [bpm, setBpm] = useState(120);
    const [isLooping, setIsLooping] = useState(false);
    const [patternSteps, setPatternSteps] = useState(16);
    const [selectedStep, setSelectedStep] = useState<{ trackId: string, step: number } | null>(null);


    const [packageName, setPackageName] = useState("generated_audio");
    const [outputPath, setOutputPath] = useState("");

    const handleSelectOutputPath = async () => {
        const path = await (window as any).electron.selectOutputPath();
        if (path) setOutputPath(path);
    };

    // Memoize the imported nodeTypes to ensure referential stability across HMR updates
    const memoizedNodeTypes = useMemo(() => nodeTypes, []);

    const {
        nodes,
        edges,
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
        resetHistory,
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
        handleCopy,
        handlePaste,
    } = useGraphState();

    // Sync node selection to clear step selection
    React.useEffect(() => {
        if (selectedNode) {
            setSelectedStep(null);
        }
    }, [selectedNode]);

    const { generatedCode, setGeneratedCode, handleGenerate } = useCodeGeneration();

    const sequencerStateHooks = useSequencerState();
    useInstrumentRegistry(nodes, sequencerStateHooks);
    const { nearestInScale } = useScale();

    const { isPlaying, handlePlay, handleStop, analyserNode, masterGainNode } = useAudioEngine(
        nodes,
        edges,
        isLooping,
        bpm,
        sequencerStateHooks.tracks,
        sequencerStateHooks.setCurrentStep,
        patternSteps,
        nearestInScale
    );

    // resetHistory wired for real: the old no-op callbacks meant "undo"
    // after loading a file restored the stale pre-load graph.
    const { handleSave, handleLoad, handleImportGraph } = useFileIO(
        reactFlowInstance,
        setNodes,
        setEdges,
        resetHistory,
        resetHistory,
        sequencerStateHooks.tracks,
        sequencerStateHooks.loadTracks
    );

    const sequencerState = {
        isPlaying,
        currentStep: sequencerStateHooks.currentStep,
        tracks: sequencerStateHooks.tracks
    };

    const handleFocusNode = useCallback((nodeId: string) => {
        if (!reactFlowInstance) return;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            // Select the node
            setNodes(nds => nds.map(n => ({
                ...n,
                selected: n.id === nodeId
            })));

            // Focus view
            reactFlowInstance.fitView({ nodes: [node], duration: 800, padding: 1.5 });
        }
    }, [reactFlowInstance, nodes, setNodes]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for valid targets (ignore inputs)
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            // Global Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Redo
                    handleRedo();
                    sequencerStateHooks.handleRedo();
                } else {
                    // Undo
                    handleUndo();
                    sequencerStateHooks.handleUndo();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                // Redo
                handleRedo();
                sequencerStateHooks.handleRedo();
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
    }, [nodes, handleFocusNode, handleUndo, handleRedo, handleCopy, handlePaste, sequencerStateHooks]);

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

    const handleExportStep = (trackId: string, step: number) => {
        const track = sequencerStateHooks.tracks.find(t => t.id === trackId);
        if (!track) return;
        const note = track.notes.find(n => n.step === step);
        if (!note) return;

        const sourceNode = nodes.find(n => n.id === track.targetNodeId);
        if (!sourceNode) return;

        // Clone
        const newNode = JSON.parse(JSON.stringify(sourceNode));
        const generateSimpleId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        newNode.id = generateSimpleId();

        // Offset
        newNode.position.x += 250;
        newNode.position.y += 0;
        newNode.selected = true;

        const label = sourceNode.data.label || sourceNode.type;
        newNode.data.label = `${label} (Step ${step})`;

        // Apply Overrides
        if (note.patchOverrides) {
            Object.entries(note.patchOverrides).forEach(([key, val]) => {
                const [targetLabel, paramName] = key.split(':');

                if (newNode.type === 'instrument' && newNode.data.subgraph) {
                    const internalNode = newNode.data.subgraph.nodes.find((n: any) => (n.data.label || n.type) === targetLabel);
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

        // Deselect others
        const updatedNodes = nodes.map(n => ({ ...n, selected: false }));
        setNodes([...updatedNodes, newNode]);

        // Focus new node?
        handleFocusNode(newNode.id);
    };

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
                            onGenerate={() => handleGenerate(nodes, edges, sequencerStateHooks.tracks, bpm, masterGainNode?.current?.gain.value || 0.8, packageName, outputPath, patternSteps, nearestInScale)}
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
                        />
                    </div>
                    <div style={mainCanvasStyles} ref={reactFlowWrapper}>
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
                        <ShortcutLegend />
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
                                tracks={sequencerStateHooks.tracks}
                                onUpdateNote={sequencerStateHooks.updateNote}
                                onExportStep={handleExportStep}
                            />
                        )}
                    </div>
                </div>

                <SequencerDock
                    state={sequencerState}
                    bpm={bpm}
                    setBpm={setBpm}
                    patternSteps={patternSteps}
                    setPatternSteps={setPatternSteps}
                    onPlay={handlePlay}
                    onStop={handleStop}
                    onToggleLoop={() => setIsLooping(!isLooping)}
                    isLooping={isLooping}
                    onMuteToggle={sequencerStateHooks.toggleMute}
                    onSoloToggle={sequencerStateHooks.toggleSolo}
                    onFocusTrack={(trackId) => {
                        const track = sequencerStateHooks.tracks.find(t => t.id === trackId);
                        if (track) handleFocusNode(track.targetNodeId);
                        setSelectedStep(null);
                    }}
                    onToggleStep={sequencerStateHooks.toggleStep}
                    onUpdateNote={sequencerStateHooks.updateNote}
                    onUpdateSteps={sequencerStateHooks.updateTrackSteps}
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
