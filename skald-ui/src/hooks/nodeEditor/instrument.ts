import { Node, Edge } from 'reactflow';
import { Voice } from './voice';

export class Instrument {
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

    public trigger(time: number, note: number, velocity: number) {
        const voice = this.voices[this.nextVoiceIndex];
        if (voice) {
            voice.trigger(time, note, velocity);
        }
        this.nextVoiceIndex = (this.nextVoiceIndex + 1) % this.voices.length;
    }

    public noteOff() {
        if (!this.context) return;
        const releaseTime = this.context.currentTime;
        this.voices.forEach(voice => voice.release(releaseTime));
    }

    public connect(destination: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number) {
        this.output.connect(destination as any, outputIndex, inputIndex);
    }

    public disconnect() {
        this.output.disconnect();
        this.voices.forEach(v => v.disconnect());
    }

    public updateNodeData(data: any, bpm: number) {
        this.voices.forEach(voice => {
            if (data.subgraph && data.subgraph.nodes) {
                data.subgraph.nodes.forEach((subNode: Node) => {
                    voice.updateNodeData(subNode.id, subNode.data);
                });
            }
        });
    }
}