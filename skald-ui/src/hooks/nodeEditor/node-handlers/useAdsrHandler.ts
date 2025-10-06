/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/node-handlers/useAdsrHandler.ts          |
|                                                                              |
| This file contains the hook for handling ADSR node logic.                    |
================================================================================
*/
import { useCallback } from 'react';
import { Node } from 'reactflow';
import { createAdsrNode } from '../audioNodeFactory/createAdsrNode';
import { AdsrDataMap } from '../types';

type AudioNodeMap = Map<string, any>;

interface UseAdsrHandlerArgs {
    audioContextRef: React.MutableRefObject<AudioContext | null>;
    audioNodes: React.MutableRefObject<AudioNodeMap>;
    adsrNodes: React.MutableRefObject<AdsrDataMap>;
}

export const useAdsrHandler = ({ audioContextRef, audioNodes, adsrNodes }: UseAdsrHandlerArgs) => {
    const create = useCallback((node: Node) => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

        // Ensure we don't create a duplicate
        if (audioNodes.current.has(node.id)) return;

        const newAudioNode = createAdsrNode(audioContext, node, adsrNodes.current);
        audioNodes.current.set(node.id, newAudioNode);
    }, [audioContextRef, audioNodes, adsrNodes]);

    const update = useCallback((node: Node, prevNode: Node) => {
        const audioNode = audioNodes.current.get(node.id);
        if (!audioNode) return;

        const skaldNode = audioNode._skaldNode;
        if (skaldNode && typeof skaldNode.update === 'function') {
            if (JSON.stringify(prevNode.data) !== JSON.stringify(node.data)) {
                skaldNode.update(node.data);
            }
        }
    }, [audioNodes]);

    const remove = useCallback((node: Node) => {
        const audioNode = audioNodes.current.get(node.id);
        if (!audioNode) return;

        audioNode.disconnect();
        audioNodes.current.delete(node.id);
        adsrNodes.current.delete(node.id);
    }, [audioNodes, adsrNodes]);

    return { create, update, remove };
};