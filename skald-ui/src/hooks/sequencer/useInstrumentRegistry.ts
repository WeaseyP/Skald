import { useEffect } from 'react';
import { Node } from '@xyflow/react';
import { NodeParams } from '../../definitions/types';
import { useSequencerState } from './useSequencerState';

/**
 * Keeps one sequencer track per Instrument node on the canvas.
 *
 * The track list is DERIVED state: it exists because an Instrument node does.
 * So this reconciliation never pushes its own undo entry — the graph edit that
 * added or removed the Instrument already pushed one, and that entry's snapshot
 * contains the tracks as they were before the edit. That is what makes one
 * Ctrl+Z after deleting an Instrument bring back the node AND its whole track
 * of notes (F-B01-3), instead of restoring a track whose node is still gone and
 * having this effect delete it again on the next tick.
 */
export const useInstrumentRegistry = (
    nodes: Node<NodeParams>[],
    sequencerActions: Pick<ReturnType<typeof useSequencerState>, 'syncInstrumentTracks'>
) => {
    const { syncInstrumentTracks } = sequencerActions;

    useEffect(() => {
        syncInstrumentTracks(
            nodes
                .filter(n => n.type === 'instrument')
                .map(n => ({
                    id: n.id,
                    name: (n.data?.label || n.data?.name || 'Instrument') as string,
                }))
        );
    }, [nodes, syncInstrumentTracks]);
};
