/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useAudioEngine.ts                        |
|                                                                              |
| This hook manages all the Web Audio API logic. It now uses a persistent      |
| audio graph that can be updated live and a sequencer for re-triggering ADSRs.|
================================================================================
*/
import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge, Connection } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';


// --- AUDIO WORKLET PROCESSORS (Strings remain unchanged) ---

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

// --- MAIN HOOK ---

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<Map<string, AudioNode>>(new Map());
    const adsrNodes = useRef<Map<string, { gainNode: GainNode, data: any }>>(new Map());
    const loopIntervalId = useRef<NodeJS.Timeout | null>(null);
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

    // --- HELPER FUNCTIONS ---
    const triggerAdsr = (gainNode: GainNode, data: any, startTime: number) => {
        const { attack = 0.1, decay = 0.2, sustain = 0.5 } = data;
        gainNode.gain.cancelScheduledValues(startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
        gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
    };

    const releaseAdsr = (gainNode: GainNode, data: any, startTime: number) => {
        const { release = 1.0 } = data;
        gainNode.gain.cancelScheduledValues(startTime);
        gainNode.gain.setTargetAtTime(0, startTime, release / 5 + 0.001);
    };

    const connectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
        try {
            if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
                const paramName = edge.targetHandle.substring(6);
                const param = targetNode.parameters.get(paramName);
                if(param) sourceNode.connect(param);
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
             if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
                const paramName = edge.targetHandle.substring(6);
                 const param = targetNode.parameters.get(paramName);
                if(param) sourceNode.disconnect(param);
            } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
                sourceNode.disconnect(targetNode[edge.targetHandle as keyof AudioNode]);
            } else {
                sourceNode.disconnect(targetNode);
            }
        } catch (e) {
            // Errors are expected here if a node was deleted, so we can ignore them.
        }
    };

    const createAudioNode = (context: AudioContext, node: Node): AudioNode | null => {
         let audioNode: AudioNode | null = null;
            switch (node.type) {
                case 'adsr':
                    const gainNode = context.createGain();
                    gainNode.gain.setValueAtTime(0, context.currentTime);
                    adsrNodes.current.set(node.id, { gainNode, data: node.data });
                    audioNode = gainNode;
                    break;
                case 'oscillator':
                    const osc = context.createOscillator();
                    osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
                    osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
                    osc.start();
                    audioNode = osc;
                    break;
                case 'noise':
                    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }
                    const noiseSource = context.createBufferSource();
                    noiseSource.buffer = buffer;
                    noiseSource.loop = true;
                    noiseSource.start();
                    audioNode = noiseSource;
                    break;
                case 'wavetable':
                    const wtNode = new AudioWorkletNode(context, 'wavetable-processor');
                    wtNode.parameters.get('frequency')?.setValueAtTime(node.data.frequency || 440, context.currentTime);
                    wtNode.parameters.get('position')?.setValueAtTime(node.data.position || 0, context.currentTime);
                    audioNode = wtNode;
                    break;
                case 'filter':
                    const filter = context.createBiquadFilter();
                    filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
                    filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
                    filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);
                    audioNode = filter;
                    break;
                case 'lfo':
                     const lfo = context.createOscillator();
                     lfo.type = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
                     lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
                     lfo.start();
                     const lfoGain = context.createGain();
                     lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
                     lfo.connect(lfoGain);
                     audioNode = lfoGain;
                     break;
                 case 'output':
                    audioNode = context.destination;
                    break;
                default:
                    audioNode = context.createGain();
                    break;
            }
        return audioNode;
    }

    // --- Sequencer Logic ---
    const sequencerTick = useCallback(() => {
        if (!audioContext.current || !isLooping) return;
        adsrNodes.current.forEach(({ gainNode, data }) => {
            triggerAdsr(gainNode, data, audioContext.current!.currentTime);
        });
    }, [isLooping]);

    const startSequencer = useCallback(() => {
        if (loopIntervalId.current) clearInterval(loopIntervalId.current);
        const loopDuration = (60 / bpm) * 4 * 1000; // 4 beats
        sequencerTick(); 
        loopIntervalId.current = setInterval(sequencerTick, loopDuration);
    }, [bpm, sequencerTick]);

    const stopSequencer = () => {
        if (loopIntervalId.current) {
            clearInterval(loopIntervalId.current);
            loopIntervalId.current = null;
        }
    };

    // --- Main Play/Stop Controls ---
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
        } catch (e) { console.error('Error loading AudioWorklet:', e); return; }

        nodes.forEach(node => {
            const audioNode = createAudioNode(context, node);
            if(audioNode) audioNodes.current.set(node.id, audioNode);
        });
        
        edges.forEach(edge => {
            const sourceNode = audioNodes.current.get(edge.source);
            const targetNode = audioNodes.current.get(edge.target);
            if(sourceNode && targetNode) connectNodes(sourceNode, targetNode, edge);
        });
        
        setIsPlaying(true);
    }, [nodes, edges]);

    const handleStop = useCallback(() => {
        stopSequencer();
        if (!isPlaying || !audioContext.current) return;
        
        audioContext.current.close().then(() => {
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            adsrNodes.current.clear();
        });
    }, [isPlaying]);

    // --- LIVE UPDATE ENGINE ---
    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) {
            prevGraphState.current = { nodes, edges };
            return;
        }
        
        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        // --- Node Diffing ---
        const prevNodeIds = new Set(prevNodes.map(n => n.id));
        const currentNodeIds = new Set(nodes.map(n => n.id));

        // Added nodes
        nodes.forEach(node => {
            if (!prevNodeIds.has(node.id)) {
                const newAudioNode = createAudioNode(context, node);
                if (newAudioNode) audioNodes.current.set(node.id, newAudioNode);
            }
        });

        // Removed nodes
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

        // --- Edge Diffing ---
        const prevEdgeIds = new Set(prevEdges.map(e => e.id));
        const currentEdgeIds = new Set(edges.map(e => e.id));

        // Added edges
        edges.forEach(edge => {
            if (!prevEdgeIds.has(edge.id)) {
                const sourceNode = audioNodes.current.get(edge.source);
                const targetNode = audioNodes.current.get(edge.target);
                if (sourceNode && targetNode) connectNodes(sourceNode, targetNode, edge);
            }
        });

        // Removed edges
        prevEdges.forEach(edge => {
            if (!currentEdgeIds.has(edge.id)) {
                const sourceNode = audioNodes.current.get(edge.source);
                const targetNode = audioNodes.current.get(edge.target);
                if (sourceNode && targetNode) disconnectNodes(sourceNode, targetNode, edge);
            }
        });


        // --- Parameter Updates ---
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            if (!liveNode) return;

            const now = context.currentTime;
            const rampTime = 0.02;

            if (liveNode instanceof OscillatorNode) {
                liveNode.frequency.setTargetAtTime(node.data.frequency, now, rampTime);
            } else if (liveNode instanceof BiquadFilterNode) {
                liveNode.frequency.setTargetAtTime(node.data.cutoff, now, rampTime);
                liveNode.Q.setTargetAtTime(node.data.resonance, now, rampTime);
            } else if (liveNode instanceof GainNode && node.type === 'adsr') {
                const adsr = adsrNodes.current.get(node.id);
                if (adsr) adsr.data = node.data;
            } else if (liveNode instanceof AudioWorkletNode) {
                if (node.type === 'wavetable') {
                    liveNode.parameters.get('frequency')?.setTargetAtTime(node.data.frequency, now, rampTime);
                    liveNode.parameters.get('position')?.setTargetAtTime(node.data.position, now, rampTime);
                }
            }
        });

        // Update the previous state for the next render
        prevGraphState.current = { nodes, edges };

    }, [nodes, edges, isPlaying]);


    useEffect(() => {
        if (isPlaying && isLooping) {
            startSequencer();
        } else {
            stopSequencer();
        }
    }, [isPlaying, isLooping, startSequencer]);

    useEffect(() => {
        return () => { if (isPlaying) handleStop(); };
    }, [isPlaying, handleStop]);

    return { isPlaying, handlePlay, handleStop };
};
