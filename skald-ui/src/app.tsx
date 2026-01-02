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
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import NamePromptModal from './components/NamePromptModal';
import {
    OscillatorNode, FilterNode, GraphOutputNode, NoiseNode, ADSRNode,
    MixerNode, PannerNode, GroupNode, FmOperatorNode, WavetableNode, MidiInputNode, VisualGainNode, MapperNode,
    LFONode, SampleHoldNode, DelayNode, ReverbNode, DistortionNode
} from './components/Nodes';
import InstrumentNode from './components/InstrumentNode';


// Import your new hooks
import { useGraphState } from './hooks/nodeEditor/useGraphState';
import { useAudioEngine } from './hooks/nodeEditor/useAudioEngine';
import { useFileIO } from './hooks/nodeEditor/useFileIO';
import { useCodeGeneration } from './hooks/useCodeGeneration';
import { NODE_DEFINITIONS } from './definitions/node-definitions';
import { SequencerDock } from './components/Sequencer/SequencerDock';
import { useSequencerState } from './hooks/sequencer/useSequencerState';
import { useInstrumentRegistry } from './hooks/sequencer/useInstrumentRegistry';

const workspaceContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    overflow: 'hidden', // Ensure content doesn't spill out
};

const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1E1E1E',
};

const sidebarPanelStyles: React.CSSProperties = {
    width: '200px',
    backgroundColor: '#252526',
    borderRight: '1px solid #333',
};

const mainCanvasStyles: React.CSSProperties = {
    flexGrow: 1,
    height: '100%',
};

const parameterPanelStyles: React.CSSProperties = {
    width: '350px',
    backgroundColor: '#252526',
    borderLeft: '1px solid #333',
};

// Define nodeTypes outside the component to prevent re-creation on every render.
const nodeTypes = {
    oscillator: OscillatorNode,
    filter: FilterNode,
    output: GraphOutputNode,
    noise: NoiseNode,
    adsr: ADSRNode,
    lfo: LFONode,
    instrument: InstrumentNode,
    sampleHold: SampleHoldNode,
    delay: DelayNode,
    reverb: ReverbNode,
    distortion: DistortionNode,
    mixer: MixerNode,
    panner: PannerNode,
    group: GroupNode,
    fmOperator: FmOperatorNode,
    wavetable: WavetableNode,
    midiInput: MidiInputNode,
    gain: VisualGainNode,
    mapper: MapperNode,
};

const EditorLayout = () => {
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [bpm, setBpm] = useState(120);
    const [isLooping, setIsLooping] = useState(false);

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
        handleCreateInstrument,
        handleInstrumentNameSubmit,
        handleCreateGroup,
        handleExplodeInstrument,
    } = useGraphState();

    const { generatedCode, setGeneratedCode, handleGenerate } = useCodeGeneration();

    const sequencerStateHooks = useSequencerState();
    useInstrumentRegistry(nodes, sequencerStateHooks);

    const { isPlaying, handlePlay, handleStop, analyserNode, masterGainNode } = useAudioEngine(
        nodes,
        edges,
        isLooping,
        bpm,
        sequencerStateHooks.tracks,
        sequencerStateHooks.setCurrentStep
    );

    const { handleSave, handleLoad, handleImportGraph } = useFileIO(
        reactFlowInstance,
        setNodes,
        setEdges,
        () => { },
        () => { },
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
    }, [nodes, handleFocusNode, handleUndo, handleRedo, sequencerStateHooks]);

    // Inject AnalyserNode into Output Nodes for Visualizer
    // Inject AnalyserNode into Output Nodes for Visualizer
    useEffect(() => {
        if (!analyserNode || !analyserNode.current) return;

        // Only update if not already set preventing loop
        const needsUpdate = nodes.some(n => n.type === 'output' && !n.data.analyser);
        if (needsUpdate) {
            setNodes(nds => nds.map(n => {
                if (n.type === 'output' && !n.data.analyser) {
                    return {
                        ...n,
                        data: { ...n.data, analyser: analyserNode.current }
                    };
                }
                return n;
            }));
        }
    }, [isPlaying, nodes, setNodes, analyserNode]);

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

            <div style={workspaceContainerStyles}>
                <div style={sidebarPanelStyles}>
                    <Sidebar
                        onGenerate={() => handleGenerate(nodes, edges, sequencerStateHooks.tracks)}
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
                    />
                </div>
                <div style={mainCanvasStyles} ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={onDrop}
                        onSelectionChange={onSelectionChange}
                        onInit={setReactFlowInstance}
                        multiSelectionKeyCode={['Shift', 'Control']}
                        fitView
                    >
                        <Background />
                        <Controls />
                    </ReactFlow>
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
                        />
                    )}
                </div>
            </div>

            <SequencerDock
                state={sequencerState}
                bpm={bpm}
                setBpm={setBpm}
                onPlay={handlePlay}
                onStop={handleStop}
                onToggleLoop={() => setIsLooping(!isLooping)}
                isLooping={isLooping}
                onMuteToggle={sequencerStateHooks.toggleMute}
                onSoloToggle={sequencerStateHooks.toggleSolo}
                onFocusTrack={(trackId) => {
                    const track = sequencerStateHooks.tracks.find(t => t.id === trackId);
                    if (track) handleFocusNode(track.targetNodeId);
                }}
                onToggleStep={sequencerStateHooks.toggleStep}
                onUpdateNote={sequencerStateHooks.updateNote}
                onUpdateSteps={sequencerStateHooks.updateTrackSteps}
                analyserNode={analyserNode?.current || null}
                masterGainNode={masterGainNode?.current || null}
            />
        </div>
    );
}

const App = () => (
    <ReactFlowProvider>
        <EditorLayout />
    </ReactFlowProvider>
);

export default App;
