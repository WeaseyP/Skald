// src/app.tsx

import React, { useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    Node,
    Edge,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    useReactFlow,
    OnSelectionChangeParams,
    ReactFlowInstance,
    ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from './components/Sidebar';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import { OscillatorNode, FilterNode, GraphOutputNode, NoiseNode, ADSRNode } from './components/CustomNodes';
import InstrumentNode from './components/InstrumentNode';
import NamePromptModal from './components/NamePromptModal'; // 1. Import your modal

const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#f0f0f0'
};

const sidebarPanelStyles: React.CSSProperties = {
    width: '200px',
    backgroundColor: '#fff',
};

const mainCanvasStyles: React.CSSProperties = {
    flexGrow: 1,
    height: '100%',
};

const parameterPanelStyles: React.CSSProperties = {
    width: '350px',
    backgroundColor: '#fff',
};

let id = 0;
const getId = () => ++id;

const EditorLayout = () => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedNodesForGrouping, setSelectedNodesForGrouping] = useState<Node[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // 2. Add state for modal visibility
  const [isNamePromptVisible, setIsNamePromptVisible] = useState(false);

  const audioContext = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioNodes = useRef<Map<string, AudioNode>>(new Map());


  const nodeTypes = useMemo(() => ({ 
    oscillator: OscillatorNode,
    filter: FilterNode,
    output: GraphOutputNode,
    noise: NoiseNode,
    adsr: ADSRNode,
    instrument: InstrumentNode,
  }), []);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
        const edge = { ...connection, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle };
        setEdges((eds) => addEdge(edge, eds))
    },
    [setEdges]
  );
  
  const handleSave = useCallback(() => {
        if (reactFlowInstance) {
            const flow = reactFlowInstance.toObject();
            const graphJson = JSON.stringify(flow, null, 2);
            window.electron.saveGraph(graphJson);
        }
    }, [reactFlowInstance]);

    const handleLoad = useCallback(async () => {
        const graphJson = await window.electron.loadGraph();
        if (graphJson) {
            const flow = JSON.parse(graphJson);
            if (flow) {
                const loadedNodes = flow.nodes || [];
                setNodes(loadedNodes);
                setEdges(flow.edges || []);
                const maxId = Math.max(0, ...loadedNodes.map((n: Node) => parseInt(n.id)));
                id = maxId;
            }
        }
    }, [setNodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;
      
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      let newNode: Node;
      const newId = getId();

      switch (type) {
        case 'oscillator':
          newNode = { id: `${newId}`, type, position, data: { label: `Oscillator`, frequency: 440.0, waveform: "Sawtooth" } };
          break;
        case 'filter':
          newNode = { id: `${newId}`, type, position, data: { label: `Filter`, type: 'Lowpass', cutoff: 800.0 } };
          break;
        case 'noise':
          newNode = { id: `${newId}`, type, position, data: { label: `Noise`, noiseType: 'White' } };
          break;
        case 'adsr':
          newNode = { id: `${newId}`, type, position, data: { label: `ADSR`, attack: 0.1, decay: 0.2, sustain: 0.5, release: 1.0 } };
          break;
        case 'output':
          newNode = { id: `${newId}`, type, position, data: { label: `Output` } };
          break;
        default:
          return;
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition]
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNode(params.nodes.length === 1 ? params.nodes[0] : null);
    setSelectedNodesForGrouping(params.nodes);
    setGeneratedCode(null);
  }, []);

  const updateNodeData = (nodeId: string, data: object) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      })
    );
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) {
        return { ...prev, data: { ...prev.data, ...data } };
      }
      return prev;
    });
  };

  const handleGenerate = async () => {
    if (nodes.length === 0) {
      console.warn("Graph is empty. Add some nodes first.");
      return;
    }
  
    // Helper to recursively format nodes
    const formatNodesForCodegen = (nodeList: Node[]) => {
      return nodeList.map(node => {
        let typeName = 'Unknown';
        let parameters: any = {};
        let subgraph: any = null;
  
        switch (node.type) {
          case 'oscillator':
            typeName = 'Oscillator';
            parameters = { waveform: node.data.waveform, frequency: node.data.frequency, amplitude: 0.5 };
            break;
          case 'filter':
            typeName = 'Filter';
            parameters = { type: node.data.type, cutoff: node.data.cutoff };
            break;
          case 'noise':
            typeName = 'Noise';
            parameters = { type: node.data.noiseType };
            break;
          case 'adsr':
            typeName = 'ADSR';
            parameters = { attack: node.data.attack, decay: node.data.decay, sustain: node.data.sustain, release: node.data.release };
            break;
          case 'instrument':
            typeName = 'Instrument';
            parameters = { name: node.data.name };
            if (node.data.subgraph && node.data.subgraph.nodes) {
              subgraph = {
                nodes: formatNodesForCodegen(node.data.subgraph.nodes),
                connections: node.data.subgraph.connections.map((edge: any) => ({
                    from_node: parseInt(edge.from_node, 10), from_port: edge.from_port || 'output',
                    to_node: parseInt(edge.to_node, 10), to_port: edge.to_port || 'input'
                }))
              };
            }
            break;
          case 'output':
            typeName = 'GraphOutput';
            break;
        }
  
        const result: any = {
          id: parseInt(node.id, 10),
          type: typeName,
          position: node.position,
          parameters
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
  
    console.log("Renderer sending to main process:", JSON.stringify(audioGraph, null, 2));
  
    try {
      const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
      setGeneratedCode(code);
    } catch (error) {
      console.error("Error during code generation:", error);
    }
  };
  
  const handlePlay = () => {
    // This will need to be updated to handle instrument nodes
    if (isPlaying) return;

    const context = new AudioContext();
    audioContext.current = context;
    const localAudioNodes = new Map<string, AudioNode>();
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * 2; 

    nodes.forEach(node => {
        let audioNode: AudioNode | null = null;
        switch (node.type) {
            case 'oscillator':
                const osc = context.createOscillator();
                const waveform = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
                if (['sine', 'sawtooth', 'triangle', 'square'].includes(waveform)) {
                  osc.type = waveform;
                }
                osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
                osc.start();
                audioNode = osc;
                break;
            case 'filter':
                const filter = context.createBiquadFilter();
                filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
                filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
                audioNode = filter;
                break;
            case 'noise':
                const buffer = context.createBuffer(1, bufferSize, sampleRate);
                const data = buffer.getChannelData(0);
                if (node.data.noiseType === 'White') {
                    for (let i = 0; i < bufferSize; i++) {
                        data[i] = Math.random() * 2 - 1;
                    }
                } else { // Pink noise
                    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                    for (let i = 0; i < bufferSize; i++) {
                        const white = Math.random() * 2 - 1;
                        b0 = 0.99886 * b0 + white * 0.0555179;
                        b1 = 0.99332 * b1 + white * 0.0750759;
                        b2 = 0.96900 * b2 + white * 0.1538520;
                        b3 = 0.86650 * b3 + white * 0.3104856;
                        b4 = 0.55000 * b4 + white * 0.5329522;
                        b5 = -0.7616 * b5 - white * 0.0168980;
                        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                        data[i] *= 0.11;
                        b6 = white * 0.115926;
                    }
                }
                const noiseSource = context.createBufferSource();
                noiseSource.buffer = buffer;
                noiseSource.loop = true;
                noiseSource.start();
                audioNode = noiseSource;
                break;
            case 'adsr':
                const gainNode = context.createGain();
                const { attack = 0.1, decay = 0.2, sustain = 0.5, release = 1.0 } = node.data;
                const now = context.currentTime;
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(1, now + attack);
                gainNode.gain.linearRampToValueAtTime(sustain, now + attack + decay);
                gainNode.gain.setValueAtTime(sustain, now + attack + decay + 1.0);
                gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + 1.0 + release);
                audioNode = gainNode;
                break;
            case 'output':
                audioNode = context.destination;
                break;
        }
        if (audioNode) {
            localAudioNodes.set(node.id, audioNode);
        }
    });

    edges.forEach(edge => {
        const sourceNode = localAudioNodes.get(edge.source);
        const targetNode = localAudioNodes.get(edge.target);
        if (sourceNode && targetNode) {
            // This needs to be smarter to connect to specific AudioParams
            if (targetNode instanceof AudioParam) {
                sourceNode.connect(targetNode);
            } else {
                sourceNode.connect(targetNode);
            }
        }
    });

    audioNodes.current = localAudioNodes;
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!isPlaying || !audioContext.current) return;

    audioContext.current.close().then(() => {
        audioContext.current = null;
        audioNodes.current.clear();
        setIsPlaying(false);
    });
  };

  // 3. Logic moved into a submit handler
  const handleInstrumentNameSubmit = (instrumentName: string) => {
    const newId = getId();
    const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));

    const avgPosition = selectedNodesForGrouping.reduce(
        (acc, node) => ({ x: acc.x + node.position.x, y: acc.y + node.position.y }),
        { x: 0, y: 0 }
    );
    avgPosition.x /= selectedNodesForGrouping.length;
    avgPosition.y /= selectedNodesForGrouping.length;

    const subgraphNodes = selectedNodesForGrouping.map(node => ({
        ...node,
        data: JSON.parse(JSON.stringify(node.data)),
    }));
    
    const subgraphConnections = edges
        .filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target))
        .map(edge => ({
            from_node: edge.source,
            from_port: edge.sourceHandle || 'output',
            to_node: edge.target,
            to_port: edge.targetHandle || 'input',
        }));

    const newInstrumentNode: Node = {
        id: `${newId}`,
        type: 'instrument',
        position: avgPosition,
        data: {
            name: instrumentName,
            label: instrumentName,
            subgraph: {
                nodes: subgraphNodes,
                connections: subgraphConnections,
            },
        },
    };

    setNodes(nds => [...nds.filter(n => !selectedIds.has(n.id)), newInstrumentNode]);
    setEdges(eds => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setIsNamePromptVisible(false); // Hide modal on submit
  };
  
  // 4. This function now just opens the modal
  const handleCreateInstrument = useCallback(() => {
    if (selectedNodesForGrouping.length <= 1) {
      return;
    }
    setIsNamePromptVisible(true);
  }, [selectedNodesForGrouping]);

return (
  <div style={appContainerStyles}>
      {/* 5. Render the modal conditionally */}
      {isNamePromptVisible && (
        <NamePromptModal
            title="Create New Instrument"
            defaultValue="MyInstrument"
            onConfirm={handleInstrumentNameSubmit}
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
              canCreateInstrument={selectedNodesForGrouping.length > 1}
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
              onDragOver={onDragOver} 
              onDrop={onDrop}
              onSelectionChange={onSelectionChange}
              onInit={setReactFlowInstance}
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
            <ParameterPanel selectedNode={selectedNode} onUpdateNode={updateNodeData} />
        )}
      </div>
    </div>
  );
}

const App = () => {
  return (
    <ReactFlowProvider>
      <EditorLayout />
    </ReactFlowProvider>
  );
};
  
export default App;
