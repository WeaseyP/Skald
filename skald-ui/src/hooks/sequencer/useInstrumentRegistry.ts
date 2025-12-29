import { useEffect, useRef } from 'react';
import { Node } from 'reactflow';
import { useSequencerState } from './useSequencerState';

export const useInstrumentRegistry = (
    nodes: Node[],
    sequencerActions: ReturnType<typeof useSequencerState>
) => {
    // Keep track of processed IDs to avoid loops if needed, 
    // but the reducer in useSequencerState checks existence.

    useEffect(() => {
        const instrumentNodes = nodes.filter(n => n.type === 'instrument');
        const activeNodeIds = new Set(instrumentNodes.map(n => n.id));

        // 1. Add new tracks
        instrumentNodes.forEach(node => {
            const label = node.data?.label || node.data?.name || "Instrument";
            // Check if track exists is handled in addTrack, but we can check here too if we exposed tracks
            sequencerActions.addTrack(node.id, label);

            // Sync name if changed (this might be spammy if not careful, but useEffect dep is nodes)
            sequencerActions.updateTrackName(node.id, label);
        });

        // 2. Remove dead tracks
        // access tracks from actions? No, useSequencerState returns { tracks }
        const currentTracks = sequencerActions.tracks;
        currentTracks.forEach(track => {
            if (!activeNodeIds.has(track.targetNodeId)) {
                // If it's a persisted track but node is gone, remove it.
                // NOTE: This assumes we want to hard-delete tracks when nodes are deleted.
                sequencerActions.removeTrack(track.targetNodeId);
            }
        });

    }, [nodes, sequencerActions]);
};
