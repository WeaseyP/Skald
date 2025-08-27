import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge, Connection } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';

// =================================================================================
// SECTION A: FORWARD-DECLARED TYPES & AUDIO WORKLETS
// =================================================================================

type AdsrDataMap = Map<string, { gainNode: GainNode; data: any }>;

// These string definitions remain unchanged.
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

const wavetableProcessorString = `
class WavetableProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
            { name: 'position', defaultValue: 0, minValue: 0, maxValue: 3 },
        ];
    }
    constructor(options) {
        super(options);
        this.phase = 0;
        this.tables = this.createTables();
    }
    createTables() {
        const size = 2048;
        const sine = new Float32Array(size);
        const triangle = new Float32Array(size);
        const sawtooth = new Float32Array(size);
        const square = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const angle = (i / size) * 2 * Math.PI;
            sine[i] = Math.sin(angle);
            triangle[i] = (Math.abs((i / size) * 4 - 2) - 1);
            sawtooth[i] = (i / size) * 2 - 1;
            square[i] = (i < size / 2) ? 1 : -1;
        }
        return [sine, triangle, sawtooth, square];
    }
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const frequency = parameters.frequency;
        const position = parameters.position;
        for (let channel = 0; channel < output.length; ++channel) {
            const outputChannel = output[channel];
            for (let i = 0; i < outputChannel.length; ++i) {
                const freq = frequency.length > 1 ? frequency[i] : frequency[0];
                const pos = position.length > 1 ? position[i] : position[0];
                const tableIndex = Math.floor(pos);
                const nextTableIndex = (tableIndex + 1) % this.tables.length;
                const tableFraction = pos - tableIndex;
                const table1 = this.tables[tableIndex];
                const table2 = this.tables[nextTableIndex];
                const readIndex = (this.phase * table1.length);
                const readIndexInt = Math.floor(readIndex);
                const readIndexFrac = readIndex - readIndexInt;
                const v1_1 = table1[readIndexInt % table1.length];
                const v1_2 = table1[(readIndexInt + 1) % table1.length];
                const sample1 = v1_1 + (v1_2 - v1_1) * readIndexFrac;
                const v2_1 = table2[readIndexInt % table2.length];
                const v2_2 = table2[(readIndexInt + 1) % table2.length];
                const sample2 = v2_1 + (v2_2 - v2_1) * readIndexFrac;
                outputChannel[i] = sample1 + (sample2 - sample1) * tableFraction;
                this.phase += freq / sampleRate;
                if (this.phase > 1) this.phase -= 1;
            }
        }
        return true;
    }
}
registerProcessor('wavetable-processor', WavetableProcessor);
`;

// =================================================================================
// SECTION B: HELPER FUNCTIONS
// =================================================================================

const connectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        if (targetNode.hasOwnProperty('inputGains') && edge.targetHandle && edge.targetHandle.startsWith('input_')) {
            const context = targetNode.context as AudioContext;
            let inputGain = targetNode.inputGains.get(edge.targetHandle);
            if (!inputGain) {
                inputGain = context.createGain();
                inputGain.connect(targetNode); // Connect to mixer's main output
                targetNode.inputGains.set(edge.targetHandle, inputGain);
            }
            sourceNode.connect(inputGain);
        } else if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
            const paramName = edge.targetHandle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) sourceNode.connect(param);
        } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
            sourceNode.connect(targetNode[edge.targetHandle as keyof AudioNode]);
        } else {
            sourceNode.connect(targetNode);
        }
    } catch (e) {
        console.error(`Failed to connect ${edge.source} to ${edge.target}`, e);
    }
};

const disconnectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        if (targetNode.hasOwnProperty('inputGains') && edge.targetHandle && edge.targetHandle.startsWith('input_')) {
            const inputGain = targetNode.inputGains.get(edge.targetHandle);
            if (inputGain) {
                sourceNode.disconnect(inputGain);
            }
        } else if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
            const paramName = edge.targetHandle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) sourceNode.disconnect(param);
        } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
            sourceNode.disconnect(targetNode[edge.targetHandle as keyof AudioNode]);
        } else {
            sourceNode.disconnect(targetNode);
        }
    } catch (e) {
        // Errors are expected here if a node was deleted, so we can ignore them.
    }
};

const noteDivisionMap: { [key: string]: number } = {
    '1': 4,    // Whole Note
    '2': 2,    // Half Note
    '4': 1,    // Quarter Note
    '8': 0.5,  // 8th Note
    '16': 0.25, // 16th Note
    '32': 0.125,// 32nd Note
};

const convertBpmToSeconds = (bpm: number, division: string): number => {
    if (bpm === 0) return 0;
    const quarterNoteTime = 60 / bpm;
    
    let timeMultiplier = 1;
    let noteValue = division;

    if (noteValue.endsWith('t')) { // Triplet
        timeMultiplier = 2 / 3;
        noteValue = noteValue.slice(0, -1);
    } else if (noteValue.endsWith('d')) { // Dotted
        timeMultiplier = 1.5;
        noteValue = noteValue.slice(0, -1);
    }
    
    const baseNoteKey = noteValue.startsWith('1/') ? noteValue.substring(2) : noteValue;
    const beatMultiplier = noteDivisionMap[baseNoteKey];

    if (beatMultiplier === undefined) {
        console.warn(`Unknown note division: ${division}, falling back to 1/4.`);
        return quarterNoteTime;
    }

    return quarterNoteTime * beatMultiplier * timeMultiplier;
};

const createAudioNode = (context: AudioContext, node: Node, adsrDataMap: AdsrDataMap): AudioNode | null => {
    let audioNode: AudioNode | null = null;
    switch (node.type) {
        case 'adsr': {
            const gainNode = context.createGain();
            gainNode.gain.setValueAtTime(0, context.currentTime);
            adsrDataMap.set(node.id, { gainNode, data: node.data });
            audioNode = gainNode;
            break;
        }
        case 'oscillator': {
            const osc = context.createOscillator();
            osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
            osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
            osc.start();
            audioNode = osc;
            break;
        }
        case 'noise': {
            const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }
            const noiseSource = context.createBufferSource();
            noiseSource.buffer = buffer;
            noiseSource.loop = true;
            noiseSource.start();
            audioNode = noiseSource;
            break;
        }
        case 'sample-hold': {
            const shNode = new AudioWorkletNode(context, 'sample-hold-processor');
            shNode.parameters.get('rate')?.setValueAtTime(node.data.rate ?? 10.0, context.currentTime);
            audioNode = shNode;
            break;
        }
        case 'wavetable': {
            const wtNode = new AudioWorkletNode(context, 'wavetable-processor');
            wtNode.parameters.get('frequency')?.setValueAtTime(node.data.frequency || 440, context.currentTime);
            wtNode.parameters.get('position')?.setValueAtTime(node.data.position || 0, context.currentTime);
            audioNode = wtNode;
            break;
        }
        case 'filter': {
            const filter = context.createBiquadFilter();
            filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
            filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
            filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);
            audioNode = filter;
            break;
        }
        case 'lfo': {
            const lfo = context.createOscillator();
            lfo.type = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
            lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
            lfo.start();
            const lfoGain = context.createGain();
            lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
            lfo.connect(lfoGain);

            const compositeNode = lfoGain as any;
            compositeNode.internalNodes = {
                lfo: lfo
            };
            audioNode = compositeNode;
            break;
        }
        case 'delay': {
            const inputNode = context.createGain();
            const outputNode = context.createGain();
            const delayNode = context.createDelay(5.0);
            const feedbackNode = context.createGain();
            const wetGain = context.createGain();
            const dryGain = context.createGain();

            const { delayTime = 0.5, feedback = 0.5, mix = 0.5 } = node.data;

            delayNode.delayTime.setValueAtTime(delayTime, context.currentTime);
            feedbackNode.gain.setValueAtTime(feedback, context.currentTime);
            wetGain.gain.setValueAtTime(mix, context.currentTime);
            dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

            inputNode.connect(dryGain);
            dryGain.connect(outputNode);

            inputNode.connect(delayNode);
            inputNode.connect(delayNode);
            delayNode.connect(feedbackNode);
            feedbackNode.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(outputNode);


            const compositeNode = inputNode as any;
            compositeNode.output = outputNode;
            compositeNode.internalNodes = {
                delay: delayNode,
                feedback: feedbackNode,
                wet: wetGain,
                dry: dryGain,
            };
            audioNode = compositeNode;
            break;
        }
        case 'fmOperator': {
            const carrier = context.createOscillator();
            carrier.frequency.setValueAtTime(node.data.frequency ?? 440, context.currentTime);

            const modulator = context.createOscillator();
            modulator.frequency.setValueAtTime(node.data.modulatorFrequency ?? 440, context.currentTime);

            const modulationIndex = context.createGain();
            modulationIndex.gain.setValueAtTime(node.data.modulationIndex ?? 100, context.currentTime);

            modulator.connect(modulationIndex);
            modulationIndex.connect(carrier.frequency);

            const outputGain = context.createGain();
            carrier.connect(outputGain);
            
            carrier.start();
            modulator.start();

            const compositeNode = outputGain as any;
            compositeNode.internalNodes = {
                carrier: carrier,
                modulator: modulator,
                modulationIndex: modulationIndex,
            };
            audioNode = compositeNode;
            break;
        }
        case 'distortion': {
            const shaper = context.createWaveShaper();
            const drive = node.data.drive ?? 1;
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = i * 2 / 256 - 1;
                curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
            }
            shaper.curve = curve;
            audioNode = shaper;
            break;
        }
        case 'panner': {
            const panner = context.createStereoPanner();
            panner.pan.setValueAtTime(node.data.pan ?? 0, context.currentTime);
            audioNode = panner;
            break;
        }
        case 'reverb': {
            const inputNode = context.createGain();
            const outputNode = context.createGain();
            const convolver = context.createConvolver();
            const wetGain = context.createGain();
            const dryGain = context.createGain();

            const mix = node.data.mix ?? 0.5;
            wetGain.gain.setValueAtTime(mix, context.currentTime);
            dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

            // Generate a simple impulse response
            const sampleRate = context.sampleRate;
            const length = sampleRate * 2;
            const impulse = context.createBuffer(2, length, sampleRate);
            const impulseL = impulse.getChannelData(0);
            const impulseR = impulse.getChannelData(1);

            for (let i = 0; i < length; i++) {
                const n = (Math.random() * 2 - 1);
                impulseL[i] = n * Math.pow(1 - i / length, 2);
                impulseR[i] = n * Math.pow(1 - i / length, 2);
            }

            convolver.buffer = impulse;

            inputNode.connect(dryGain);
            dryGain.connect(outputNode);

            inputNode.connect(convolver);
            convolver.connect(wetGain);
            wetGain.connect(outputNode);

            const compositeNode = inputNode as any;
            compositeNode.output = outputNode;
            compositeNode.internalNodes = {
                convolver: convolver,
                wet: wetGain,
                dry: dryGain,
            };
            audioNode = compositeNode;
            break;
        }
        case 'mixer': {
            const outputNode = context.createGain();
            outputNode.gain.setValueAtTime(node.data.gain ?? 1.0, context.currentTime);
            const compositeNode = outputNode as any;
            compositeNode.inputGains = new Map<string, GainNode>();
            audioNode = compositeNode;
            break;
        }
        case 'output': {
            const outputGain = context.createGain();
            outputGain.connect(context.destination);
            audioNode = outputGain;
            break;
        }
        case 'InstrumentInput': {
             const inputGain = context.createGain();
             audioNode = inputGain;
             break;
        }
         case 'InstrumentOutput': {
             const outputGain = context.createGain();
             audioNode = outputGain;
             break;
        }
        default:
            audioNode = context.createGain();
            break;
    }
    return audioNode;
}

// =================================================================================
// SECTION C: COMPOSITE NODE CLASSES (INSTRUMENT & VOICE)
// =================================================================================

class Voice {
    private audioContext: AudioContext;
    private internalNodes: Map<string, AudioNode> = new Map();
    private adsrData: AdsrDataMap = new Map();
    public output: GainNode;
    private subgraph: { nodes: Node[]; connections: Edge[] };
    public input: GainNode;

    constructor(context: AudioContext, subgraph: { nodes: Node[]; connections: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.input = context.createGain();
        this.output = context.createGain();
        this.buildSubgraph();
    }

    private buildSubgraph() {
        // Create all internal audio nodes
        this.subgraph.nodes.forEach(node => {
            const audioNode = createAudioNode(this.audioContext, node, this.adsrData);
            if (audioNode) {
                this.internalNodes.set(node.id, audioNode);
            }
        });

        // Connect the internal nodes
        this.subgraph.connections.forEach(edge => {
            const sourceNode = this.internalNodes.get(edge.source);
            const targetNode = this.internalNodes.get(edge.target);
            if (sourceNode && targetNode) {
                connectNodes(sourceNode, targetNode, edge);
            }
        });

        // Connect the special 'InstrumentInput' to the voice's main input
        this.subgraph.nodes.filter(n => n.type === 'InstrumentInput').forEach(inputNode => {
            const internalInNode = this.internalNodes.get(inputNode.id);
            if (internalInNode) {
                this.input.connect(internalInNode);
            }
        });

        // Connect the final output of the subgraph to the voice's main output
        this.subgraph.nodes.filter(n => n.type === 'InstrumentOutput').forEach(outputNode => {
             const internalOutNode = this.internalNodes.get(outputNode.id);
             if (internalOutNode) {
                 internalOutNode.connect(this.output);
             }
        });
    }

    public trigger(startTime: number) {
        this.adsrData.forEach(({ gainNode, data }) => {
            const { attack = 0.01, decay = 0.1, sustain = 0.8 } = data;
            gainNode.gain.cancelScheduledValues(startTime);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
            gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
        });
    }

    public release(startTime: number) {
        this.adsrData.forEach(({ gainNode, data }) => {
            const { release = 0.5 } = data;
            const currentGain = gainNode.gain.value;
            gainNode.gain.cancelScheduledValues(startTime);
            gainNode.gain.setValueAtTime(currentGain, startTime);
            gainNode.gain.linearRampToValueAtTime(0, startTime + release);
        });
    }
    
    public connect(destination: AudioNode | AudioParam) {
        this.output.connect(destination);
    }
    
    public disconnect() {
        this.output.disconnect();
        this.internalNodes.forEach(node => node.disconnect());
    }

    public updateNodeData(nodeId: string, data: any, bpm: number) {
        const nodeToUpdate = this.internalNodes.get(nodeId);
        const nodeDef = this.subgraph.nodes.find(n => n.id === nodeId);
        if (!nodeToUpdate || !nodeDef) return;

        const now = this.audioContext.currentTime;
        const rampTime = 0.02;

        if (nodeToUpdate instanceof OscillatorNode) {
            if (data.frequency !== undefined) nodeToUpdate.frequency.setTargetAtTime(data.frequency, now, rampTime);
        } else if (nodeToUpdate instanceof BiquadFilterNode) {
            if (data.cutoff !== undefined) nodeToUpdate.frequency.setTargetAtTime(data.cutoff, now, rampTime);
            if (data.resonance !== undefined) nodeToUpdate.Q.setTargetAtTime(data.resonance, now, rampTime);
        } else if (nodeToUpdate instanceof GainNode && nodeDef.type === 'lfo') {
            const compositeNode = nodeToUpdate as any;
            if (!compositeNode.internalNodes) return;
            const { lfo } = compositeNode.internalNodes;
    
            if (data.sync) {
                const timeInSeconds = convertBpmToSeconds(bpm, data.noteDivision || '1/4');
                const frequency = timeInSeconds > 0 ? 1 / timeInSeconds : 0;
                lfo.frequency.setTargetAtTime(frequency, now, rampTime);
            } else {
                if (data.frequency !== undefined) lfo.frequency.setTargetAtTime(data.frequency, now, rampTime);
            }
            
            if (data.amplitude !== undefined) nodeToUpdate.gain.setTargetAtTime(data.amplitude, now, rampTime);
        } else if (nodeToUpdate instanceof GainNode && nodeDef.type === 'adsr') {
             if (data.amplitude !== undefined) nodeToUpdate.gain.setTargetAtTime(data.amplitude, now, rampTime);
             const adsr = this.adsrData.get(nodeId);
             if (adsr) adsr.data = { ...adsr.data, ...data };
        } else if (nodeToUpdate instanceof AudioWorkletNode) {
            if (nodeDef.type === 'wavetable') {
                 if(data.frequency !== undefined) nodeToUpdate.parameters.get('frequency')?.setTargetAtTime(data.frequency, now, rampTime);
                 if(data.position !== undefined) nodeToUpdate.parameters.get('position')?.setTargetAtTime(data.position, now, rampTime);
            } else if (nodeDef.type === 'sample-hold') {
                if (data.rate !== undefined) {
                    nodeToUpdate.parameters.get('rate')?.setTargetAtTime(data.rate, now, rampTime);
                }
            }
        } else if (nodeDef.type === 'delay') {
            const compositeNode = nodeToUpdate as any;
            if (!compositeNode.internalNodes) return;
            const { delay, feedback, wet, dry } = compositeNode.internalNodes;

            if (data.sync) {
                const timeInSeconds = convertBpmToSeconds(bpm, data.noteDivision || '1/8');
                delay.delayTime.setTargetAtTime(timeInSeconds, now, rampTime);
            } else {
                if (data.delayTime !== undefined) delay.delayTime.setTargetAtTime(data.delayTime, now, rampTime);
            }

            if (data.feedback !== undefined) feedback.gain.setTargetAtTime(data.feedback, now, rampTime);
            if (data.mix !== undefined) {
                wet.gain.setTargetAtTime(data.mix, now, rampTime);
                dry.gain.setTargetAtTime(1.0 - data.mix, now, rampTime);
            }
        } else if (nodeToUpdate instanceof WaveShaperNode && nodeDef.type === 'distortion') {
            if (data.drive !== undefined) {
                const curve = new Float32Array(256);
                const drive = data.drive;
                for (let i = 0; i < 256; i++) {
                    const x = i * 2 / 256 - 1;
                    curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
                }
                nodeToUpdate.curve = curve;
            }
        } else if (nodeToUpdate instanceof StereoPannerNode && nodeDef.type === 'panner') {
            if (data.pan !== undefined) {
                nodeToUpdate.pan.setTargetAtTime(data.pan, now, rampTime);
            }
        } else if (nodeDef.type === 'reverb') {
            const compositeNode = nodeToUpdate as any;
            if (!compositeNode.internalNodes) return;
            const { wet, dry } = compositeNode.internalNodes;
            if (data.mix !== undefined) {
                wet.gain.setTargetAtTime(data.mix, now, rampTime);
                dry.gain.setTargetAtTime(1.0 - data.mix, now, rampTime);
            }
        } else if (nodeDef.type === 'mixer') {
            const compositeNode = nodeToUpdate as any;
            if (!compositeNode.inputGains) return;

            if (data.gain !== undefined) {
                compositeNode.gain.setTargetAtTime(data.gain, now, rampTime);
            }

            for (const key in data) {
                if (key.startsWith('input_') && key.endsWith('_gain')) {
                    const handle = key.substring(0, key.length - 5);
                    const inputGainNode = compositeNode.inputGains.get(handle);
                    if (inputGainNode) {
                        inputGainNode.gain.setTargetAtTime(data[key], now, rampTime);
                    }
                }
            }
        } else if (nodeDef.type === 'fmOperator') {
            const compositeNode = nodeToUpdate as any;
            if (!compositeNode.internalNodes) return;
            const { carrier, modulator, modulationIndex } = compositeNode.internalNodes;

            if (data.frequency !== undefined) carrier.frequency.setTargetAtTime(data.frequency, now, rampTime);
            if (data.modulatorFrequency !== undefined) modulator.frequency.setTargetAtTime(data.modulatorFrequency, now, rampTime);
            if (data.modulationIndex !== undefined) modulationIndex.gain.setTargetAtTime(data.modulationIndex, now, rampTime);
            if (data.gain !== undefined) compositeNode.gain.setTargetAtTime(data.gain, now, rampTime);
        }
    }
}

class Instrument {
    public input: GainNode;
    public output: GainNode;
    private context: AudioContext;
    private voices: Voice[] = [];
    private nextVoiceIndex = 0;

    constructor(context: AudioContext, node: Node) {
        this.context = context;
        this.input = context.createGain();
        this.output = context.createGain();

        const { voiceCount = 8, subgraph } = node.data;
        if (!subgraph || !subgraph.nodes || !subgraph.connections) {
            console.error("Instrument node is missing a valid subgraph.", node);
            return;
        }

        const reactFlowEdges: Edge[] = subgraph.connections.map((c: any) => ({
            id: `e${c.from_node}-${c.to_node}`,
            source: String(c.from_node),
            target: String(c.to_node),
            sourceHandle: c.from_port,
            targetHandle: c.to_port,
        }));
        const fullSubgraph = { nodes: subgraph.nodes, connections: reactFlowEdges };

        for (let i = 0; i < voiceCount; i++) {
            const voice = new Voice(context, fullSubgraph);
            this.input.connect(voice.input); // Connect master input to each voice
            voice.connect(this.output);
            this.voices.push(voice);
        }
    }
    
    public trigger() {
        const voice = this.voices[this.nextVoiceIndex];
        if (voice) {
            voice.trigger(this.context.currentTime);
        }
        this.nextVoiceIndex = (this.nextVoiceIndex + 1) % this.voices.length;
    }

    public connect(destination: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number) {
        this.output.connect(destination, outputIndex, inputIndex);
    }
    
    public disconnect() {
        this.output.disconnect();
        this.voices.forEach(v => v.disconnect());
    }

    public updateNodeData(data: any, bpm: number) {
        this.voices.forEach(voice => {
            if(data.subgraph && data.subgraph.nodes) {
                data.subgraph.nodes.forEach((subNode: Node) => {
                    voice.updateNodeData(subNode.id, subNode.data, bpm);
                });
            }
        });
    }
}


// =================================================================================
// SECTION D: MAIN AUDIO ENGINE HOOK
// =================================================================================

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<Map<string, AudioNode | Instrument>>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const loopIntervalId = useRef<NodeJS.Timeout | null>(null);
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

    const triggerAdsr = (gainNode: GainNode, data: any, startTime: number) => {
        const { attack = 0.1, decay = 0.2, sustain = 0.5 } = data;
        gainNode.gain.cancelScheduledValues(startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
    };
    
    const startSequencer = useCallback(() => {
        if (loopIntervalId.current) clearInterval(loopIntervalId.current);
        const loopDuration = (60 / bpm) * 4 * 1000; // 4 beats

        const tick = () => {
            if (!audioContext.current) return;
            const now = audioContext.current.currentTime;
            
            // Trigger global (non-instrument) ADSRs
            adsrNodes.current.forEach(({ gainNode, data }) => {
                triggerAdsr(gainNode, data, now);
            });

            // Trigger all instruments
            audioNodes.current.forEach(node => {
                if (node instanceof Instrument) {
                    node.trigger();
                }
            });
        };
        
        tick(); // Trigger immediately
        loopIntervalId.current = setInterval(tick, loopDuration);
    }, [bpm]);

    const stopSequencer = () => {
        if (loopIntervalId.current) {
            clearInterval(loopIntervalId.current);
            loopIntervalId.current = null;
        }
    };

    const handlePlay = useCallback(async () => {
        if (isPlaying) return;
        const context = new AudioContext();
        audioContext.current = context;
        try {
            const sampleHoldBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const wavetableBlob = new Blob([wavetableProcessorString], { type: 'application/javascript' });
            await Promise.all([
                context.audioWorklet.addModule(URL.createObjectURL(sampleHoldBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(wavetableBlob))
            ]);
            setIsPlaying(true);
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
            audioContext.current = null;
        }
    }, [isPlaying]);

    const handleStop = useCallback(() => {
        stopSequencer();
        if (!isPlaying || !audioContext.current) return;
        audioContext.current.close().then(() => {
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            adsrNodes.current.clear();
            prevGraphState.current = { nodes: [], edges: [] };
        });
    }, [isPlaying]);

    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;
        
        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        const prevNodeIds = new Set(prevNodes.map(n => n.id));
        const currentNodeIds = new Set(nodes.map(n => n.id));

        prevNodes.forEach(node => {
            if (!currentNodeIds.has(node.id)) {
                const audioNode = audioNodes.current.get(node.id);
                if (audioNode) {
                    audioNode.disconnect();
                    audioNodes.current.delete(node.id);
                    if (node.type === 'adsr') adsrNodes.current.delete(node.id);
                }
            }
        });

        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            if (!liveNode) {
                let newAudioNode: AudioNode | Instrument | null = null;
                if (node.type === 'instrument') {
                    newAudioNode = new Instrument(context, node);
                } else {
                    newAudioNode = createAudioNode(context, node, adsrNodes.current);
                }
                if (newAudioNode) audioNodes.current.set(node.id, newAudioNode);
            } else {
                const now = context.currentTime;
                const rampTime = 0.02;

                if (liveNode instanceof Instrument) {
                    liveNode.updateNodeData(node.data, bpm);
                } else if (liveNode instanceof OscillatorNode) {
                    liveNode.frequency.setTargetAtTime(node.data.frequency, now, rampTime);
                } else if (liveNode instanceof BiquadFilterNode) {
                    liveNode.frequency.setTargetAtTime(node.data.cutoff, now, rampTime);
                    liveNode.Q.setTargetAtTime(node.data.resonance, now, rampTime);
                } else if (node.type === 'reverb') {
                    const compositeNode = liveNode as any;
                    if (compositeNode.internalNodes && node.data.mix !== undefined) {
                        const { wet, dry } = compositeNode.internalNodes;
                        wet.gain.setTargetAtTime(node.data.mix, now, rampTime);
                        dry.gain.setTargetAtTime(1.0 - node.data.mix, now, rampTime);
                    }
                } else if (liveNode instanceof GainNode && (node.type === 'adsr' || node.type === 'lfo')) {
                    if (node.data.amplitude !== undefined) liveNode.gain.setTargetAtTime(node.data.amplitude, now, rampTime);
                    const adsr = adsrNodes.current.get(node.id);
                    if (adsr) adsr.data = node.data;
                } else if (liveNode instanceof AudioWorkletNode) {
                    if (node.type === 'wavetable') {
                        liveNode.parameters.get('frequency')?.setTargetAtTime(node.data.frequency, now, rampTime);
                        liveNode.parameters.get('position')?.setTargetAtTime(node.data.position, now, rampTime);
                    }
                }
                else { 
                    const compositeNode = liveNode as any;
                    if (!compositeNode.internalNodes) return;

                    if (node.type === 'delay') {
                        const { delay, feedback, wet, dry } = compositeNode.internalNodes;
                        if (node.data.sync) {
                            const timeInSeconds = convertBpmToSeconds(bpm, node.data.noteDivision || '1/8');
                            delay.delayTime.setTargetAtTime(timeInSeconds, now, rampTime);
                        } else {
                            if (node.data.delayTime !== undefined) delay.delayTime.setTargetAtTime(node.data.delayTime, now, rampTime);
                        }
                        if (node.data.feedback !== undefined) feedback.gain.setTargetAtTime(node.data.feedback, now, rampTime);
                        if (node.data.mix !== undefined) {
                            wet.gain.setTargetAtTime(node.data.mix, now, rampTime);
                            dry.gain.setTargetAtTime(1.0 - node.data.mix, now, rampTime);
                        }
                    } else if (node.type === 'reverb') {
                        const { wet, dry } = compositeNode.internalNodes;
                        if (node.data.mix !== undefined) {
                            wet.gain.setTargetAtTime(node.data.mix, now, rampTime);
                            dry.gain.setTargetAtTime(1.0 - node.data.mix, now, rampTime);
                        }
                    } else if (node.type === 'fmOperator') {
                        const { carrier, modulator, modulationIndex } = compositeNode.internalNodes;
                        if (node.data.frequency !== undefined) carrier.frequency.setTargetAtTime(node.data.frequency, now, rampTime);
                        if (node.data.modulatorFrequency !== undefined) modulator.frequency.setTargetAtTime(node.data.modulatorFrequency, now, rampTime);
                        if (node.data.modulationIndex !== undefined) modulationIndex.gain.setTargetAtTime(node.data.modulationIndex, now, rampTime);
                        if (node.data.gain !== undefined) compositeNode.gain.setTargetAtTime(node.data.gain, now, rampTime);
                    }
                }
            }
        });

        const prevEdgeIds = new Set(prevEdges.map(e => e.id));
        const currentEdgeIds = new Set(edges.map(e => e.id));

        prevEdges.forEach(edge => {
            if (!currentEdgeIds.has(edge.id)) {
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;
                    const targetNode = target instanceof Instrument ? target.input : target;
                    disconnectNodes(sourceNode, targetNode, edge);
                }
            }
        });

        edges.forEach(edge => {
            if (!prevEdgeIds.has(edge.id)) {
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;
                    const targetNode = target instanceof Instrument ? target.input : target;
                    connectNodes(sourceNode, targetNode, edge);
                }
            }
        });

        prevGraphState.current = { nodes, edges };

    }, [nodes, edges, isPlaying]);

    useEffect(() => {
        if (isPlaying && isLooping) {
            startSequencer();
        } else {
            stopSequencer();
        }
        return stopSequencer;
    }, [isPlaying, isLooping, bpm, startSequencer]);

    useEffect(() => {
        return () => { if (audioContext.current) handleStop(); };
    }, [handleStop]);

    return { isPlaying, handlePlay, handleStop };
};