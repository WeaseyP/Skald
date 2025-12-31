/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/node-handlers/useAdsrHandler.ts          |
|                                                                              |
| This file contains the hook for handling ADSR node logic.                    |
================================================================================
*/
import { useCallback } from 'react';
import { Node } from 'reactflow';
import { AdsrDataMap, AudioNodeMap } from '../types';
import { AdsrParams } from '../../../definitions/types';

interface MasterAdsrNode extends GainNode {
    envelopeNode?: GainNode;
}

interface UseAdsrHandlerArgs {
    audioContextRef: React.MutableRefObject<AudioContext | null>;
    audioNodes: React.MutableRefObject<AudioNodeMap>;
    adsrNodes: React.MutableRefObject<AdsrDataMap>;
}

export const useAdsrHandler = ({ audioContextRef, audioNodes, adsrNodes }: UseAdsrHandlerArgs) => {
    const create = useCallback((node: Node<Partial<AdsrParams>>) => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

        if (audioNodes.current.has(node.id)) return;

        // VCA pattern: Audio flows through this GainNode
        const masterNode = audioContext.createGain();
        masterNode.gain.value = 0; // Controlled by envelope

        // Envelope Generator: The Worklet
        const envelopeNode = new AudioWorkletNode(audioContext, 'adsr-processor');

        // Connect Envelope -> VCA Gain
        envelopeNode.connect(masterNode.gain);

        const data = node.data || { attack: 0.1, decay: 0.2, sustain: 0.5 };

        // Initialize params
        envelopeNode.parameters.get('attack')?.setValueAtTime(data.attack ?? 0.1, audioContext.currentTime);
        envelopeNode.parameters.get('decay')?.setValueAtTime(data.decay ?? 0.1, audioContext.currentTime);
        envelopeNode.parameters.get('sustain')?.setValueAtTime(data.sustain ?? 0.5, audioContext.currentTime);
        envelopeNode.parameters.get('release')?.setValueAtTime(data.release ?? 0.5, audioContext.currentTime);
        envelopeNode.parameters.get('depth')?.setValueAtTime(data.depth ?? 1.0, audioContext.currentTime);
        envelopeNode.parameters.get('loop')?.setValueAtTime(data.loop ? 1 : 0, audioContext.currentTime);

        // Store the worklet for the sequencer to trigger via 'gate' param
        adsrNodes.current.set(node.id, { worklet: envelopeNode });

        // Store the VCA as the main audio node
        (masterNode as any).envelopeNode = envelopeNode; // Keep ref for cleanup
        (masterNode as any).output = envelopeNode; // Expose internal envelope as the 'output' source
        audioNodes.current.set(node.id, masterNode);

    }, [audioContextRef, audioNodes, adsrNodes]);

    const update = useCallback((node: Node<Partial<AdsrParams>>, prevNode: Node<Partial<AdsrParams>>) => {
        if (JSON.stringify(prevNode.data) === JSON.stringify(node.data)) {
            return;
        }

        const adsrEntry = adsrNodes.current.get(node.id);
        if (adsrEntry) {
            const { worklet } = adsrEntry;
            const data = node.data;
            const now = audioContextRef.current?.currentTime || 0;

            if (data) {
                // Parameter updates
                if (data.attack !== undefined) worklet.parameters.get('attack')?.setValueAtTime(data.attack, now);
                if (data.decay !== undefined) worklet.parameters.get('decay')?.setValueAtTime(data.decay, now);
                if (data.sustain !== undefined) worklet.parameters.get('sustain')?.setValueAtTime(data.sustain, now);
                if (data.release !== undefined) worklet.parameters.get('release')?.setValueAtTime(data.release, now);
                if (data.depth !== undefined) worklet.parameters.get('depth')?.setValueAtTime(data.depth, now);
                if (data.loop !== undefined) worklet.parameters.get('loop')?.setValueAtTime(data.loop ? 1 : 0, now);


            }
        }
    }, [adsrNodes, audioContextRef]);

    const remove = useCallback((node: Node) => {
        const audioNode = audioNodes.current.get(node.id) as MasterAdsrNode;
        if (!audioNode) return;

        // Disconnect the master node and the internal envelope node
        audioNode.disconnect();
        if (audioNode.envelopeNode) {
            audioNode.envelopeNode.disconnect();
        }

        audioNodes.current.delete(node.id);
        adsrNodes.current.delete(node.id);
    }, [audioNodes, adsrNodes]);

    return { create, update, remove };
};