import { Node, Edge } from 'reactflow';
import { connectNodes } from './audioNodeUtils';
import type { AdsrDataMap } from './types';
import { nodeCreationMap } from './audioNodeFactory';

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
            console.log(`Voice trigger at ${startTime}`, data);
            const { attack = 0.01, decay = 0.1, sustain = 0.8 } = data;
            gainNode.gain.cancelScheduledValues(startTime);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + attack);
            gainNode.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
        });
    }

    public release(startTime: number) {
        this.adsrData.forEach(({ gainNode, data }) => {
            console.log(`Voice release at ${startTime}`, data);
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