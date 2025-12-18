/*
================================================================================
| FILE: skald-ui/src/app.tsx (Refactored)                                      |
|                                                                              |
| The main app component is now much cleaner. It's responsible for initializing|
| the hooks and rendering the UI layout, passing down the state and functions  |
| from the hooks to the appropriate child components.                          |
================================================================================
*/
import React, { useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ReactFlowInstance, ReactFlowProvider, Node } from 'reactflow';
import 'reactflow/dist/style.css';

// Import your components
import Sidebar from './components/Sidebar';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import NamePromptModal from './components/NamePromptModal';
import { 
    OscillatorNode, FilterNode, GraphOutputNode, NoiseNode, ADSRNode, 
    LFONode, SampleHoldNode, DelayNode, ReverbNode, DistortionNode, 
    MixerNode, PannerNode, GroupNode, FmOperatorNode, WavetableNode 
} from './components/Nodes';
import InstrumentNode from './components/InstrumentNode';


// Import your new hooks
import { useGraphState } from './hooks/nodeEditor/useGraphState';
import { useAudioEngine } from './hooks/nodeEditor/useAudioEngine';
import { useFileIO } from './hooks/nodeEditor/useFileIO';
import { useCodeGeneration } from './hooks/useCodeGeneration';
import { NODE_DEFINITIONS } from './definitions/node-definitions';

const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
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
    } = useGraphState();

    const { isPlaying, handlePlay, handleStop } = useAudioEngine(nodes, edges, isLooping, bpm);
    const { handleSave, handleLoad } = useFileIO(reactFlowInstance, setNodes, setEdges, () => {}, () => {}); 
    const { generatedCode, setGeneratedCode, handleGenerate } = useCodeGeneration();

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
            <div style={sidebarPanelStyles}>
                <Sidebar 
                    onGenerate={() => handleGenerate(nodes, edges)} 
                    onPlay={handlePlay} 
                    onStop={handleStop} 
                    isPlaying={isPlaying}
                    onSave={handleSave}
                    onLoad={handleLoad}
                    onCreateInstrument={handleCreateInstrument}
                    onCreateGroup={handleCreateGroup}
                    canCreateInstrument={selectedNodesForGrouping.length > 0}
                    bpm={bpm}
                    onBpmChange={setBpm}
                    isLooping={isLooping}
                    onLoopToggle={() => setIsLooping(!isLooping)}
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
    );
}

const App = () => (
    <ReactFlowProvider>
        <EditorLayout />
    </ReactFlowProvider>
);

export default App;
