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
    setCurrentStep: (step: number) => void
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [graphVersion, setGraphVersion] = useState(0);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<AudioNodeMap>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

    const oscillatorHandler = useOscillatorHandler({ audioContextRef: audioContext, audioNodes });
    const adsrHandler = useAdsrHandler({ audioContextRef: audioContext, audioNodes, adsrNodes });

    const nodeHandlers: { [key: string]: any } = {
        oscillator: oscillatorHandler,
        adsr: adsrHandler,
    };


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
            prevGraphState.current = { nodes: [], edges: [] };
        });
    }, [isPlaying]);

    useSequencerEngine(isPlaying, bpm, sequencerTracks, audioContext, audioNodes, setCurrentStep, isLooping, handleStop);

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
                    if (node.type === 'instrument') {
                        newAudioNode = new Instrument(context, node);
                    } else if (node.type && (nodeCreationMap as any)[node.type]) {
                        const creator = (nodeCreationMap as any)[node.type] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current);
                    } else {
                        const creator = nodeCreationMap['default'] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current);
                    }
                    if (newAudioNode) audioNodes.current.set(node.id, newAudioNode);
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
        // Handle edge deletions
        prevEdges.forEach(edge => {
            if (!edges.find(e => e.id === edge.id)) {
                // ... (existing disconnect logic) ...
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;

                    const targetSkaldNode = (target as any)._skaldNode;
                    if (targetSkaldNode && targetSkaldNode.constructor.name === 'MixerNode' && edge.targetHandle) {
                        const mixerInstance = targetSkaldNode as any;
                        const inputGain = mixerInstance.getInputGain(edge.targetHandle);
                        if (inputGain) {
                            disconnectNodes(sourceNode, inputGain, edge);
                        }
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'FmOperatorNode' && edge.targetHandle === 'input_mod') {
                        const fmInput = (target as any).modulatorInput;
                        if (fmInput) {
                            disconnectNodes(sourceNode, fmInput, edge);
                        }
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'ADSRNode' && edge.targetHandle === 'input_gate') {
                        const adsrGate = (target as any).gate;
                        if (adsrGate) {
                            disconnectNodes(sourceNode, adsrGate, edge);
                        }
                    } else if ((edge.targetHandle === 'input_amplitude' || edge.targetHandle === 'input_gain') && target instanceof GainNode) {
                        disconnectNodes(sourceNode, target.gain, edge);
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
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;

                    const targetSkaldNode = (target as any)._skaldNode;
                    if (targetSkaldNode && targetSkaldNode.constructor.name === 'MixerNode' && edge.targetHandle) {
                        const mixerInstance = targetSkaldNode as any;
                        const inputGain = mixerInstance.getOrCreateInputGain(edge.targetHandle);
                        connectNodes(sourceNode, inputGain, edge);
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'FmOperatorNode' && edge.targetHandle === 'input_mod') {
                        const fmInput = (target as any).modulatorInput;
                        if (fmInput) {
                            connectNodes(sourceNode, fmInput, edge);
                        }
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'ADSRNode' && edge.targetHandle === 'input_gate') {
                        const adsrGate = (target as any).gate;
                        if (adsrGate) {
                            connectNodes(sourceNode, adsrGate, edge);
                        }
                    } else if ((edge.targetHandle === 'input_amplitude' || edge.targetHandle === 'input_gain') && target instanceof GainNode) {
                        connectNodes(sourceNode, target.gain, edge);
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

    return { isPlaying, handlePlay, handleStop };
};