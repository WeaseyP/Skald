/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useVisualizerModePreference.ts           |
|                                                                              |
| E9 (roadmap 0.2 §9.4 item 3): which of AudioVisualizer's four modes an      |
| Output node shows. A view preference, not a document field — it does not    |
| travel with the save file and must never go through pushHistory (undoing a |
| graph edit should not also flip what the scope is showing). Persisted in    |
| localStorage only so it survives a reload, the same defensive read/write    |
| pattern as useSnapToGridPreference (E6) — localStorage can throw in         |
| restrictive contexts and a display toggle is not worth crashing the editor  |
| over.                                                                       |
================================================================================
*/
import { useCallback, useState } from 'react';
import { VisualizerMode } from '../../components/Visualization/AudioVisualizer';

const VISUALIZER_MODE_KEY = 'skald.visualizer.mode';
const DEFAULT_MODE: VisualizerMode = 'oscilloscope';
const VALID_MODES: readonly VisualizerMode[] = ['oscilloscope', 'spectrum', 'spectrogram', 'correlation'];

const isVisualizerMode = (value: string | null): value is VisualizerMode =>
    value !== null && (VALID_MODES as readonly string[]).includes(value);

const readStoredPreference = (): VisualizerMode => {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_MODE;
        const stored = localStorage.getItem(VISUALIZER_MODE_KEY);
        return isVisualizerMode(stored) ? stored : DEFAULT_MODE;
    } catch {
        return DEFAULT_MODE;
    }
};

export const useVisualizerModePreference = (): [VisualizerMode, (next: VisualizerMode) => void] => {
    const [mode, setModeState] = useState<VisualizerMode>(readStoredPreference);

    const setMode = useCallback((next: VisualizerMode) => {
        setModeState(next);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(VISUALIZER_MODE_KEY, next);
            }
        } catch {
            // Restrictive context: the toggle still works for this session,
            // it just won't survive a reload.
        }
    }, []);

    return [mode, setMode];
};
