import { createContext, useContext } from 'react';
import { NodeParams } from '../definitions/types';
import { BPM_DEFAULT } from '../definitions/bpm';

/**
 * Gives on-canvas node components (rendered inside React Flow) access to the
 * app's REAL state updater.
 *
 * The app renders a CONTROLLED ReactFlow — `nodes` come from useGraphState.
 * Node components must never write via `useReactFlow().setNodes()`: that
 * targets React Flow's internal store, which the audio engine, save/load and
 * codegen never read. Such edits are silently unheard/unsaved, and the next
 * state change stomps them visually.
 */
interface GraphActionsContextType {
    updateNodeData: (nodeId: string, data: Partial<NodeParams>, subNodeId?: string) => void;
    // Packet C7: the project tempo, so a node card can show what its sync
    // division resolves to. Optional because the provider predates it and
    // isolated renders have no tempo; readers fall back to BPM_DEFAULT.
    bpm?: number;
}
const GraphActionsContext = createContext<GraphActionsContextType | undefined>(undefined);
export const GraphActionsProvider = GraphActionsContext.Provider;
// Nullable on purpose: node components fall back to the React Flow store when
// rendered outside the app (isolated tests, storybook-style harnesses).
export const useGraphActions = () => useContext(GraphActionsContext);
/** The project tempo for display on node cards; BPM_DEFAULT outside the app. */
export const useProjectBpm = (): number => useContext(GraphActionsContext)?.bpm ?? BPM_DEFAULT;
