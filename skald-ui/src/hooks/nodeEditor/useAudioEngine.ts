import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { sampleHoldProcessorString } from './audioWorklets/sampleHold.worklet';
import { wavetableProcessorString } from './audioWorklets/wavetable.worklet';
import { adsrProcessorString } from './audioWorklets/adsr.worklet';
import { useSequencer } from './useSequencer';
import { Instrument } from './instrument';
import { AdsrDataMap } from './types';
import { connectNodes, disconnectNodes } from './audioNodeUtils';
import { nodeCreationMap } from './audioNodeFactory';
import { useOscillatorHandler } from './node-handlers/useOscillatorHandler';
import { useAdsrHandler } from './node-handlers/useAdsrHandler';
import { Logger } from '../../utils/Logger';

type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
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

    useSequencer(bpm, isLooping, isPlaying, audioContext, adsrNodes, audioNodes);

    const handlePlay = useCallback(async () => {
        if (isPlaying) return;
        Logger.log('Audio Engine: Starting...');
        const context = new AudioContext();
        audioContext.current = context;
        Logger.log(`Audio Engine: Context created (State: ${context.state})`);
        try {
            const sampleHoldBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const wavetableBlob = new Blob([wavetableProcessorString], { type: 'application/javascript' });
            const adsrBlob = new Blob([adsrProcessorString], { type: 'application/javascript' });
            await Promise.all([
                context.audioWorklet.addModule(URL.createObjectURL(sampleHoldBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(wavetableBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(adsrBlob))
            ]);
            setIsPlaying(true);
            Logger.log('Audio Engine: Started successfully');
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
            Logger.log(`Audio Engine: Error loading AudioWorklet - ${e}`);
            audioContext.current = null;
        }
    }, [isPlaying]);

    const handleStop = useCallback(() => {
        if (!isPlaying || !audioContext.current) return;
        Logger.log('Audio Engine: Stopping...');
        audioContext.current.close().then(() => {
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            adsrNodes.current.clear();
            prevGraphState.current = { nodes: [], edges: [] };
            Logger.log('Audio Engine: Stopped');
        });
    }, [isPlaying]);

    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;

        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        // Handle node deletions
        prevNodes.forEach(node => {
            if (!nodes.find(n => n.id === node.id)) {
                Logger.log(`Audio Engine: Removing node ${node.id} (${node.type})`);
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

        // Handle node additions and updates
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            const prevNode = prevNodes.find(p => p.id === node.id);
            const handler = node.type ? nodeHandlers[node.type] : null;

            if (!liveNode) {
                Logger.log(`Audio Engine: Creating node ${node.id} (${node.type})`);
                if (handler) {
                    handler.create(node);
                } else {
                    let newAudioNode: AudioNode | Instrument | null = null;
                    if (node.type === 'instrument') {
                        newAudioNode = new Instrument(context, node);
                    } else if (node.type && nodeCreationMap[node.type]) {
                        const creator = nodeCreationMap[node.type as keyof typeof nodeCreationMap] as Function;
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

        // --- EDGE HANDLING (remains unchanged for now) ---

        // Handle edge deletions
        prevEdges.forEach(edge => {
            if (!edges.find(e => e.id === edge.id)) {
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
                        // When disconnecting from a GainNode's gain parameter
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
                        // When connecting to a GainNode's gain parameter for modulation
                        connectNodes(sourceNode, target.gain, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        connectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        prevGraphState.current = { nodes, edges };

    }, [nodes, edges, isPlaying, bpm, nodeHandlers]);

    useEffect(() => {
        return () => { if (audioContext.current) handleStop(); };
    }, [handleStop]);

    return { isPlaying, handlePlay, handleStop };
};