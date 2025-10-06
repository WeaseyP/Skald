/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useAudioEngine.v2.ts                     |
|                                                                              |
| This file contains the second version of the audio engine hook, which will   |
| be implemented using the "Strangler Fig" pattern. This new hook will         |
| incrementally take over the responsibilities of the original audio engine, |
| starting with the Oscillator node.                                           |
================================================================================
*/
import { useCallback } from 'react';
import { Node } from 'reactflow';
import { createOscillatorNode } from './audioNodeFactory/createOscillatorNode';

// A map to hold the managed audio nodes, keyed by their React Flow node ID.
type AudioNodeMap = Map<string, any>;

// Arguments for the v2 engine hook.
interface UseAudioEngineV2Args {
    audioContextRef: React.MutableRefObject<AudioContext | null>;
    audioNodes: React.MutableRefObject<AudioNodeMap>;
}

/**
 * The second version of the audio engine, designed to incrementally
 * replace the original engine's functionality.
 */
export const useAudioEngineV2 = ({ audioContextRef, audioNodes }: UseAudioEngineV2Args) => {

    /**
     * Creates a new audio node instance based on a React Flow node.
     * @param {Node} node - The React Flow node to create the audio node for.
     */
    const createNode = useCallback((node: Node) => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

        // For now, this hook only handles oscillators.
        if (node.type === 'oscillator') {
            const newAudioNode = createOscillatorNode(audioContext, node);
            audioNodes.current.set(node.id, newAudioNode);
        }
    }, [audioContextRef, audioNodes]);

    /**
     * Updates an existing audio node with new data.
     * @param {Node} node - The React Flow node with updated data.
     * @param {any} prevNode - The previous state of the React Flow node.
     */
    const updateNode = useCallback((node: Node, prevNode: Node) => {
        const audioNode = audioNodes.current.get(node.id);
        if (!audioNode) return;

        if (node.type === 'oscillator') {
            const skaldNode = audioNode._skaldNode;
            if (skaldNode && typeof skaldNode.update === 'function') {
                if (JSON.stringify(prevNode.data) !== JSON.stringify(node.data)) {
                    skaldNode.update(node.data);
                }
            }
        }
    }, [audioNodes]);

    /**
     * Deletes an audio node from the engine.
     * @param {Node} node - The React Flow node to delete.
     */
    const deleteNode = useCallback((node: Node) => {
        const audioNode = audioNodes.current.get(node.id);
        if (!audioNode) return;

        if (node.type === 'oscillator') {
            audioNode.disconnect();
            audioNodes.current.delete(node.id);
        }
    }, [audioNodes]);

    return {
        createNode,
        updateNode,
        deleteNode,
    };
};