/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/node-handlers/useOscillatorHandler.ts    |
|                                                                              |
| This file contains the hook for handling oscillator node logic.              |
================================================================================
*/
import { useCallback } from 'react';
import { Node } from 'reactflow';
import { createOscillatorNode } from '../audioNodeFactory/createOscillatorNode';

type AudioNodeMap = Map<string, any>;

interface UseOscillatorHandlerArgs {
    audioContextRef: React.MutableRefObject<AudioContext | null>;
    audioNodes: React.MutableRefObject<AudioNodeMap>;
}

export const useOscillatorHandler = ({ audioContextRef, audioNodes }: UseOscillatorHandlerArgs) => {
    const create = useCallback((node: Node) => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

        const newAudioNode = createOscillatorNode(audioContext, node);
        audioNodes.current.set(node.id, newAudioNode);
    }, [audioContextRef, audioNodes]);

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
    }, [audioNodes]);

    return { create, update, remove };
};