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

    public trigger(startTime: number, note?: number, velocity = 1.0, overrides?: Record<string, number>) {
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
                // Skald wrapper nodes: oscillators expose a `frequency`
                // AudioParam getter; FM operators track the note as a ratio
                // via setNoteFrequency (golden-path semantics).
                const skald = (node as any)._skaldNode;
                if (skald) {
                    if (typeof skald.setNoteFrequency === 'function') {
                        skald.setNoteFrequency(freq, startTime);
                    } else if (skald.frequency instanceof AudioParam) {
                        skald.frequency.cancelScheduledValues(startTime);
                        skald.frequency.setValueAtTime(freq, startTime);
                    }
                }
            });

            // Update all MIDI Input Nodes
            this.midiInputNodes.forEach(midiNode => {
                // Pitch is V/Oct relative to A4 — (note - 69) / 12, the unit
                // the generated code emits. It used to be raw Hz, which made
                // the same Pitch->Freq wire transpose by kilohertz in the
                // preview but by octaves in the export.
                const pitchNode = midiNode as ConstantSourceNode;
                pitchNode.offset.cancelScheduledValues(startTime);
                pitchNode.offset.setValueAtTime((note - 69) / 12, startTime);

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

        // Apply P-Locks (Overrides)
        // Apply P-Locks (Overrides)
        if (overrides) {
            Object.entries(overrides).forEach(([key, value]) => {
                const parts = key.split(':');
                if (parts.length === 2) {
                    const [nodeLabel, paramName] = parts;

                    // Find Node ID by Label OR Type (Fallbacks)
                    const targetGraphNode = this.subgraph.nodes.find(n => {
                        const effectiveLabel = (n.data && n.data.label) || n.type;
                        return effectiveLabel === nodeLabel;
                    });

                    if (targetGraphNode) {
                        const targetAudioNode = this.internalNodes.get(targetGraphNode.id);
                        if (targetAudioNode) {

                            // Try to find the AudioParam
                            let param: AudioParam | undefined;

                            // Custom Skald Node Wrapper Check
                            const skaldNode = (targetAudioNode as any)._skaldNode;
                            if (skaldNode) {
                                if (paramName === 'frequency') param = skaldNode.frequency;
                                else if (paramName === 'detune') param = skaldNode.detune;
                                else if (['attack', 'decay', 'sustain', 'release'].includes(paramName)) {
                                    param = skaldNode[paramName];
                                }
                                // Filter specific handled by BiquadFilterNode check usually, but could add here if needed
                            }

                            if (!param) {
                                if (targetAudioNode instanceof AudioWorkletNode) {
                                    param = targetAudioNode.parameters.get(paramName);
                                } else if (targetAudioNode instanceof BiquadFilterNode) {
                                    if (paramName === 'frequency' || paramName === 'cutoff') param = targetAudioNode.frequency;
                                    else if (paramName === 'Q' || paramName === 'resonance') param = targetAudioNode.Q;
                                    else if (paramName === 'gain') param = targetAudioNode.gain;
                                } else if (targetAudioNode instanceof GainNode) {
                                    if (paramName === 'gain') param = targetAudioNode.gain;
                                } else if (targetAudioNode instanceof OscillatorNode) {
                                    if (paramName === 'frequency') param = targetAudioNode.frequency;
                                    else if (paramName === 'detune') param = targetAudioNode.detune;
                                }
                            }

                            // Apply automation
                            if (param) {
                                param.cancelScheduledValues(startTime);
                                param.setValueAtTime(value, startTime);
                            } else {
                                console.warn(`[Voice] Could not find param '${paramName}' on node '${nodeLabel}' (ID: ${targetGraphNode.id})`);
                            }
                        } else {
                            console.warn(`[Voice] Internal audio node not found for graph node ${targetGraphNode.id}`);
                        }
                    } else {
                        console.warn(`[Voice] Could not find target node for override key: ${key}. Searched ${this.subgraph.nodes.length} nodes.`);
                    }
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
        // Update cached subgraph node data (critical for label lookups in P-Locks)
        const cachedNode = this.subgraph.nodes.find(n => n.id === nodeId);
        if (cachedNode) {
            cachedNode.data = { ...cachedNode.data, ...data };
        }

        const liveNode = this.internalNodes.get(nodeId);

        if (liveNode) {
            const skaldNode = (liveNode as any)._skaldNode;
            if (skaldNode && typeof skaldNode.update === 'function') {
                skaldNode.update(data);
            }
        }
    }
}