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
    if (isPlaying) return;

    const context = new AudioContext();
    audioContext.current = context;
    const allAudioNodes = new Map<string, AudioNode>();
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * 2; // 2 seconds buffer for noise

    // Recursively creates Web Audio Nodes for a given list of graph nodes
    const createNodesRecursive = (graphNodes: Node[], parentIdPrefix: string = '') => {
      graphNodes.forEach(node => {
        const globalId = parentIdPrefix + node.id;
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
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1; // White noise
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
            // Example of holding sustain then releasing; a real implementation would be triggered
            gainNode.gain.setValueAtTime(sustain, now + attack + decay + 1.0);
            gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + 1.0 + release);
            audioNode = gainNode;
            break;

          case 'output': // The final output of the main graph
            audioNode = context.destination;
            break;

          case 'InstrumentInput':
          case 'InstrumentOutput':
            // For routing, a simple GainNode is a perfect pass-through junction
            audioNode = context.createGain();
            break;

          case 'instrument':
            // An instrument is a container; recurse into its subgraph
            if (node.data.subgraph && node.data.subgraph.nodes) {
              createNodesRecursive(node.data.subgraph.nodes, `${globalId}-`);
            }
            break;
        }

        if (audioNode) {
          allAudioNodes.set(globalId, audioNode);
        }
      });
    };

    // Recursively connects the newly created AudioNodes
    const connectNodesRecursive = (graphNodes: Node[], graphEdges: any[], parentIdPrefix: string = '') => {
        // Connect edges at the current graph level
        graphEdges.forEach(edge => {
            const sourceId = parentIdPrefix + (edge.source || edge.from_node);
            const targetId = parentIdPrefix + (edge.target || edge.to_node);

            const sourceAudioNode = allAudioNodes.get(sourceId);
            const targetAudioNode = allAudioNodes.get(targetId);

            if (sourceAudioNode && targetAudioNode) {
                // This is a simplified connection. To connect to a specific AudioParam (like frequency),
                // this logic would need to be expanded to check edge.targetHandle.
                sourceAudioNode.connect(targetAudioNode);
            }
        });

        // Recurse into any instrument subgraphs
        graphNodes.forEach(node => {
            if (node.type === 'instrument' && node.data.subgraph) {
                const globalId = parentIdPrefix + node.id;
                connectNodesRecursive(node.data.subgraph.nodes, node.data.subgraph.connections, `${globalId}-`);
            }
        });
    }

    // --- Main Execution ---
    // 1. Create all nodes in the graph and all subgraphs
    createNodesRecursive(nodes);
    
    // 2. Connect all nodes within subgraphs
    connectNodesRecursive(nodes, []); // Initial call for subgraphs

    // 3. Connect the top-level nodes
    edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source)!;
        const targetNode = nodes.find(n => n.id === edge.target)!;

        let finalSource: AudioNode | undefined;
        let finalTarget: AudioNode | AudioParam | undefined;

        // Resolve the source AudioNode
        if (sourceNode.type === 'instrument') {
            const portName = edge.sourceHandle || 'output';
            const outputNode = sourceNode.data.subgraph.nodes.find(n => n.type === 'InstrumentOutput' && n.data.name === portName);
            finalSource = allAudioNodes.get(`${sourceNode.id}-${outputNode.id}`);
        } else {
            finalSource = allAudioNodes.get(sourceNode.id);
        }

        // Resolve the target AudioNode or AudioParam
        if (targetNode.type === 'instrument') {
            const portName = edge.targetHandle || 'input';
            const inputNode = targetNode.data.subgraph.nodes.find(n => n.type === 'InstrumentInput' && n.data.name === portName);
            finalTarget = allAudioNodes.get(`${targetNode.id}-${inputNode.id}`);
        } else {
            finalTarget = allAudioNodes.get(targetNode.id);
        }

        if (finalSource && finalTarget) {
            finalSource.connect(finalTarget as any);
        }
    });

    audioNodes.current = allAudioNodes;
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
    const newInstrumentId = `${getId()}`;
    const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));

    // --- Subgraph Creation ---
    const oldIdToNewIdMap = new Map<string, string>();
    let subGraphNodeIdCounter = 1;
    const subgraphNodes: Node[] = selectedNodesForGrouping.map(node => {
      const newId = `${subGraphNodeIdCounter++}`;
      oldIdToNewIdMap.set(node.id, newId);
      // Deep copy node data to prevent reference issues
      return { ...node, id: newId, data: JSON.parse(JSON.stringify(node.data)), position: { ...node.position } };
    });

    const internalConnections = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
    const subgraphConnections = internalConnections.map(edge => ({
        from_node: oldIdToNewIdMap.get(edge.source)!,
        from_port: edge.sourceHandle || 'output',
        to_node: oldIdToNewIdMap.get(edge.target)!,
        to_port: edge.targetHandle || 'input',
    }));

    // --- Create Instrument Inputs and Outputs from External Connections ---
    const externalEdges = edges.filter(edge => selectedIds.has(edge.source) !== selectedIds.has(edge.target));
    const newMainGraphEdges: Edge[] = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target));
    
    const inputPorts = new Map<string, { id: string }>();
    const outputPorts = new Map<string, { id: string }>();

    externalEdges.forEach(edge => {
      // An edge going INTO the selection becomes an InstrumentInput
      if (selectedIds.has(edge.target)) {
        const portName = edge.targetHandle || 'input';
        if (!inputPorts.has(portName)) {
            const newInputNodeId = `${subGraphNodeIdCounter++}`;
            inputPorts.set(portName, { id: newInputNodeId });
            subgraphNodes.push({
                id: newInputNodeId,
                type: 'InstrumentInput',
                position: { x: 50, y: (inputPorts.size + 1) * 70 },
                data: { label: `In: ${portName}`, name: portName },
            });
        }
        subgraphConnections.push({
            from_node: inputPorts.get(portName)!.id,
            from_port: 'output',
            to_node: oldIdToNewIdMap.get(edge.target)!,
            to_port: portName,
        });
        newMainGraphEdges.push({ ...edge, target: newInstrumentId, targetHandle: portName });

      } else { // An edge going OUT of the selection becomes an InstrumentOutput
        const portName = edge.sourceHandle || 'output';
        if (!outputPorts.has(portName)) {
            const newOutputNodeId = `${subGraphNodeIdCounter++}`;
            outputPorts.set(portName, { id: newOutputNodeId });
            subgraphNodes.push({
                id: newOutputNodeId,
                type: 'InstrumentOutput',
                position: { x: 400, y: (outputPorts.size + 1) * 70 },
                data: { label: `Out: ${portName}`, name: portName },
            });
        }
        subgraphConnections.push({
            from_node: oldIdToNewIdMap.get(edge.source)!,
            from_port: portName,
            to_node: outputPorts.get(portName)!.id,
            to_port: 'input',
        });
        newMainGraphEdges.push({ ...edge, source: newInstrumentId, sourceHandle: portName });
      }
    });

    // --- Create the final Instrument Node for the main graph ---
    const avgPosition = selectedNodesForGrouping.reduce(
        (acc, node) => ({ x: acc.x + node.position.x, y: acc.y + node.position.y }), { x: 0, y: 0 }
    );
    if (selectedNodesForGrouping.length > 0) {
        avgPosition.x /= selectedNodesForGrouping.length;
        avgPosition.y /= selectedNodesForGrouping.length;
    }

    const newInstrumentNode: Node = {
      id: newInstrumentId,
      type: 'instrument',
      position: avgPosition,
      data: {
        name: instrumentName,
        label: instrumentName,
        inputs: Array.from(inputPorts.keys()),
        outputs: Array.from(outputPorts.keys()),
        subgraph: {
          nodes: subgraphNodes,
          connections: subgraphConnections,
        },
      },
    };

    // --- Update React Flow State ---
    const remainingNodes = nodes.filter(n => !selectedIds.has(n.id));
    setNodes([...remainingNodes, newInstrumentNode]);
    setEdges(newMainGraphEdges);
    setIsNamePromptVisible(false);
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
