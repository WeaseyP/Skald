import { createContext, useContext } from 'react';
import { NodeParams } from '../definitions/types';
import { BPM_DEFAULT } from '../definitions/bpm';
import { StereoAnalysers } from '../utils/meter';

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
    // E9 (roadmap 0.2 §9.4 item 3): the peak meter's stereo tap, reused
    // (not re-wired) so GraphOutputNode's correlation mode reads the same
    // pair PeakMeter already does — see useWasmAudioEngine's meterAnalysers.
    // Optional for the same reason bpm is: isolated renders have no engine.
    meterAnalysers?: StereoAnalysers | null;
}
const GraphActionsContext = createContext<GraphActionsContextType | undefined>(undefined);
export const GraphActionsProvider = GraphActionsContext.Provider;
// Nullable on purpose: node components fall back to the React Flow store when
// rendered outside the app (isolated tests, storybook-style harnesses).
export const useGraphActions = () => useContext(GraphActionsContext);
/** The project tempo for display on node cards; BPM_DEFAULT outside the app. */
export const useProjectBpm = (): number => useContext(GraphActionsContext)?.bpm ?? BPM_DEFAULT;
/** The peak meter's stereo tap, for GraphOutputNode's correlation-mode
 *  visualizer; null (not undefined) outside the app or before Play, so a
 *  caller can treat "no context" and "engine stopped" identically. */
export const useMeterAnalysers = (): StereoAnalysers | null => useContext(GraphActionsContext)?.meterAnalysers ?? null;
