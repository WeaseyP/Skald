import { Node, Edge } from 'reactflow';
import { connectNodes } from './audioNodeUtils';
import type { AdsrDataMap } from './types';
import { nodeCreationMap } from './audioNodeFactory';
import { Logger } from '../../utils/Logger';

export class Voice {
    private audioContext: AudioContext;
    private internalNodes: Map<string, AudioNode> = new Map();
    private adsrData: AdsrDataMap = new Map();
    public output: GainNode;
    private subgraph: { nodes: Node[]; connections: Edge[] };
    public input: GainNode;
    private debugAnalysers: Map<string, AnalyserNode> = new Map();
    private pollInterval: any = null;

    constructor(context: AudioContext, subgraph: { nodes: Node[]; connections: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.input = context.createGain();
        this.output = context.createGain();
        Logger.log(`Voice: Creating new voice instance`);
        this.buildSubgraph();
        this.startDebugPolling();
    }

    private buildSubgraph() {
        this.subgraph.nodes.forEach(node => {
            let audioNode: AudioNode | null = null;
            if (node.type && nodeCreationMap[node.type]) {
                const creator = nodeCreationMap[node.type as keyof typeof nodeCreationMap] as Function;
                audioNode = creator(this.audioContext, node, this.adsrData);
            } else {
                const creator = nodeCreationMap['default'] as Function;
                audioNode = creator(this.audioContext, node, this.adsrData);
            }
            if (audioNode) {
                this.internalNodes.set(node.id, audioNode);
            }
        });

        // Instrument ADSR Debugging
        this.adsrData.forEach(({ gainNode }, id) => {
             // Create an analyzer for each ADSR envelope to monitor its output
             const analyser = this.audioContext.createAnalyser();
             analyser.fftSize = 32; // Small size for simple level detection
             gainNode.connect(analyser);
             this.debugAnalysers.set(id, analyser);
             Logger.log(`Voice: Attached debug analyzer to ADSR ${id}`);
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

    private startDebugPolling() {
        this.pollInterval = setInterval(() => {
            this.debugAnalysers.forEach((analyser, id) => {
                const data = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatTimeDomainData(data);

                // Calculate RMS or Peak to represent current level
                let sum = 0;
                for(let i = 0; i < data.length; i++) {
                    sum += data[i] * data[i];
                }
                const rms = Math.sqrt(sum / data.length);

                // Only log if there's significant signal or it's recently changed (optimization to avoid spamming 0s)
                // For now, adhering to user request for throttled logging:
                Logger.logThrottled(`voice-adsr-${id}`, `Voice ADSR ${id} Output Level: ${rms.toFixed(4)}`, 500);
            });
        }, 100); // Check every 100ms, but Logger.logThrottled limits output to 500ms
    }

    public trigger(startTime: number) {
        Logger.log(`Voice: Triggering at ${startTime}`);
        this.adsrData.forEach(({ gainNode, data }, id) => {
            const { attack = 0.01, decay = 0.1, sustain = 0.8 } = data;
            Logger.log(`Voice: ADSR ${id} Attack=${attack}, Decay=${decay}, Sustain=${sustain}`);
            gainNode.gain.cancelScheduledValues(startTime);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
            gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
        });
    }

    public release(startTime: number) {
        Logger.log(`Voice: Releasing at ${startTime}`);
        this.adsrData.forEach(({ gainNode, data }, id) => {
            const { release = 0.5 } = data;
            // Note: gain.value reads the current base value, not the computed value at time.
            // But it's the best we have without the analyzer which is async.
            const currentGain = gainNode.gain.value;
            Logger.log(`Voice: ADSR ${id} Release=${release}, CurrentBaseGain=${currentGain}`);

            gainNode.gain.cancelScheduledValues(startTime);
            gainNode.gain.setValueAtTime(currentGain, startTime);
            gainNode.gain.linearRampToValueAtTime(0, startTime + release);
        });
    }
    
    public connect(destination: AudioNode | AudioParam) {
        this.output.connect(destination);
    }
    
    public disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        this.debugAnalysers.forEach(a => a.disconnect());
        this.debugAnalysers.clear();
        Logger.log(`Voice: Disconnecting`);
        this.output.disconnect();
        this.internalNodes.forEach(node => {
            try { node.disconnect(); } catch (e) { /* ignore */ }
        });
    }

    public updateNodeData(nodeId: string, data: any) {
        const liveNode = this.internalNodes.get(nodeId);

        if (liveNode) {
            const skaldNode = (liveNode as any)._skaldNode;
            if (skaldNode && typeof skaldNode.update === 'function') {
                skaldNode.update(data);
            }
        }
    }
}