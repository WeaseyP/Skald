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
    private gateSource: ConstantSourceNode;

    constructor(context: AudioContext, subgraph: { nodes: Node[]; connections: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.input = context.createGain();
        this.output = context.createGain();

        // Create a central Gate signal for this voice
        this.gateSource = context.createConstantSource();
        this.gateSource.offset.setValueAtTime(0, context.currentTime); // Use setValueAtTime for immediate effect
        this.gateSource.start();

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

        // Loop through all registered ADSR worklets and connect the Voice Gate to them
        this.adsrData.forEach(({ worklet }) => {
            // The ADSR Worklet expects the Gate signal on input 0.
            // Since we connect the Gate Source (ConstantSource) to it, it drives the envelope.
            this.gateSource.connect(worklet);
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
        // Open the Gate
        this.gateSource.offset.cancelScheduledValues(startTime);
        this.gateSource.offset.setValueAtTime(1, startTime);

        // Also trigger via parameter for robustness
        this.adsrData.forEach(({ worklet }) => {
            const gateParam = worklet.parameters.get('gate');
            if (gateParam) {
                gateParam.cancelScheduledValues(startTime);
                gateParam.setValueAtTime(1, startTime);
            }
        });
        // Log is helpful but might be spammy if not careful, rely on Worklet logs.
    }

    public release(startTime: number) {
        // Close the Gate
        this.gateSource.offset.cancelScheduledValues(startTime);
        this.gateSource.offset.setValueAtTime(0, startTime);

        // Also release via parameter
        this.adsrData.forEach(({ worklet }) => {
            const gateParam = worklet.parameters.get('gate');
            if (gateParam) {
                gateParam.cancelScheduledValues(startTime);
                gateParam.setValueAtTime(0, startTime);
            }
        });
    }

    public connect(destination: AudioNode | AudioParam) {
        this.output.connect(destination as any);
    }

    public disconnect() {
        this.output.disconnect();
        this.gateSource.stop();
        this.gateSource.disconnect();
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