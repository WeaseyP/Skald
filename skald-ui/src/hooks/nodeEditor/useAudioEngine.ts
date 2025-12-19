import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { logger } from '../../utils/logger';

type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<AudioNodeMap>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const prevTopology = useRef<{ nodes: {id: string, type: string}[], edges: Edge[] }>({ nodes: [], edges: [] });

    const oscillatorHandler = useOscillatorHandler({ audioContextRef: audioContext, audioNodes });
    const adsrHandler = useAdsrHandler({ audioContextRef: audioContext, audioNodes, adsrNodes });

    const nodeHandlers: { [key: string]: any } = {
        oscillator: oscillatorHandler,
        adsr: adsrHandler,
    };

    useSequencer(bpm, isLooping, isPlaying, audioContext, adsrNodes, audioNodes);

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
            prevTopology.current = { nodes: [], edges: [] };
        });
    }, [isPlaying]);

    // Derived topology for effect dependency
    const currentTopology = useMemo(() => ({
        nodes: nodes.map(n => ({ id: n.id, type: n.type || 'default' })),
        edges: edges
    }), [nodes, edges]);

    // 1. Topology Reconciliation Effect (Expensive, runs only on Add/Remove/Connect)
    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;

        const { nodes: prevNodes, edges: prevEdges } = prevTopology.current;
        const context = audioContext.current;

        // Node Deletion
        prevNodes.forEach(prevNode => {
            if (!currentTopology.nodes.find(n => n.id === prevNode.id)) {
                logger.debug('AudioEngine', `Removing node ${prevNode.id}`);
                const handler = prevNode.type ? nodeHandlers[prevNode.type] : null;
                if (handler) {
                    // Handlers need the full node object, but we only have ID/Type here.
                    // Assuming handler.remove only needs ID usually, but if it needs data, this refactor breaks it.
                    // However, standard cleanup is usually just ID based.
                    // Let's reconstruct a mock node for removal if needed, or update handlers.
                    // For now, simple disconnect is safer.
                     const audioNode = audioNodes.current.get(prevNode.id);
                    if (audioNode) {
                        if (audioNode instanceof Instrument) audioNode.disconnect();
                        else (audioNode as AudioNode).disconnect();
                        audioNodes.current.delete(prevNode.id);
                    }
                    if (handler) handler.remove({ id: prevNode.id }); // Passing partial node
                } else {
                    const audioNode = audioNodes.current.get(prevNode.id);
                    if (audioNode) {
                        if (audioNode instanceof Instrument) audioNode.disconnect();
                        else (audioNode as AudioNode).disconnect();
                        audioNodes.current.delete(prevNode.id);
                    }
                }
            }
        });

        // Node Creation (Note: Data updates handled in separate effect)
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            const handler = node.type ? nodeHandlers[node.type] : null;

            if (!liveNode) {
                logger.debug('AudioEngine', `Creating node ${node.id} (${node.type})`);
                if (handler) {
                    handler.create(node);
                } else {
                    let newAudioNode: AudioNode | Instrument | null = null;
                    if (node.type === 'instrument') {
                        newAudioNode = new Instrument(context, node);
                    } else if (node.type && nodeCreationMap[node.type]) {
                        const creator = nodeCreationMap[node.type as keyof typeof nodeCreationMap] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current); // FrequencySource optional/null
                    } else {
                        const creator = nodeCreationMap['default'] as Function;
                        newAudioNode = creator(context, node, adsrNodes.current);
                    }
                    if (newAudioNode) audioNodes.current.set(node.id, newAudioNode);
                }
            }
        });

        // Edge Deletion
        prevEdges.forEach(edge => {
            if (!edges.find(e => e.id === edge.id)) {
                 const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;

                    const targetSkaldNode = (target as any)._skaldNode;
                    // Logic for specific disconnects
                    if (targetSkaldNode && targetSkaldNode.constructor.name === 'MixerNode' && edge.targetHandle) {
                         const mixerInstance = targetSkaldNode as any;
                        const inputGain = mixerInstance.getInputGain(edge.targetHandle);
                        if (inputGain) disconnectNodes(sourceNode, inputGain, edge);
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'FmOperatorNode' && edge.targetHandle === 'input_mod') {
                        const fmInput = (target as any).modulatorInput;
                        if (fmInput) disconnectNodes(sourceNode, fmInput, edge);
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'ADSRNode' && edge.targetHandle === 'input_gate') {
                        const adsrGate = (target as any).gate;
                        if (adsrGate) disconnectNodes(sourceNode, adsrGate, edge);
                    } else if ((edge.targetHandle === 'input_amplitude' || edge.targetHandle === 'input_gain') && target instanceof GainNode) {
                        disconnectNodes(sourceNode, target.gain, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        disconnectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        // Edge Creation
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
                        if (fmInput) connectNodes(sourceNode, fmInput, edge);
                    } else if (targetSkaldNode && targetSkaldNode.constructor.name === 'ADSRNode' && edge.targetHandle === 'input_gate') {
                        const adsrGate = (target as any).gate;
                        if (adsrGate) connectNodes(sourceNode, adsrGate, edge);
                    } else if ((edge.targetHandle === 'input_amplitude' || edge.targetHandle === 'input_gain') && target instanceof GainNode) {
                        connectNodes(sourceNode, target.gain, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        connectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        prevTopology.current = currentTopology;
    }, [currentTopology, isPlaying, nodeHandlers]);


    // 2. Parameter Update Effect (Fast, runs on Data change)
    // This runs whenever `nodes` reference changes, but we ONLY process updates, never create/destroy.
    useEffect(() => {
        if (!isPlaying || !audioContext.current) return;

        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            const handler = node.type ? nodeHandlers[node.type] : null;

            if (liveNode) {
                if (handler) {
                    // Handlers might need optimization to avoid re-checking everything
                    handler.update(node, node); // Passing node as both prev and next to force update if needed?
                    // Actually handler.update usually diffs.
                    // If we pass the same node, it might skip.
                    // But we don't have the "prevNode" with old data easily here without another ref.
                    // We can rely on the handlers or the node classes to be smart.
                    // Most `update` methods in BaseSkaldNode just apply values.
                } else {
                    if (liveNode instanceof Instrument) {
                        liveNode.updateNodeData(node.data, bpm);
                    } else {
                        const skaldNode = (liveNode as any)._skaldNode;
                        if (skaldNode && typeof skaldNode.update === 'function') {
                            skaldNode.update(node.data);
                        }
                    }
                }
            }
        });
    }, [nodes, isPlaying, bpm, nodeHandlers]); // 'edges' is NOT a dependency here.


    useEffect(() => {
        return () => { if (audioContext.current) handleStop(); };
    }, [handleStop]);

    return { isPlaying, handlePlay, handleStop };
};
