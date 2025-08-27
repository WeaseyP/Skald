import { Node, Edge } from 'reactflow';
import { createAudioNode, connectNodes, convertBpmToSeconds } from './audioNodeUtils';
import type { AdsrDataMap } from './types';

export class Voice {
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
        this.subgraph.nodes.forEach(node => {
            const audioNode = createAudioNode(this.audioContext, node, this.adsrData);
            if (audioNode) {
                this.internalNodes.set(node.id, audioNode);
            }
        });

        this.subgraph.connections.forEach(edge => {
            const sourceNode = this.internalNodes.get(edge.source);
            const targetNode = this.internalNodes.get(edge.target);
            if (sourceNode && targetNode) {
                connectNodes(sourceNode, targetNode, edge);
            }
        });

        this.subgraph.nodes.filter(n => n.type === 'InstrumentInput').forEach(inputNode => {
            const internalInNode = this.internalNodes.get(inputNode.id);
            if (internalInNode) {
                this.input.connect(internalInNode);
            }
        });

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
        this.internalNodes.forEach(node => {
            try { node.disconnect(); } catch (e) { /* ignore */ }
        });
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