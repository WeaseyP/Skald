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
    private frequencySource: ConstantSourceNode;

    constructor(context: AudioContext, subgraph: { nodes: Node[]; connections: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.input = context.createGain();
        this.output = context.createGain();

        // Central Gate Signal
        this.gateSource = context.createConstantSource();
        this.gateSource.offset.setValueAtTime(0, context.currentTime);
        this.gateSource.start();

        // Central Frequency Signal (Pitch)
        // Default to 440, but trigger() will update this.
        this.frequencySource = context.createConstantSource();
        this.frequencySource.offset.setValueAtTime(440, context.currentTime);
        this.frequencySource.start();

        this.buildSubgraph();
    }

    private buildSubgraph() {
        this.subgraph.nodes.forEach(node => {
            let audioNode: AudioNode | null = null;

            // Pass the frequencySource to the factory.
            // Factories like createOscillator and createFmOperator will use it.
            // Others will ignore it.

            if (node.type && nodeCreationMap[node.type]) {
                const creator = nodeCreationMap[node.type as keyof typeof nodeCreationMap] as Function;
                audioNode = creator(this.audioContext, node, this.adsrData, this.frequencySource);
            } else {
                const creator = nodeCreationMap['default'] as Function;
                audioNode = creator(this.audioContext, node, this.adsrData, this.frequencySource);
            }
            if (audioNode) {
                this.internalNodes.set(node.id, audioNode);
            }
        });

        // Loop through all registered ADSR worklets and connect the Voice Gate to them
        this.adsrData.forEach(({ worklet }) => {
            // The ADSR Worklet expects the Gate signal on input 0.
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

    public trigger(startTime: number, note?: number) {
        // Update Frequency if note is provided
        if (note !== undefined) {
            const freq = 440 * Math.pow(2, (note - 69) / 12);
            this.frequencySource.offset.cancelScheduledValues(startTime);
            this.frequencySource.offset.setValueAtTime(freq, startTime);
        }

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
        this.frequencySource.stop();
        this.frequencySource.disconnect();
        this.internalNodes.forEach(node => {
            try { node.disconnect(); } catch (e) { /* ignore */ }
        });
    }

    public updateNodeData(nodeId: string, data: any, bpm: number) {
        const liveNode = this.internalNodes.get(nodeId);

        if (liveNode) {
            const skaldNode = (liveNode as any)._skaldNode;
            if (skaldNode && typeof skaldNode.update === 'function') {
                skaldNode.update(data);
            }
        }
    }
}
