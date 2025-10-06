/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/node-handlers/useAdsrHandler.ts          |
|                                                                              |
| This file contains the hook for handling ADSR node logic.                    |
================================================================================
*/
import { useCallback } from 'react';
import { Node } from 'reactflow';
import { AdsrDataMap } from '../types';
import { AdsrParams } from '../../../definitions/types';

type AudioNodeMap = Map<string, AudioNode>;

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

        const masterNode: MasterAdsrNode = audioContext.createGain();
        const envelopeNode = audioContext.createGain();
        
        // The envelopeNode is what the sequencer will control
        envelopeNode.connect(masterNode);

        const data = node.data || { attack: 0.1, decay: 0.2, sustain: 0.5 };
        
        // The adsrNodes map stores the node that will be modulated by the sequencer
        adsrNodes.current.set(node.id, { gainNode: envelopeNode, data });
        
        // The audioNodes map stores the main connectable node
        // We also attach the internal envelope node so we can connect to it if needed
        masterNode.envelopeNode = envelopeNode;
        audioNodes.current.set(node.id, masterNode);

    }, [audioContextRef, audioNodes, adsrNodes]);

    const update = useCallback((node: Node<Partial<AdsrParams>>, prevNode: Node<Partial<AdsrParams>>) => {
        if (JSON.stringify(prevNode.data) === JSON.stringify(node.data)) {
            return;
        }
        
        const adsrEntry = adsrNodes.current.get(node.id);
        if (adsrEntry) {
            adsrEntry.data = node.data;
        }
    }, [adsrNodes]);

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