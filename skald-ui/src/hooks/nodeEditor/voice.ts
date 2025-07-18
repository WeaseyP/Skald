// skald-ui/src/hooks/nodeEditor/voice.ts
import { Node, Edge } from 'reactflow';
import { createAudioNode, connectNodes, AudioNodeMap, AdsrDataMap } from './useAudioEngine'; // We will export these types from the main hook

export class Voice {
    private audioContext: AudioContext;
    private internalNodes: AudioNodeMap = new Map();
    private adsrData: AdsrDataMap = new Map();
    private output: GainNode;
    private subgraph: { nodes: Node[]; edges: Edge[] };

    constructor(context: AudioContext, subgraph: { nodes: Node[]; edges: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.output = this.audioContext.createGain();
        this.buildSubgraph();
    }

    private buildSubgraph() {
        // 1. Create all internal audio nodes
        this.subgraph.nodes.forEach(node => {
            const audioNode = createAudioNode(this.audioContext, node, this.adsrData);
            if (audioNode) {
                this.internalNodes.set(node.id, audioNode);
            }
        });

        // 2. Connect the internal nodes
        this.subgraph.edges.forEach(edge => {
            const sourceNode = this.internalNodes.get(edge.source);
            const targetNode = this.internalNodes.get(edge.target);
            if (sourceNode && targetNode) {
                connectNodes(sourceNode, targetNode, edge);
            }
        });

        // 3. Connect the final output of the subgraph to the voice's main output
        const outputNode = this.subgraph.nodes.find(n => n.type === 'output');
        if (outputNode) {
            const finalInternalNode = this.internalNodes.get(outputNode.id);
            if(finalInternalNode) {
                finalInternalNode.connect(this.output);
            }
        }
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

    public updateNodeData(nodeId: string, data: any) {
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
        } else if (nodeToUpdate instanceof GainNode && nodeDef.type === 'adsr') {
            const adsr = this.adsrData.get(nodeId);
            if (adsr) adsr.data = { ...adsr.data, ...data };
        }
    }
}