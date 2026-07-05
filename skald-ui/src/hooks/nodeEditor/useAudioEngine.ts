import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { sampleHoldProcessorString } from './audioWorklets/sampleHold.worklet';
import { wavetableProcessorString } from './audioWorklets/wavetable.worklet';
import { adsrProcessorString } from './audioWorklets/adsr.worklet';
import { useSequencerEngine } from '../sequencer/useSequencerEngine';
import { Instrument } from './instrument';
import { AdsrDataMap, AudioNodeMap } from './types';
import { SequencerTrack } from '../../definitions/types';
import { connectNodes, disconnectNodes } from './audioNodeUtils';
import { nodeCreationMap } from './audioNodeFactory';
import { useOscillatorHandler } from './node-handlers/useOscillatorHandler';
import { useAdsrHandler } from './node-handlers/useAdsrHandler';
import { logger } from '../../utils/logger';

export const useAudioEngine = (
    nodes: Node[],
    edges: Edge[],
    isLooping: boolean,
    bpm: number,
    sequencerTracks: SequencerTrack[],
    setCurrentStep: (step: number) => void,
    patternSteps: number,
    nearestInScale: (note: number) => number
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [graphVersion, setGraphVersion] = useState(0);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<AudioNodeMap>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

    // Exposed State for UI
    const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
    const [masterGainState, setMasterGainState] = useState<GainNode | null>(null);

    const oscillatorHandler = useOscillatorHandler({ audioContextRef: audioContext, audioNodes });
    const adsrHandler = useAdsrHandler({ audioContextRef: audioContext, audioNodes, adsrNodes });

    const nodeHandlers: { [key: string]: any } = {
        oscillator: oscillatorHandler,
        adsr: adsrHandler,
    };


    const analyserNode = useRef<AnalyserNode | null>(null);
    const masterGainNode = useRef<GainNode | null>(null); // For future Master Bus

    const handlePlay = useCallback(async () => {
        logger.info('AudioEngine', 'Play requeted');
        if (isPlaying) return;
        const context = new AudioContext();
        audioContext.current = context;
        try {
            logger.info('AudioEngine', 'Loading AudioWorklets...');
            const sampleHoldBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const wavetableBlob = new Blob([wavetableProcessorString], { type: 'application/javascript' });
            const adsrBlob = new Blob([adsrProcessorString], { type: 'application/javascript' });
            await Promise.all([
                context.audioWorklet.addModule(URL.createObjectURL(sampleHoldBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(wavetableBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(adsrBlob))
            ]);

            // Setup Master Chain for SKALD-92/94
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            analyser.connect(context.destination);
            analyserNode.current = analyser;
            setAnalyserState(analyser); // Trigger re-render

            // Optional: Master Gain
            const masterGain = context.createGain();
            masterGain.connect(analyser); // Future nodes will connect to masterGain instead of destination
            masterGainNode.current = masterGain;
            setMasterGainState(masterGain); // Trigger re-render

            logger.info('AudioEngine', 'AudioWorklets loaded. Starting playback.');
            setIsPlaying(true);
        } catch (e) {
            logger.error('AudioEngine', 'Error loading AudioWorklet', e);
            console.error('Error loading AudioWorklet:', e);
            audioContext.current = null;
        }
    }, [isPlaying]);

    const handleStop = useCallback(() => {
        logger.info('AudioEngine', 'Stop requested');
        if (!isPlaying || !audioContext.current) return;
        audioContext.current.close().then(() => {
            logger.info('AudioEngine', 'AudioContext closed');
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            adsrNodes.current.clear();
            analyserNode.current = null;
            masterGainNode.current = null;
            setAnalyserState(null);
            setMasterGainState(null);
            prevGraphState.current = { nodes: [], edges: [] };
        });
    }, [isPlaying]);

    useSequencerEngine(isPlaying, bpm, sequencerTracks, audioContext, audioNodes, setCurrentStep, isLooping, handleStop, patternSteps, nearestInScale);

    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;

        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        // ... (Node deletion logic) ...
        prevNodes.forEach(node => {
            if (!nodes.find(n => n.id === node.id)) {
                logger.debug('AudioEngine', `Removing node ${node.id} (${node.type})`);
                const handler = node.type ? nodeHandlers[node.type] : null;
                if (handler) {
                    handler.remove(node);
                } else {
                    const audioNode = audioNodes.current.get(node.id);
                    if (audioNode) {
                        audioNode.disconnect();
                        audioNodes.current.delete(node.id);
                    }
                }
            }
        });

        // ... (Node addition/update logic) ...
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            const prevNode = prevNodes.find(p => p.id === node.id);
            const handler = node.type ? nodeHandlers[node.type] : null;

            if (!liveNode) {
                logger.debug('AudioEngine', `Creating node ${node.id} (${node.type})`);
                if (handler) {
                    handler.create(node);
                } else {
                    let newAudioNode: AudioNode | Instrument | null = null;
                    logger.debug('AudioEngine', `[TRACE] Processing Node ${node.id} Type: "${node.type}"`);

                    if (node.type === 'output' || node.type === 'GraphOutput') {
                        // Defensive Recovery for SKALD-94/102
                        if (!masterGainNode.current && context) {
                            logger.warn('AudioEngine', 'Master Gain missing during Output creation. Recreating chain.');
                            const gain = context.createGain();

                            if (!analyserNode.current) {
                                const ana = context.createAnalyser();
                                ana.fftSize = 2048;
                                ana.connect(context.destination);
                                analyserNode.current = ana;
                                setAnalyserState(ana);
                            }

                            gain.connect(analyserNode.current);
                            masterGainNode.current = gain;
                            setMasterGainState(gain);
                        }

                        if (masterGainNode.current) {
                            newAudioNode = masterGainNode.current;
                            logger.info('AudioEngine', `[SUCCESS] Output Node ${node.id} routed to Master Bus Gain ID: ${(masterGainNode.current as any).id || 'N/A'}`);
                        } else {
                            logger.error('AudioEngine', `CRITICAL: Recovery failed. Master Gain is null for node ${node.id}`);
                        }
                    }
                    else if (node.type === 'instrument') {
                        logger.debug('AudioEngine', `Creating Instrument Node ${node.id}`);
                        newAudioNode = new Instrument(context, node);
                    } else if (node.type && (nodeCreationMap as any)[node.type]) {
                        logger.debug('AudioEngine', `Creating Standard Node ${node.id} via Factory`);
                        const creator = (nodeCreationMap as any)[node.type] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current);
                    } else {
                        logger.debug('AudioEngine', `Creating Default Node ${node.id}`);
                        const creator = nodeCreationMap['default'] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current);
                    }

                    if (newAudioNode) {
                        audioNodes.current.set(node.id, newAudioNode);
                    } else {
                        logger.warn('AudioEngine', `Node ${node.id} resulted in NULL AudioNode`);
                    }
                }
            } else {
                if (handler && prevNode) {
                    handler.update(node, prevNode);
                } else {
                    // Handle Output Node Test Trigger
                    if ((node.type === 'output' || node.type === 'InstrumentOutput') && prevNode) {
                        const lastTrigger = (node.data as any).lastTrigger;
                        const prevLastTrigger = (prevNode.data as any).lastTrigger;
                        if (lastTrigger && lastTrigger !== prevLastTrigger) {
                            logger.info('AudioEngine', 'Output Test Triggered');
                            const now = context.currentTime;
                            adsrNodes.current.forEach(({ worklet }) => {
                                worklet.parameters.get('gate')?.setValueAtTime(1, now);
                                worklet.parameters.get('gate')?.setValueAtTime(0, now + 0.2);
                            });

                            // Trigger Instruments
                            audioNodes.current.forEach((audioNode) => {
                                if (audioNode instanceof Instrument) {
                                    audioNode.trigger(now, 60, 1.0);
                                    // If Instrument needs explicit note off, we might need a way to schedule it.
                                    // Assuming trigger handles envelope start. User might need to stop it manually if it sustains?
                                    // But for "Audition" usually implies a preview.
                                    // We can try calling trigger with 0 velocity after a duration if the method supports it, 
                                    // or if there is a noteOff method.
                                    if (typeof (audioNode as any).noteOff === 'function') {
                                        (audioNode as any).noteOff(now + 0.2, 60);
                                    }
                                }
                            });
                        }
                    }

                    if (liveNode instanceof Instrument) {
                        liveNode.updateNodeData(node.data, bpm);
                    } else if (prevNode && JSON.stringify(prevNode.data) !== JSON.stringify(node.data)) {
                        const skaldNode = (liveNode as any)._skaldNode;
                        if (skaldNode && typeof skaldNode.update === 'function') {
                            skaldNode.update(node.data);
                        }
                    }
                }
            }
        });

        // ... (Edge handling) ...
        // Resolve where an edge's signal should land on the target node.
        // Dispatch is on `_skaldNode.skaldType` (a stable literal) — the old
        // `constructor.name` checks broke under minified production builds,
        // which silently killed every modulation wire in the packaged app.
        // Returns the AudioNode/AudioParam destination, or null for "use the
        // default input".
        const resolveEdgeTarget = (target: any, edge: any, create: boolean): any => {
            const targetSkaldNode = (target as any)._skaldNode;
            const handle = edge.targetHandle;
            const t = targetSkaldNode?.skaldType;

            if (t === 'MixerNode' && handle) {
                return create
                    ? (targetSkaldNode as any).getOrCreateInputGain(handle)
                    : (targetSkaldNode as any).getInputGain(handle);
            }
            if (t === 'SkaldOscillatorNode' && handle === 'input_freq') {
                return (targetSkaldNode as any).input_freq ?? null;
            }
            if (t === 'FmOperatorNode' && handle === 'input_mod') {
                return (target as any).modulatorInput ?? null;
            }
            if (t === 'ADSRNode' && handle === 'input_gate') {
                return (target as any).gate ?? null;
            }
            if (t === 'GainNodeWrapper' && (handle === 'input_gain' || handle === 'gain')) {
                return (target as GainNode).gain;
            }
            // Filter modulation: these handles existed in the editor but the
            // engine silently dropped the wires (codegen honors them).
            if (t === 'FilterNode' && handle === 'input_cutoff') {
                return (target as BiquadFilterNode).frequency;
            }
            if (t === 'FilterNode' && handle === 'input_res') {
                return (target as BiquadFilterNode).Q;
            }
            if (t === 'PannerNode' && handle === 'input_pan') {
                return (target as StereoPannerNode).pan;
            }
            // Wavetable worklet params exposed by its factory.
            if (handle === 'input_pos' && (target as any).position) {
                return (target as any).position;
            }
            if ((handle === 'input_amplitude' || handle === 'input_amp' || handle === 'input_gain') && target instanceof GainNode) {
                // Driving the gain AudioParam makes amplitude modulation
                // multiplicative (base + mod scales the signal), matching
                // codegen — instead of summing the modulator into the audio.
                return target.gain;
            }
            return null;
        };

        // Handle edge deletions
        prevEdges.forEach(edge => {
            if (!edges.find(e => e.id === edge.id)) {
                // ... (existing disconnect logic) ...
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    let sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;

                    // Handle multi-output nodes (like MidiInput)
                    if (edge.sourceHandle && (source as any)[edge.sourceHandle]) {
                        sourceNode = (source as any)[edge.sourceHandle];
                    } else if (edge.sourceHandle === 'gate' && (source as any).gate) {
                        // Explicit fallback for MidiInput if indexer didn't work or for safety
                        sourceNode = (source as any).gate;
                    } else if (edge.sourceHandle === 'velocity' && (source as any).velocity) {
                        sourceNode = (source as any).velocity;
                    }


                    const resolved = resolveEdgeTarget(target, edge, false);
                    if (resolved) {
                        disconnectNodes(sourceNode, resolved, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        disconnectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        // Handle edge additions
        edges.forEach(edge => {
            if (!prevEdges.find(e => e.id === edge.id)) {
                // ... (existing connect logic) ...
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    let sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;

                    // Handle multi-output nodes (like MidiInput)
                    if (edge.sourceHandle && (source as any)[edge.sourceHandle]) {
                        sourceNode = (source as any)[edge.sourceHandle];
                    } else if (edge.sourceHandle === 'gate' && (source as any).gate) {
                        // Explicit fallback for MidiInput if indexer didn't work or for safety
                        sourceNode = (source as any).gate;
                    } else if (edge.sourceHandle === 'velocity' && (source as any).velocity) {
                        sourceNode = (source as any).velocity;
                    }


                    const resolved = resolveEdgeTarget(target, edge, true);
                    if (resolved) {
                        connectNodes(sourceNode, resolved, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        connectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });


        prevGraphState.current = { nodes, edges };
        setGraphVersion(v => v + 1);

    }, [nodes, edges, isPlaying, bpm, nodeHandlers]);

    // useSequencer was replaced by useSequencerEngine above

    useEffect(() => {
        return () => { if (audioContext.current) handleStop(); };
    }, [handleStop]);

    // === Global MIDI Listener for Top-Level Nodes ===
    useEffect(() => {
        let midiAccess: any = null;

        const handleMidiMessage = (message: any) => {
            if (!audioContext.current) return;
            const [status, data1, data2] = message.data;
            const command = status & 0xf0;
            // const channel = status & 0x0f;
            const now = audioContext.current.currentTime;

            if (command === 0x90 && data2 > 0) { // Note On
                const rawNote = data1;
                const note = nearestInScale(rawNote); // Apply Scale Quantization
                const velocity = data2 / 127;

                logger.debug('AudioEngine', `[MIDI In] Raw: ${rawNote} -> Quantized: ${note}`);

                audioNodes.current.forEach((node, id) => {
                    // Check if it's a MidiInput (has pitch, gate, velocity props)
                    if (node instanceof ConstantSourceNode && (node as any).gate && (node as any).velocity) {
                        const pitchNode = node as ConstantSourceNode;
                        const gateNode = (node as any).gate as ConstantSourceNode;
                        const velNode = (node as any).velocity as ConstantSourceNode;

                        // TODO: Check node.data.device to filter by device

                        // V/Oct relative to A4 — same unit the generated code
                        // emits for the pitch output (was raw Hz).
                        pitchNode.offset.setValueAtTime((note - 69) / 12, now);
                        velNode.offset.setValueAtTime(velocity, now);

                        gateNode.offset.cancelScheduledValues(now);
                        gateNode.offset.setValueAtTime(0, now);
                        gateNode.offset.setValueAtTime(1, now + 0.005);
                    }
                });
            } else if (command === 0x80 || (command === 0x90 && data2 === 0)) { // Note Off
                // Note Off doesn't need quantization as it just closes the gate
                audioNodes.current.forEach((node, id) => {
                    if (node instanceof ConstantSourceNode && (node as any).gate && (node as any).velocity) {
                        const gateNode = (node as any).gate as ConstantSourceNode;
                        gateNode.offset.cancelScheduledValues(now);
                        gateNode.offset.setValueAtTime(0, now);
                    }
                });
            }
        };

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(access => {
                midiAccess = access;
                const inputs = midiAccess.inputs.values();
                for (const input of inputs) {
                    input.onmidimessage = handleMidiMessage;
                }

                midiAccess.onstatechange = (e: any) => {
                    // Re-bind if new devices plugged in
                    const inputs = midiAccess?.inputs.values();
                    if (inputs) {
                        for (const input of inputs) {
                            input.onmidimessage = handleMidiMessage;
                        }
                    }
                };
            });
        }

        return () => {
            if (midiAccess) {
                const inputs = midiAccess.inputs.values();
                for (const input of inputs) {
                    input.onmidimessage = null;
                }
            }
        };
    }, [nearestInScale]);

    return {
        isPlaying,
        handlePlay,
        handleStop,
        analyserNode: { current: analyserState },
        masterGainNode: { current: masterGainState }
    };
};