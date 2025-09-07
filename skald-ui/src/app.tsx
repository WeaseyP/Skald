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
    MixerNode, PannerNode, GroupNode, FmOperatorNode, WavetableNode, GainNode
} from './components/Nodes';
import InstrumentNode from './components/InstrumentNode';


// Import your new hooks
import { useGraphState } from './hooks/nodeEditor/useGraphState';
import { useAudioEngine } from './hooks/nodeEditor/useAudioEngine';
import { useFileIO } from './hooks/nodeEditor/useFileIO';

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
    gain: GainNode,
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
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [bpm, setBpm] = useState(120);
    const [isLooping, setIsLooping] = useState(false); // State for the loop toggle
    
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

    const { isPlaying, handlePlay, handleStop, previewNode } = useAudioEngine(nodes, edges, isLooping, bpm);
    const { handleSave, handleLoad } = useFileIO(reactFlowInstance, setNodes, setEdges, () => {}, () => {}); 

    const handleGenerate = async () => {
        if (nodes.length === 0) {
            console.warn("Graph is empty. Add some nodes first.");
            return;
        }

        const formatNodesForCodegen = (nodeList: Node[]): any[] => {
            return nodeList.map(node => {
                let typeName = 'Unknown';
                let parameters: any = { ...node.data };
                let subgraph: any = null;

                delete parameters.label;

                switch (node.type) {
                    case 'lfo': typeName = 'LFO'; break;
                    case 'sampleHold': typeName = 'SampleHold'; break;
                    case 'oscillator': typeName = 'Oscillator'; break;
                    case 'filter': typeName = 'Filter'; break;
                    case 'noise': typeName = 'Noise'; break;
                    case 'adsr': typeName = 'ADSR'; break;
                    case 'delay': typeName = 'Delay'; break;
                    case 'reverb': typeName = 'Reverb'; break;
                    case 'distortion': typeName = 'Distortion'; break;
                    case 'mixer': typeName = 'Mixer'; break;
                    case 'panner': typeName = 'Panner'; break;
                    case 'fmOperator': typeName = 'FmOperator'; break;
                    case 'wavetable': typeName = 'Wavetable'; break;
                    case 'output': typeName = 'GraphOutput'; parameters = {}; break;
                    case 'instrument':
                    case 'group':
                        typeName = node.type === 'instrument' ? 'Instrument' : 'Group';
                        parameters = { name: node.data.name || node.data.label }; 
                        if (node.data.subgraph && node.data.subgraph.nodes) {
                            subgraph = {
                                nodes: formatNodesForCodegen(node.data.subgraph.nodes),
                                connections: node.data.subgraph.connections.map((edge: any) => ({
                                    from_node: parseInt(edge.from_node, 10),
                                    from_port: edge.from_port || 'output',
                                    to_node: parseInt(edge.to_node, 10),
                                    to_port: edge.to_port || 'input'
                                }))
                            };
                        }
                        break;
                    case 'InstrumentInput': typeName = 'GraphInput'; break;
                    case 'InstrumentOutput': typeName = 'GraphOutput'; break;
                }

                const result: any = {
                    id: parseInt(node.id, 10),
                    type: typeName,
                    position: node.position,
                    parameters: parameters,
                    exposed_parameters: node.data.exposedParameters || []
                };

                if (subgraph) {
                    result.subgraph = subgraph;
                }
                return result;
            });
        };

        const graphNodes = formatNodesForCodegen(nodes);

        const graphConnections = edges.map(edge => ({
            from_node: parseInt(edge.source, 10),
            from_port: edge.sourceHandle || 'output',
            to_node: parseInt(edge.target, 10),
            to_port: edge.targetHandle || 'input'
        }));

        const audioGraph = { nodes: graphNodes, connections: graphConnections };

        try {
            const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
            setGeneratedCode(code);
        } catch (error) {
            console.error("Error during code generation:", error);
            setGeneratedCode(`// ERROR: Failed to generate code.`);
        }
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
            <div style={sidebarPanelStyles}>
                <Sidebar 
                    onGenerate={handleGenerate} 
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
