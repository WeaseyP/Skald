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
  const { screenToFlowPosition } = useReactFlow();
  
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

  return (
    <div style={appContainerStyles}>
      <div style={sidebarPanelStyles}>
        <Sidebar onGenerate={handleGenerate} />
      </div>
      <div style={mainCanvasStyles} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onDragOver={onDragOver} onDrop={onDrop}
          onSelectionChange={onSelectionChange} fitView
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