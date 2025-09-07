import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { sampleHoldProcessorString } from './audioWorklets/sampleHold.worklet';
import { wavetableProcessorString } from './audioWorklets/wavetable.worklet';
import { adsrProcessorString } from './audioWorklets/adsr.worklet';
import { oscillatorProcessorString } from './audioWorklets/oscillator.worklet';
import { noiseProcessorString } from './audioWorklets/noise.worklet';
import { useSequencer } from './useSequencer';
import { Instrument } from './instrument';
import { AdsrDataMap } from './types';
import { connectNodes, disconnectNodes } from './audioNodeUtils';
import { nodeCreationMap } from './audioNodeFactory';

type AudioNodeMap = Map<string, AudioNode | Instrument>;

export const useAudioEngine = (nodes: Node[], edges: Edge[], isLooping: boolean, bpm: number) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<AudioNodeMap>(new Map());
    const adsrNodes = useRef<AdsrDataMap>(new Map());
    const prevGraphState = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
    const prevBpm = useRef<number>(bpm);
    const isInitialized = useRef(false);

    const initializeAudio = useCallback(async () => {
        if (isInitialized.current) return;
        
        const context = new AudioContext();
        audioContext.current = context;
        
        try {
            const sampleHoldBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const wavetableBlob = new Blob([wavetableProcessorString], { type: 'application/javascript' });
            const adsrBlob = new Blob([adsrProcessorString], { type: 'application/javascript' });
            const oscillatorBlob = new Blob([oscillatorProcessorString], { type: 'application/javascript' });
            const noiseBlob = new Blob([noiseProcessorString], { type: 'application/javascript' });
            
            await Promise.all([
                context.audioWorklet.addModule(URL.createObjectURL(sampleHoldBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(wavetableBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(adsrBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(oscillatorBlob)),
                context.audioWorklet.addModule(URL.createObjectURL(noiseBlob))
            ]);
            
            isInitialized.current = true;
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
            audioContext.current = null;
        }
    }, []);

    useEffect(() => {
        initializeAudio();
    }, [initializeAudio]);

    useSequencer(bpm, isLooping, isPlaying, audioContext, adsrNodes, audioNodes);

    const handlePlay = useCallback(async () => {
        if (isPlaying || !audioContext.current) return;
        if (!isInitialized.current) {
            await initializeAudio();
        }
        if (audioContext.current?.state === 'suspended') {
            audioContext.current.resume();
        }
        setIsPlaying(true);
    }, [isPlaying, initializeAudio]);

    const handleStop = useCallback(() => {
        if (!isPlaying || !audioContext.current) return;
        audioContext.current.suspend().then(() => {
            setIsPlaying(false);
        });
    }, [isPlaying]);

    useDeepCompareEffect(() => {
        if (!isPlaying || !audioContext.current) return;
        
        const { nodes: prevNodes, edges: prevEdges } = prevGraphState.current;
        const context = audioContext.current;

        // Handle node deletions
        prevNodes.forEach(node => {
            if (!nodes.find(n => n.id === node.id)) {
                const audioNode = audioNodes.current.get(node.id);
                if (audioNode) {
                    audioNode.disconnect();
                    audioNodes.current.delete(node.id);
                    if (node.type === 'adsr') adsrNodes.current.delete(node.id);
                }
            }
        });

        // Handle node additions and updates
        nodes.forEach(node => {
            const liveNode = audioNodes.current.get(node.id);
            if (!liveNode) {
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
            } else {
                const prevNode = prevNodes.find(p => p.id === node.id);

                if (liveNode instanceof Instrument) {
                    // Instruments are managed by their own update logic, which is sensitive to BPM changes as well.
                    liveNode.updateNodeData(node.data, bpm);
                } else if (prevNode && JSON.stringify(prevNode.data) !== JSON.stringify(node.data)) {
                    // For other nodes, we trigger an update if the node's data has changed.
                    const skaldNode = (liveNode as any)._skaldNode;
                    if (skaldNode && typeof skaldNode.update === 'function') {
                        skaldNode.update(node.data, { bpm });
                    }
                }
            }
        });
        
        // --- BPM Change Update ---
        // If BPM has changed, find all nodes with bpmSync enabled and force an update.
        if (bpm !== prevBpm.current) {
            nodes.forEach(node => {
                if (node.data?.bpmSync) {
                    const liveNode = audioNodes.current.get(node.id);
                    if (liveNode && !(liveNode instanceof Instrument)) {
                         const skaldNode = (liveNode as any)._skaldNode;
                         if (skaldNode && typeof skaldNode.update === 'function') {
                            skaldNode.update(node.data, { bpm });
                         }
                    }
                }
            });
        }

        // Handle edge deletions
        prevEdges.forEach(edge => {
            if (!edges.find(e => e.id === edge.id)) {
                const source = audioNodes.current.get(edge.source);
                const target = audioNodes.current.get(edge.target);
                if (source && target) {
                    const sourceNode = source instanceof Instrument ? source.output : (source as any).output || source;
                    
                    const targetSkaldNode = (target as any)._skaldNode;
                    if (targetSkaldNode && typeof targetSkaldNode.disconnectInput === 'function') {
                        targetSkaldNode.disconnectInput(sourceNode, edge.targetHandle || null, edge);
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
                    if (targetSkaldNode && typeof targetSkaldNode.connectInput === 'function') {
                        targetSkaldNode.connectInput(sourceNode, edge.targetHandle || null, edge);
                    } else {
                        const targetNode = target instanceof Instrument ? target.input : target;
                        connectNodes(sourceNode, targetNode, edge);
                    }
                }
            }
        });

        prevGraphState.current = { nodes, edges };
        prevBpm.current = bpm;

    }, [nodes, edges, isPlaying, bpm]);

    useEffect(() => {
        return () => {
            if (audioContext.current) {
                handleStop();
            }
        };
    }, [handleStop]);

    const previewNode = useCallback((nodeId: string) => {
        if (!audioContext.current) return;
        const context = audioContext.current;
        const now = context.currentTime;
    
        const reactFlowNode = nodes.find(n => n.id === nodeId);
        if (!reactFlowNode) return;
    
        const audioNode = audioNodes.current.get(nodeId);
        if (!audioNode) return;
        
        const nodeType = reactFlowNode.type;
    
        // Temporary master output for the preview, makes cleanup easy
        const previewOut = context.createGain();
        previewOut.connect(context.destination);
    
        const cleanup = (previewDuration: number) => {
            setTimeout(() => {
                previewOut.disconnect();
            }, previewDuration * 1000);
        };
    
        switch (nodeType) {
            case 'adsr': {
                const { attack = 0.1, decay = 0.1, release = 0.5 } = reactFlowNode.data;
                const gateOnDuration = attack + decay;
                const totalDuration = Math.min(attack + decay + release + 0.5, 10);
    
                const osc = new OscillatorNode(context, { frequency: 440, type: 'sawtooth' });
                const vca = new GainNode(context, { gain: 0 });
                
                audioNode.connect(vca.gain);
                osc.connect(vca);
                vca.connect(previewOut);
                osc.start(now);
                osc.stop(now + totalDuration);
    
                const adsrGate = (audioNode as any).gate;
                if (adsrGate) {
                    const trigger = new ConstantSourceNode(context, { offset: 0 });
                    trigger.offset.setValueAtTime(1, now);
                    trigger.offset.setValueAtTime(0, now + gateOnDuration);
                    trigger.connect(adsrGate);
                    trigger.start(now);
                    trigger.stop(now + totalDuration);
                }
    
                cleanup(totalDuration);
                break;
            }
    
            case 'oscillator':
            case 'wavetable':
            case 'fmOperator':
            case 'noise': {
                const sourceOutput = audioNode; 
                const vca = context.createGain();
                vca.gain.value = 0;
                
                const tempAdsr = new AudioWorkletNode(context, 'adsr-processor');
                const tempAdsrData = { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 };
                const { attack, decay, release } = tempAdsrData;
                const gateOnDuration = attack + decay;
                const totalDuration = attack + decay + release + 0.5;
    
                const adsrParams = tempAdsr.parameters;
                adsrParams.get('attack')?.setValueAtTime(tempAdsrData.attack, now);
                adsrParams.get('decay')?.setValueAtTime(tempAdsrData.decay, now);
                adsrParams.get('sustain')?.setValueAtTime(tempAdsrData.sustain, now);
                adsrParams.get('release')?.setValueAtTime(tempAdsrData.release, now);
    
                sourceOutput.connect(vca);
                tempAdsr.connect(vca.gain);
                vca.connect(previewOut);
    
                const trigger = new ConstantSourceNode(context, { offset: 0 });
                trigger.offset.setValueAtTime(1, now);
                trigger.offset.setValueAtTime(0, now + gateOnDuration);
                trigger.connect(tempAdsr);
                trigger.start(now);
                trigger.stop(now + totalDuration);
    
                cleanup(totalDuration);
                break;
            }
    
            case 'filter':
            case 'distortion':
            case 'delay':
            case 'reverb':
            case 'panner': {
                const osc = new OscillatorNode(context, { frequency: 440, type: 'sawtooth' });
                const vca = context.createGain();
                vca.gain.value = 0;
    
                const tempAdsr = new AudioWorkletNode(context, 'adsr-processor');
                const tempAdsrData = { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 };
                const { attack, decay, release } = tempAdsrData;
                const gateOnDuration = attack + decay;
                const totalDuration = attack + decay + release + 0.5;
    
                const adsrParams = tempAdsr.parameters;
                adsrParams.get('attack')?.setValueAtTime(tempAdsrData.attack, now);
                adsrParams.get('decay')?.setValueAtTime(tempAdsrData.decay, now);
                adsrParams.get('sustain')?.setValueAtTime(tempAdsrData.sustain, now);
                adsrParams.get('release')?.setValueAtTime(tempAdsrData.release, now);
                
                osc.connect(vca);
                vca.connect(audioNode);
                audioNode.connect(previewOut);
                tempAdsr.connect(vca.gain);
                osc.start(now);
                osc.stop(now + totalDuration);
                
                const trigger = new ConstantSourceNode(context, { offset: 0 });
                trigger.offset.setValueAtTime(1, now);
                trigger.offset.setValueAtTime(0, now + gateOnDuration);
                trigger.connect(tempAdsr);
                trigger.start(now);
                trigger.stop(now + totalDuration);
    
                cleanup(totalDuration);
                break;
            }
    
            default:
                console.log(`Preview not implemented for node type: ${nodeType}`);
                // No cleanup needed if nothing happens
                break;
        }
    }, [nodes]);

    return { isPlaying, handlePlay, handleStop, previewNode };
};