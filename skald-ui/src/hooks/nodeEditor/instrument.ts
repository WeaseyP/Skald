// skald-ui/src/hooks/nodeEditor/instrument.ts
import { Node } from 'reactflow';
import { Voice } from './voice';

export class Instrument {
    public input: GainNode; // Main input for the instrument (not used yet)
    public output: GainNode; // Main output for the instrument
    private context: AudioContext;
    private voices: Voice[] = [];
    private nextVoiceIndex = 0;
    private nodeData: any;

    constructor(context: AudioContext, node: Node) {
        this.context = context;
        this.input = context.createGain();
        this.output = context.createGain();
        this.nodeData = node.data;

        const voiceCount = this.nodeData.voiceCount || 8;
        const subgraph = {
            nodes: this.nodeData.subgraph.nodes,
            edges: this.nodeData.subgraph.connections.map((c: any) => ({
                id: `e${c.from_node}-${c.to_node}`,
                source: c.from_node.toString(),
                target: c.to_node.toString(),
                sourceHandle: c.from_port,
                targetHandle: c.to_port,
            }))
        };

        for (let i = 0; i < voiceCount; i++) {
            const voice = new Voice(context, subgraph);
            voice.connect(this.output);
            this.voices.push(voice);
        }
    }

    // Simple trigger for testing. Will trigger the next available voice.
    public trigger() {
        const voice = this.voices[this.nextVoiceIndex];
        if (voice) {
            voice.trigger(this.context.currentTime);
        }
        this.nextVoiceIndex = (this.nextVoiceIndex + 1) % this.voices.length;
    }

    public connect(destination: AudioNode | AudioParam) {
        this.output.connect(destination);
    }

    public disconnect() {
        this.output.disconnect();
        this.voices.forEach(v => v.disconnect());
    }

    public updateNodeData(data: any) {
         Object.keys(data).forEach(key => {
            const value = data[key];
            // Check if this is a parameter for a sub-node
            if(typeof value === 'object' && value.subNodeId) {
                this.voices.forEach(voice => {
                    voice.updateNodeData(value.subNodeId, value.data);
                });
            }
        });
    }
}