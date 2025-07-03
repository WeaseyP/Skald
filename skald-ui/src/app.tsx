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
import { 
    OscillatorNode, 
    FilterNode, 
    GraphOutputNode, 
    NoiseNode, 
    ADSRNode, 
    LFONode, 
    SampleHoldNode, 
    DelayNode,
    ReverbNode,
    DistortionNode,
    MixerNode,
    PannerNode,
    GroupNode
} from './components/Nodes';
import InstrumentNode from './components/InstrumentNode';
import NamePromptModal from './components/NamePromptModal';

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


let id = 0;
const getId = () => ++id;

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];


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
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedNodesForGrouping, setSelectedNodesForGrouping] = useState<Node[]>([]);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const { screenToFlowPosition } = useReactFlow();
    
    type HistoryState = { nodes: Node[]; edges: Edge[]; };
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [future, setFuture] = useState<HistoryState[]>([]);
    const isRestoring = useRef(false);

    const [isNamePromptVisible, setIsNamePromptVisible] = useState(false);

    const audioContext = useRef<AudioContext | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioNodes = useRef<Map<string, AudioNode>>(new Map());
    const complexAudioNodes = useRef<Map<string, {input: AudioNode, output: AudioNode}>>(new Map());
    const mixerInputNodes = useRef<Map<string, AudioNode[]>>(new Map());


    const nodeTypes = useMemo(() => ({ 
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
    }), []);

    const saveStateForUndo = useCallback(() => {
        if (isRestoring.current) return;
        const currentState = { nodes, edges };
        setHistory(prevHistory => [...prevHistory, currentState]);
        setFuture([]);
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
            const edge = { ...connection, id: `e${connection.source}-${connection.target}`, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle };
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

            switch (type) {
                case 'sampleHold':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `S & H`,
                        rate: 10.0,
                        amplitude: 1.0,
                        exposedParameters: ['rate']
                    }};
                    break;
                case 'lfo':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `LFO`, 
                        waveform: "Sine",
                        frequency: 5.0,
                        amplitude: 1.0,
                        exposedParameters: ['frequency', 'amplitude']
                    }};
                    break;
                case 'oscillator':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `Oscillator`, 
                        frequency: 440.0, 
                        waveform: "Sawtooth",
                        amplitude: 0.5,
                        exposedParameters: ['frequency', 'amplitude']
                    }};
                    break;
                case 'filter':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `Filter`, 
                        type: 'Lowpass', 
                        cutoff: 800.0,
                        exposedParameters: ['cutoff']
                    }};
                    break;
                case 'noise':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `Noise`, 
                        type: 'White',
                        amplitude: 1.0,
                        exposedParameters: ['amplitude']
                    }};
                    break;
                case 'adsr':
                    newNode = { id: `${newId}`, type, position, data: { 
                        label: `ADSR`, 
                        attack: 0.1, 
                        decay: 0.2, 
                        sustain: 0.5, 
                        release: 1.0,
                        exposedParameters: ['attack', 'decay', 'sustain', 'release']
                    }};
                    break;
                case 'delay':
                    newNode = { id: `${newId}`, type, position, data: {
                        label: 'Delay',
                        delayTime: 0.5,
                        feedback: 0.5,
                        mix: 0.5,
                        exposedParameters: ['delayTime', 'feedback', 'mix']
                    }};
                    break;
                case 'reverb':
                    newNode = { id: `${newId}`, type, position, data: {
                        label: 'Reverb',
                        decay: 3.0,
                        preDelay: 0.01,
                        mix: 0.5,
                        exposedParameters: ['decay', 'mix']
                    }};
                    break;
                case 'distortion':
                    newNode = { id: `${newId}`, type, position, data: {
                        label: 'Distortion',
                        drive: 20,
                        tone: 4000,
                        mix: 0.5,
                        exposedParameters: ['drive', 'tone', 'mix']
                    }};
                    break;
                case 'mixer':
                    newNode = { id: `${newId}`, type, position, data: {
                        label: 'Mixer',
                        inputCount: 4,
                        level1: 0.75, level2: 0.75, level3: 0.75, level4: 0.75,
                        exposedParameters: ['level1', 'level2', 'level3', 'level4']
                    }};
                    break;
                case 'panner':
                    newNode = { id: `${newId}`, type, position, data: {
                        label: 'Panner',
                        pan: 0,
                        exposedParameters: ['pan']
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

    const updateNodeData = (nodeId: string, data: object, subNodeId?: string) => {
        saveStateForUndo();
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    if (subNodeId && node.data.subgraph?.nodes) {
                        const newSubgraphNodes = node.data.subgraph.nodes.map(subNode => {
                            if (subNode.id === subNodeId) {
                                return { ...subNode, data: data };
                            }
                            return subNode;
                        });
                        return { ...node, data: { ...node.data, subgraph: { ...node.data.subgraph, nodes: newSubgraphNodes } } };
                    }
                    return { ...node, data: data };
                }
                return node;
            })
        );
        setSelectedNode((prev) => {
            if (prev && prev.id === nodeId) {
                if (subNodeId && prev.data.subgraph?.nodes) {
                     const newSubgraphNodes = prev.data.subgraph.nodes.map(subNode => {
                        if (subNode.id === subNodeId) {
                            return { ...subNode, data: data };
                        }
                        return subNode;
                    });
                    return { ...prev, data: { ...prev.data, subgraph: { ...prev.data.subgraph, nodes: newSubgraphNodes } } };
                }
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

        console.log("Renderer sending to main process:", JSON.stringify(audioGraph, null, 2));

        try {
            const code = await window.electron.invokeCodegen(JSON.stringify(audioGraph, null, 2));
            setGeneratedCode(code);
        } catch (error) {
            console.error("Error during code generation:", error);
            setGeneratedCode(`// ERROR: Failed to generate code.\n// Check console for details.\n\n/*\n${error}\n*/`);
        }
    };
  
    const handlePlay = async() => {
        if (isPlaying) return;

        const context = new AudioContext();
        audioContext.current = context;
        complexAudioNodes.current.clear();
        mixerInputNodes.current.clear();

        try {
            const workletBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const workletURL = URL.createObjectURL(workletBlob);
            await context.audioWorklet.addModule(workletURL);
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
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
                        shGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
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
                        const lfoGain = context.createGain();
                        lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
                        lfo.connect(lfoGain);
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
                            data[i] = Math.random() * 2 - 1;
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
                    case 'delay':
                        const delay = context.createDelay(5.0);
                        delay.delayTime.setValueAtTime(node.data.delayTime || 0.5, context.currentTime);

                        const feedback = context.createGain();
                        feedback.gain.setValueAtTime(node.data.feedback || 0.5, context.currentTime);

                        const mix = context.createGain();
                        mix.gain.setValueAtTime(node.data.mix || 0.5, context.currentTime);

                        const dry = context.createGain();
                        dry.gain.setValueAtTime(1.0 - (node.data.mix || 0.5), context.currentTime);
                        
                        const output = context.createGain();

                        delay.connect(feedback);
                        feedback.connect(delay);
                        delay.connect(mix);
                        mix.connect(output);
                        dry.connect(output);

                        const delayInput = context.createGain();
                        delayInput.connect(dry);
                        delayInput.connect(delay);

                        complexAudioNodes.current.set(globalId, { input: delayInput, output: output });
                        audioNode = delayInput; 
                        break;
                    case 'reverb':
                        const convolver = context.createConvolver();
                        const reverbWet = context.createGain();
                        reverbWet.gain.setValueAtTime(node.data.mix || 0.5, context.currentTime);

                        const reverbOutput = context.createGain();
                        const reverbInput = context.createGain();

                        const decayTime = node.data.decay || 3.0;
                        const preDelayTime = node.data.preDelay || 0.01;
                        const impulseLength = context.sampleRate * decayTime;
                        const preDelaySamples = context.sampleRate * preDelayTime;
                        const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
                        const impulseL = impulse.getChannelData(0);
                        const impulseR = impulse.getChannelData(1);

                        for (let i = 0; i < impulseLength; i++) {
                            if (i > preDelaySamples) {
                                const n = i - preDelaySamples;
                                impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / impulseLength, 2);
                                impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / impulseLength, 2);
                            }
                        }
                        convolver.buffer = impulse;

                        reverbInput.connect(reverbOutput);
                        reverbInput.connect(convolver);
                        convolver.connect(reverbWet);
                        reverbWet.connect(reverbOutput);
                        
                        complexAudioNodes.current.set(globalId, { input: reverbInput, output: reverbOutput });
                        audioNode = reverbInput;
                        break;
                    case 'distortion':
                        const drive = context.createGain();
                        drive.gain.setValueAtTime(node.data.drive || 20, context.currentTime);

                        const waveshaper = context.createWaveShaper();
                        const amount = node.data.drive || 20;
                        const k = typeof amount === 'number' ? amount : 20;
                        const n_samples = 44100;
                        const curve = new Float32Array(n_samples);
                        const deg = Math.PI / 180;
                        for (let i = 0; i < n_samples; ++i) {
                            const x = i * 2 / n_samples - 1;
                            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
                        }
                        waveshaper.curve = curve;
                        waveshaper.oversample = '4x';

                        const tone = context.createBiquadFilter();
                        tone.type = 'lowpass';
                        tone.frequency.setValueAtTime(node.data.tone || 4000, context.currentTime);
                        
                        const distortionWet = context.createGain();
                        distortionWet.gain.setValueAtTime(node.data.mix || 0.5, context.currentTime);
                        
                        const distortionDry = context.createGain();
                        distortionDry.gain.setValueAtTime(1.0 - (node.data.mix || 0.5), context.currentTime);

                        const distortionOutput = context.createGain();
                        const distortionInput = context.createGain();

                        distortionInput.connect(drive);
                        drive.connect(waveshaper);
                        waveshaper.connect(tone);
                        tone.connect(distortionWet);
                        distortionWet.connect(distortionOutput);
                        
                        distortionInput.connect(distortionDry);
                        distortionDry.connect(distortionOutput);

                        complexAudioNodes.current.set(globalId, { input: distortionInput, output: distortionOutput });
                        audioNode = distortionInput;
                        break;
                    case 'mixer':
                        const mixerOutput = context.createGain();
                        const inputs = [];
                        for (let i = 1; i <= (node.data.inputCount || 4); i++) {
                            const inputGain = context.createGain();
                            inputGain.gain.setValueAtTime(node.data[`level${i}`] || 0.75, context.currentTime);
                            inputGain.connect(mixerOutput);
                            inputs.push(inputGain);
                        }
                        mixerInputNodes.current.set(globalId, inputs);
                        audioNode = mixerOutput;
                        break;
                    case 'panner':
                        const panner = context.createStereoPanner();
                        panner.pan.setValueAtTime(node.data.pan || 0, context.currentTime);
                        audioNode = panner;
                        break;
                    case 'output': 
                        audioNode = context.destination;
                        break;
                    case 'InstrumentInput':
                    case 'InstrumentOutput':
                        audioNode = context.createGain();
                        break;
                    case 'group':
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

                let sourceAudioNode = allAudioNodes.get(sourceId);
                let targetAudioNode = allAudioNodes.get(targetId);

                if (complexAudioNodes.current.has(sourceId)) {
                    sourceAudioNode = complexAudioNodes.current.get(sourceId)!.output;
                }
                if (complexAudioNodes.current.has(targetId)) {
                    targetAudioNode = complexAudioNodes.current.get(targetId)!.input;
                } else if (mixerInputNodes.current.has(targetId) && edge.targetHandle) {
                    const inputIndex = parseInt(edge.targetHandle.replace('input_', ''), 10) - 1;
                    const mixerInputs = mixerInputNodes.current.get(targetId);
                    if (mixerInputs && mixerInputs[inputIndex]) {
                        targetAudioNode = mixerInputs[inputIndex];
                    }
                }

                if (sourceAudioNode && targetAudioNode) {
                    sourceAudioNode.connect(targetAudioNode);
                }
            });

            graphNodes.forEach(node => {
                if ((node.type === 'instrument' || node.type === 'group') && node.data.subgraph) {
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

            if (complexAudioNodes.current.has(sourceNode.id)) {
                finalSource = complexAudioNodes.current.get(sourceNode.id)!.output;
            } else if (sourceNode.type === 'instrument' || sourceNode.type === 'group') {
                const portName = edge.sourceHandle || 'output';
                const outputNode = sourceNode.data.subgraph.nodes.find(n => n.type === 'InstrumentOutput' && n.data.name === portName);
                finalSource = allAudioNodes.get(`${sourceNode.id}-${outputNode.id}`);
            } else {
                finalSource = allAudioNodes.get(sourceNode.id);
            }

            if (complexAudioNodes.current.has(targetNode.id)) {
                finalTarget = complexAudioNodes.current.get(targetNode.id)!.input;
            } else if (mixerInputNodes.current.has(targetNode.id) && edge.targetHandle) {
                const inputIndex = parseInt(edge.targetHandle.replace('input_', ''), 10) - 1;
                const mixerInputs = mixerInputNodes.current.get(targetNode.id);
                if (mixerInputs && mixerInputs[inputIndex]) {
                    finalTarget = mixerInputs[inputIndex];
                }
            } else if (targetNode.type === 'instrument' || targetNode.type === 'group') {
                const portName = edge.targetHandle || 'input';
                const inputNode = targetNode.data.subgraph.nodes.find(n => n.type === 'InstrumentInput' && n.data.name === portName);
                finalTarget = allAudioNodes.get(`${targetNode.id}-${inputNode.id}`);
            } else {
                const targetAudioNode = allAudioNodes.get(targetNode.id);

                if (['lfo', 'sampleHold'].includes(sourceNode.type) && edge.targetHandle && targetAudioNode) {
                    const paramName = edge.targetHandle.replace('input_', ''); 
                    
                    if (paramName === 'freq' && 'frequency' in targetAudioNode) {
                        finalTarget = (targetAudioNode as any)['frequency'];
                    } else if (paramName === 'amp' && 'gain' in targetAudioNode) {
                        finalTarget = (targetAudioNode as any)['gain'];
                    } else if (paramName === 'pan' && 'pan' in targetAudioNode) {
                        finalTarget = (targetAudioNode as any)['pan'];
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
            complexAudioNodes.current.clear();
            mixerInputNodes.current.clear();
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
    
    const handleCreateGroup = useCallback(() => {
        if (selectedNodesForGrouping.length <= 1) return;

        saveStateForUndo();

        const selectedIds = new Set(selectedNodesForGrouping.map(n => n.id));
        const newGroupId = `group-${getId()}`;
        
        const minX = Math.min(...selectedNodesForGrouping.map(n => n.position.x));
        const minY = Math.min(...selectedNodesForGrouping.map(n => n.position.y));
        const maxX = Math.max(...selectedNodesForGrouping.map(n => n.position.x + (n.width || 150)));
        const maxY = Math.max(...selectedNodesForGrouping.map(n => n.position.y + (n.height || 50)));

        const newGroupNode: Node = {
            id: newGroupId,
            type: 'group',
            position: { x: minX - 20, y: minY - 40 },
            data: { label: 'New Group' },
            style: { 
                width: maxX - minX + 40, 
                height: maxY - minY + 60,
                backgroundColor: 'rgba(45, 55, 72, 0.5)',
                borderColor: '#718096',
            }
        };

        const updatedNodes = nodes.map(n => {
            if (selectedIds.has(n.id)) {
                return { ...n, parentNode: newGroupId, extent: 'parent' };
            }
            return n;
        });

        setNodes([...updatedNodes, newGroupNode]);

    }, [nodes, selectedNodesForGrouping, saveStateForUndo]);


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
                    onCreateGroup={handleCreateGroup}
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
