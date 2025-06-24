// src/app.tsx

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
    NodeChange,
    EdgeChange,
    useReactFlow,
    OnSelectionChangeParams,
    ReactFlowInstance,
    ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from './components/Sidebar';
import ParameterPanel from './components/ParameterPanel';
import CodePreviewPanel from './components/CodePreviewPanel';
import { OscillatorNode, FilterNode, GraphOutputNode, NoiseNode, ADSRNode, LFONode, SampleHoldNode  } from './components/CustomNodes';
import InstrumentNode from './components/InstrumentNode';
import NamePromptModal from './components/NamePromptModal'; 

const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1E1E1E', // Darker background for the whole app
};

const sidebarPanelStyles: React.CSSProperties = {
    width: '200px',
    backgroundColor: '#252526', // Darker sidebar
    borderRight: '1px solid #333',
};

const mainCanvasStyles: React.CSSProperties = {
    flexGrow: 1,
    height: '100%',
};

const parameterPanelStyles: React.CSSProperties = {
    width: '350px',
    backgroundColor: '#252526', // Darker parameter panel
    borderLeft: '1px solid #333',
};


let id = 0;
const getId = () => ++id;

const sampleHoldProcessorString = `
class SampleHoldProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 10.0, minValue: 0 }];
  }

  constructor() {
    super();
    this.updateInterval = 1 / 10.0 * sampleRate;
    this.value = Math.random() * 2 - 1;
    this.counter = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const rate = parameters.rate[0];
    this.updateInterval = 1 / rate * sampleRate;

    for (let channel = 0; channel < output.length; ++channel) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; ++i) {
        if (this.counter >= this.updateInterval) {
            this.value = Math.random() * 2 - 1;
            this.counter = 0;
        }
        outputChannel[i] = this.value;
        this.counter++;
      }
    }
    return true;
  }
}

registerProcessor('sample-hold-processor', SampleHoldProcessor);
`;

const EditorLayout = () => {
  // --- Core State ---
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedNodesForGrouping, setSelectedNodesForGrouping] = useState<Node[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // --- Undo/Redo State ---
  type HistoryState = { nodes: Node[]; edges: Edge[]; };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const isRestoring = useRef(false); // Prevents feedback loops during undo/redo

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
    lfo: LFONode, 
    instrument: InstrumentNode,
    sampleHold: SampleHoldNode,
  }), []);

  // --- State Change Handlers with Undo/Redo ---

  const saveStateForUndo = useCallback(() => {
    if (isRestoring.current) return;

    // Capture the current state before the change is applied
    const currentState = { nodes, edges };

    setHistory(prevHistory => [...prevHistory, currentState]);
    setFuture([]); // Clear redo stack on new action
  }, [nodes, edges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
        const isUndoableChange = changes.some(change => 
            change.type === 'add' || change.type === 'remove' || (change.type === 'position' && !change.dragging)
        );

        if (isUndoableChange) {
            saveStateForUndo();
        }
        setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes, saveStateForUndo]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
      (changes: EdgeChange[]) => {
        const isUndoableChange = changes.some(change => change.type === 'add' || change.type === 'remove');

        if (isUndoableChange) {
          saveStateForUndo();
        }
        setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges, saveStateForUndo]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
        saveStateForUndo();
        const edge = { ...connection, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle };
        setEdges((eds) => addEdge(edge, eds))
    },
    [setEdges, saveStateForUndo]
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
                // Clear history when loading a new graph
                setHistory([]);
                setFuture([]);
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

      // NEW: Default exposed parameters are defined here on node creation
      switch (type) {
        case 'sampleHold':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `S & H`,
              rate: 10.0,
              amplitude: 100.0,
              exposedParameters: ['rate']
          }};
          break;
        case 'lfo':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `LFO`, 
              waveform: "Sine",
              frequency: 5.0,
              amplitude: 1.0,
              exposedParameters: ['frequency', 'amplitude'] // Exposed by default
          }};
          break;
        case 'oscillator':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `Oscillator`, 
              frequency: 440.0, 
              waveform: "Sawtooth",
              amplitude: 0.5,
              exposedParameters: ['frequency', 'amplitude'] // Exposed by default
          }};
          break;
        case 'filter':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `Filter`, 
              type: 'Lowpass', 
              cutoff: 800.0,
              exposedParameters: ['cutoff'] // Exposed by default
          }};
          break;
        case 'noise':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `Noise`, 
              type: 'White',
              amplitude: 1.0,
              exposedParameters: ['amplitude'] // Exposed by default
          }};
          break;
        case 'adsr':
          newNode = { id: `${newId}`, type, position, data: { 
              label: `ADSR`, 
              attack: 0.1, 
              decay: 0.2, 
              sustain: 0.5, 
              release: 1.0,
              exposedParameters: ['attack', 'decay', 'sustain', 'release'] // Exposed by default
          }};
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
    // Save state before updating node data for undo
    saveStateForUndo();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // IMPORTANT: ensure we pass the whole data object, not just the changed part
          return { ...node, data: data };
        }
        return node;
      })
    );
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) {
         // IMPORTANT: ensure we pass the whole data object
        return { ...prev, data: data };
      }
      return prev;
    });
  };

 const handleGenerate = async () => {
    if (nodes.length === 0) {
      console.warn("Graph is empty. Add some nodes first.");
      return;
    }

    const formatNodesForCodegen = (nodeList: Node[]): any[] => {
        return nodeList.map(node => {
            let typeName = 'Unknown';
            // Start with all parameters from the node data
            let parameters: any = { ...node.data };
            let subgraph: any = null;

            // Remove non-codegen related data properties
            delete parameters.label;
            // The exposedParameters array itself is a special case for the codegen
            // It's not a parameter of the node's sound, but metadata about them.
            // So we don't need to delete it here.

            switch (node.type) {
                case 'lfo': typeName = 'LFO'; break;
                case 'sampleHold': typeName = 'SampleHold'; break;
                case 'oscillator': typeName = 'Oscillator'; break;
                case 'filter': typeName = 'Filter'; break;
                case 'noise': typeName = 'Noise'; break;
                case 'adsr': typeName = 'ADSR'; break;
                case 'output': typeName = 'GraphOutput'; parameters = {}; break; // Output has no params
                case 'instrument':
                    typeName = 'Instrument';
                    // For instruments, only the name is a direct parameter
                    parameters = { name: node.data.name }; 
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

    console.log("Renderer sending to main process:", JSON.stringify(audioGraph, null, 2));

    try {
      const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
      setGeneratedCode(code);
    } catch (error) {
      console.error("Error during code generation:", error);
      // You could show an error modal here
      setGeneratedCode(`// ERROR: Failed to generate code.\n// Check console for details.\n\n/*\n${error}\n*/`);
    }
  };
  
  const handlePlay = async() => {
    if (isPlaying) return;

    const context = new AudioContext();
    audioContext.current = context;

    try {
        const workletBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
        const workletURL = URL.createObjectURL(workletBlob);
        await context.audioWorklet.addModule(workletURL);
    } catch (e) {
        console.error('Error loading AudioWorklet:', e);
        // Clean up context if worklet loading fails
        audioContext.current = null;
        return;
    }

    const allAudioNodes = new Map<string, AudioNode>();
    const sampleRate = context.sampleRate;
    const bufferSize = sampleRate * 2; 

    const createNodesRecursive = (graphNodes: Node[], parentIdPrefix: string = '') => {
      graphNodes.forEach(node => {
        const globalId = parentIdPrefix + node.id;
        let audioNode: AudioNode | null = null;

        switch (node.type) {
          case 'sampleHold':
            const shWorkletNode = new AudioWorkletNode(context, 'sample-hold-processor');
            shWorkletNode.parameters.get('rate')?.setValueAtTime(node.data.rate || 10.0, context.currentTime);
            const shGain = context.createGain();
            shGain.gain.setValueAtTime(node.data.amplitude || 100.0, context.currentTime);
            shWorkletNode.connect(shGain);
            audioNode = shGain;
            break;
          case 'lfo':
            const lfo = context.createOscillator();
            const lfoWaveform = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
            if (['sine', 'sawtooth', 'triangle', 'square'].includes(lfoWaveform)) {
                lfo.type = lfoWaveform;
            }
            lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
            lfo.start();

            // Use a Gain node to control the LFO's depth (amplitude)
            const lfoGain = context.createGain();
            lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
            lfo.connect(lfoGain);

            // The output of the LFO "unit" is the gain node
            audioNode = lfoGain;
            break;

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
            gainNode.gain.setValueAtTime(sustain, now + attack + decay + 1.0);
            gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + 1.0 + release);
            audioNode = gainNode;
            break;

          case 'output': 
            audioNode = context.destination;
            break;

          case 'InstrumentInput':
          case 'InstrumentOutput':
            audioNode = context.createGain();
            break;

          case 'instrument':
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

    const connectNodesRecursive = (graphNodes: Node[], graphEdges: any[], parentIdPrefix: string = '') => {
        graphEdges.forEach(edge => {
            const sourceId = parentIdPrefix + (edge.source || edge.from_node);
            const targetId = parentIdPrefix + (edge.target || edge.to_node);

            const sourceAudioNode = allAudioNodes.get(sourceId);
            const targetAudioNode = allAudioNodes.get(targetId);

            if (sourceAudioNode && targetAudioNode) {
              sourceAudioNode.connect(targetAudioNode);
            }
        });

        graphNodes.forEach(node => {
            if (node.type === 'instrument' && node.data.subgraph) {
                const globalId = parentIdPrefix + node.id;
                connectNodesRecursive(node.data.subgraph.nodes, node.data.subgraph.connections, `${globalId}-`);
            }
        });
    }

    createNodesRecursive(nodes);
    
    connectNodesRecursive(nodes, []); 

    edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source)!;
        const targetNode = nodes.find(n => n.id === edge.target)!;

        let finalSource: AudioNode | undefined;
        let finalTarget: AudioNode | AudioParam | undefined;

        if (sourceNode.type === 'instrument') {
            const portName = edge.sourceHandle || 'output';
            const outputNode = sourceNode.data.subgraph.nodes.find(n => n.type === 'InstrumentOutput' && n.data.name === portName);
            finalSource = allAudioNodes.get(`${sourceNode.id}-${outputNode.id}`);
        } else {
            finalSource = allAudioNodes.get(sourceNode.id);
        }

        if (targetNode.type === 'instrument') {
            const portName = edge.targetHandle || 'input';
            const inputNode = targetNode.data.subgraph.nodes.find(n => n.type === 'InstrumentInput' && n.data.name === portName);
            finalTarget = allAudioNodes.get(`${targetNode.id}-${inputNode.id}`);
        } else {
            const targetAudioNode = allAudioNodes.get(targetNode.id);

            // If the source is a modulator, connect to a parameter
            if (['lfo', 'sampleHold'].includes(sourceNode.type) && edge.targetHandle && targetAudioNode) {
                const paramName = edge.targetHandle.replace('input_', ''); 
                
                if (paramName === 'freq' && 'frequency' in targetAudioNode) {
                    finalTarget = (targetAudioNode as any)['frequency'];
                } else if (paramName === 'amp' && 'gain' in targetAudioNode) {
                    finalTarget = (targetAudioNode as any)['gain'];
                } else {
                    if (targetAudioNode && paramName in targetAudioNode) {
                         finalTarget = (targetAudioNode as any)[paramName];
                    }
                }
            } else {
                finalTarget = targetAudioNode;
            }
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

 const handleInstrumentNameSubmit = (instrumentName: string) => {
    const newInstrumentId = `${getId()}`;
    const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));

    const oldIdToNewIdMap = new Map<string, string>();
    let subGraphNodeIdCounter = 1;
    const subgraphNodes: Node[] = selectedNodesForGrouping.map(node => {
      const newId = `${subGraphNodeIdCounter++}`;
      oldIdToNewIdMap.set(node.id, newId);
      return { ...node, id: newId, data: JSON.parse(JSON.stringify(node.data)), position: { ...node.position } };
    });

    const internalConnections = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
    const subgraphConnections = internalConnections.map(edge => ({
        from_node: oldIdToNewIdMap.get(edge.source)!,
        from_port: edge.sourceHandle || 'output',
        to_node: oldIdToNewIdMap.get(edge.target)!,
        to_port: edge.targetHandle || 'input',
    }));

    const externalEdges = edges.filter(edge => selectedIds.has(edge.source) !== selectedIds.has(edge.target));
    const newMainGraphEdges: Edge[] = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target));
    
    const inputPorts = new Map<string, { id: string }>();
    const outputPorts = new Map<string, { id: string }>();

    externalEdges.forEach(edge => {
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
        newMainGraphEdges.push({ ...edge, id: `e${edge.source}-${newInstrumentId}`, target: newInstrumentId, targetHandle: portName });

      } else { 
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
        newMainGraphEdges.push({ ...edge, id: `e${newInstrumentId}-${edge.target}`, source: newInstrumentId, sourceHandle: portName });
      }
    });

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
    
    saveStateForUndo();
    const remainingNodes = nodes.filter(n => !selectedIds.has(n.id));
    setNodes([...remainingNodes, newInstrumentNode]);
    setEdges(newMainGraphEdges);
    setIsNamePromptVisible(false);
  };
 const handleCreateInstrument = useCallback(() => {
    if (selectedNodesForGrouping.length <= 1) {
      return;
    }
    setIsNamePromptVisible(true);
  }, [selectedNodesForGrouping]);

  // --- Keyboard Shortcuts (Delete, Undo, Redo) ---
  const { deleteElements } = useReactFlow();

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    isRestoring.current = true;

    const lastState = history[history.length - 1];
    setHistory(history.slice(0, -1));
    
    const currentState = { nodes, edges };
    setFuture(prevFuture => [currentState, ...prevFuture]);

    setNodes(lastState.nodes);
    setEdges(lastState.edges);

    isRestoring.current = false;
  }, [history, nodes, edges, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;

    isRestoring.current = true;

    const nextState = future[0];
    setFuture(future.slice(1));

    const currentState = { nodes, edges };
    setHistory(prevHistory => [...prevHistory, currentState]);

    setNodes(nextState.nodes);
    setEdges(nextState.edges);

    isRestoring.current = false;
  }, [future, nodes, edges, setNodes, setEdges]);

  useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
              const selectedNodes = reactFlowInstance?.getNodes().filter(n => n.selected) || [];
              const selectedEdges = reactFlowInstance?.getEdges().filter(e => e.selected) || [];
              if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                  saveStateForUndo();
                  deleteElements({ nodes: selectedNodes, edges: selectedEdges });
              }
          } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
              handleUndo();
          } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
              handleRedo();
          }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
  }, [reactFlowInstance, deleteElements, saveStateForUndo, handleUndo, handleRedo]);

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