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

    // Track Midi Input Nodes specifically
    private midiInputNodes: Map<string, AudioNode> = new Map();

    constructor(context: AudioContext, subgraph: { nodes: Node[]; connections: Edge[] }) {
        this.audioContext = context;
        this.subgraph = subgraph;
        this.input = context.createGain();
        this.output = context.createGain();

        this.output = context.createGain();

        // No centralized gate source anymore, we check for 'midiInput' nodes in the graph
        this.buildSubgraph();
    }

    private buildSubgraph() {
        this.subgraph.nodes.forEach(node => {
            let audioNode: AudioNode | null = null;
            if (node.type && (nodeCreationMap as any)[node.type]) {
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
        // Check for MidiInput nodes
        this.subgraph.nodes.filter(n => n.type === 'midiInput').forEach(n => {
            const node = this.internalNodes.get(n.id);
            if (node) {
                this.midiInputNodes.set(n.id, node);
            }
        });

        // ADSR Worklets no longer need manual connection to a central gate.
        // They should be connected to the MidiInput node's 'gate' output via the graph.

        this.subgraph.connections.forEach(edge => {
            const source = this.internalNodes.get(edge.source);
            const targetNode = this.internalNodes.get(edge.target);
            if (source && targetNode) {
                let sourceNode = source;

                // Handle multi-output nodes (like MidiInput) inside Voice
                if (edge.sourceHandle && (source as any)[edge.sourceHandle]) {
                    sourceNode = (source as any)[edge.sourceHandle];
                } else if (edge.sourceHandle === 'gate' && (source as any).gate) {
                    sourceNode = (source as any).gate;
                } else if (edge.sourceHandle === 'velocity' && (source as any).velocity) {
                    sourceNode = (source as any).velocity;
                }

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

    public trigger(startTime: number, note?: number, velocity: number = 1.0) {
        // Frequency handling
        if (note !== undefined) {
            const freq = 440 * Math.pow(2, (note - 69) / 12);

            this.internalNodes.forEach(node => {
                // Native Oscillator - still useful for direct patches without MIDI node
                if (node instanceof OscillatorNode) {
                    node.frequency.cancelScheduledValues(startTime);
                    node.frequency.setValueAtTime(freq, startTime);
                }
                // Worklets (Wavetable, FM, etc) - check for frequency parameter
                if (node instanceof AudioWorkletNode) {
                    const freqParam = node.parameters.get('frequency');
                    if (freqParam) {
                        freqParam.cancelScheduledValues(startTime);
                        freqParam.setValueAtTime(freq, startTime);
                    }
                }
            });

            // Update all MIDI Input Nodes
            this.midiInputNodes.forEach(midiNode => {
                // Pitch is the main node
                const pitchNode = midiNode as ConstantSourceNode;
                pitchNode.offset.cancelScheduledValues(startTime);
                pitchNode.offset.setValueAtTime(freq, startTime);

                // Gate is a property
                const gateNode = (midiNode as any).gate as ConstantSourceNode;
                if (gateNode) {
                    gateNode.offset.cancelScheduledValues(startTime);
                    gateNode.offset.setValueAtTime(0, startTime); // Reset for re-trigger
                    gateNode.offset.setValueAtTime(1, startTime + 0.005);
                }

                // Velocity is a property
                const velNode = (midiNode as any).velocity as ConstantSourceNode;
                if (velNode) {
                    velNode.offset.cancelScheduledValues(startTime);
                    velNode.offset.setValueAtTime(velocity, startTime);
                }
            });
        }

        // DEPRECATED: Central gate source
        // this.gateSource.offset.cancelScheduledValues(startTime);
        // this.gateSource.offset.setValueAtTime(0, startTime);
        // this.gateSource.offset.setValueAtTime(1, startTime + 0.005);

        // Also trigger via parameter for robustness - KEEPING THIS AS FALLBACK/DIRECT PATCH SUPPORT
        this.adsrData.forEach(({ worklet }) => {
            const gateParam = worklet.parameters.get('gate');
            if (gateParam) {
                // Only manual trigger if NOT connected? 
                // Actually, if we connect MIDI Gate -> ADSR Gate, the ADSR Gate param is ignored or summed.
                // Standard AudioParam behavior is summing.
                // If we want MIDI signal to drive it, we shouldn't manually set the param here unless we want to support both.
                // For now, let's supporting both is safer for backward compat.
                gateParam.cancelScheduledValues(startTime);
                gateParam.setValueAtTime(0, startTime);
                gateParam.setValueAtTime(1, startTime + 0.005);
            }
        });
    }

    public release(startTime: number) {
        // Update all MIDI Input Nodes - Gate Off
        this.midiInputNodes.forEach(midiNode => {
            const gateNode = (midiNode as any).gate as ConstantSourceNode;
            if (gateNode) {
                gateNode.offset.cancelScheduledValues(startTime);
                gateNode.offset.setValueAtTime(0, startTime);
            }
        });

        // Also release via parameter - KEEPING AS FALLBACK
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
        // this.gateSource.stop(); // Removed central gate
        // this.gateSource.disconnect();
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