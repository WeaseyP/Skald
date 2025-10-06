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
import { useAudioEngineV2 } from './useAudioEngine.v2'; // Import the new v2 engine

type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<AudioNodeMap>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

    // Instantiate the v2 engine
    const audioEngineV2 = useAudioEngineV2({ audioContextRef: audioContext, audioNodes });

    useSequencer(bpm, isLooping, isPlaying, audioContext, adsrNodes, audioNodes);

    const handlePlay = useCallback(async () => {
        if (isPlaying) return;
        const context = new AudioContext();
        audioContext.current = context;
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
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
            audioContext.current = null;
        }
    }, [isPlaying]);

    const handleStop = useCallback(() => {
        if (!isPlaying || !audioContext.current) return;
        audioContext.current.close().then(() => {
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            adsrNodes.current.clear();
            prevGraphState.current = { nodes: [], edges: [] };
        });
    }, [isPlaying]);

    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;
        
        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        // Handle node deletions
        prevNodes.forEach(node => {
            if (!nodes.find(n => n.id === node.id)) {
                // Delegate to v2 engine if it's an oscillator
                if (node.type === 'oscillator') {
                    audioEngineV2.deleteNode(node);
                } else { // Otherwise, use original logic
                    const audioNode = audioNodes.current.get(node.id);
                    if (audioNode) {
                        audioNode.disconnect();
                        audioNodes.current.delete(node.id);
                        if (node.type === 'adsr') adsrNodes.current.delete(node.id);
                    }
                }
            }
        });

        // Handle node additions and updates
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            const prevNode = prevNodes.find(p => p.id === node.id);

            if (!liveNode) {
                // Delegate to v2 engine if it's an oscillator
                if (node.type === 'oscillator') {
                    audioEngineV2.createNode(node);
                } else { // Otherwise, use original logic
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
                // Delegate to v2 engine if it's an oscillator
                if (node.type === 'oscillator' && prevNode) {
                     audioEngineV2.updateNode(node, prevNode);
                } else { // Otherwise, use original logic
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
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        connectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        prevGraphState.current = { nodes, edges };

    }, [nodes, edges, isPlaying, bpm, audioEngineV2]);

    useEffect(() => {
        return () => { if (audioContext.current) handleStop(); };
    }, [handleStop]);

    return { isPlaying, handlePlay, handleStop };
};