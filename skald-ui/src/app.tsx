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
} from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from './components/Sidebar';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import { OscillatorNode, FilterNode, GraphOutputNode } from './components/CustomNodes';


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
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // Audio state
  const audioContext = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioNodes = useRef<Map<string, AudioNode>>(new Map());


  const nodeTypes = useMemo(() => ({ 
    oscillator: OscillatorNode,
    filter: FilterNode,
    output: GraphOutputNode 
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
                setNodes(flow.nodes || []);
                setEdges(flow.edges || []);
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
          newNode = { id: `${newId}`, type, position, data: { label: `Filter`, type: 'Lowpass', cutoff: 800.0
           } };
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
    setGeneratedCode(null);
  }, []);

  const updateNodeData = (nodeId: string, data: object) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // Create a new node object instead of mutating the existing one
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      })
    );
    // Also update the selectedNode state to reflect the change immediately in the panel
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) {
        return { ...prev, data: { ...prev.data, ...data } };
      }
      return prev;
    });
  };

  const handleGenerate = async () => {
    if (nodes.length === 0) {
      alert("Graph is empty. Add some nodes first.");
      return;
    }

    const graphNodes = nodes.map(node => {
        let typeName = 'Unknown';
        let parameters: any = {};

        switch (node.type) {
            case 'oscillator':
                typeName = 'Oscillator';
                parameters = { waveform: node.data.waveform, frequency: node.data.frequency, amplitude: 0.3 };
                break;
            case 'filter':
                typeName = 'Filter';
                parameters = { type: node.data.type, cutoff: node.data.cutoff };
                break;
            case 'output':
                typeName = 'GraphOutput';
                break;
        }

        return {
            id: parseInt(node.id, 10), type: typeName, position: node.position, parameters
        };
    });

    const graphConnections = edges.map(edge => ({
        from_node: parseInt(edge.source, 10), from_port: edge.sourceHandle,
        to_node: parseInt(edge.target, 10), to_port: edge.targetHandle
    }));

    const audioGraph = { nodes: graphNodes, connections: graphConnections };
    
    // --- DEBUG: Log the graph object in the renderer process ---
    console.log("Renderer sending to main process:", JSON.stringify(audioGraph, null, 2));
    // -------------------------------------------------------------

    try {
        const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
        setGeneratedCode(code);
    } catch (error) {
        console.error("Error during code generation:", error);
        alert(`Code generation failed:\n${error.message}`);
    }
  };
  
  // NEW: Add the audio playback logic
  const handlePlay = () => {
    if (isPlaying) return;

    const context = new AudioContext();
    audioContext.current = context;

    const localAudioNodes = new Map<string, AudioNode>();

    // Create all audio nodes
    nodes.forEach(node => {
        let audioNode: AudioNode | null = null;
        switch (node.type) {
            case 'oscillator':
                const osc = context.createOscillator();
                osc.type = node.data.waveform.toLowerCase();
                osc.frequency.setValueAtTime(node.data.frequency, context.currentTime);
                osc.start();
                audioNode = osc;
                break;
            case 'filter':
                const filter = context.createBiquadFilter();
                filter.type = node.data.type.toLowerCase();
                filter.frequency.setValueAtTime(node.data.cutoff, context.currentTime);
                audioNode = filter;
                break;
            case 'output':
                audioNode = context.destination;
                break;
        }
        if (audioNode) {
            localAudioNodes.set(node.id, audioNode);
        }
    });

    // Connect nodes
    edges.forEach(edge => {
        const sourceNode = localAudioNodes.get(edge.source);
        const targetNode = localAudioNodes.get(edge.target);
        if (sourceNode && targetNode) {
            sourceNode.connect(targetNode);
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

return (
  <div style={appContainerStyles}>
      <div style={sidebarPanelStyles}>
          <Sidebar 
              onGenerate={handleGenerate} 
              onPlay={handlePlay} 
              onStop={handleStop} 
              isPlaying={isPlaying}
              onSave={handleSave}
              onLoad={handleLoad}
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
              onInit={setReactFlowInstance} // NEW: Get instance for saving
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
  return <EditorLayout />;
};

export default App;