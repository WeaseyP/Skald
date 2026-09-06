/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/ViewModeToggle.tsx                   |
|                                                                              |
| Roadmap F4 regression fix, item 3 — the explicit switch inside an open       |
| editor.                                                                     |
|                                                                              |
| SequencerDock now resolves which editor to open exactly ONCE, at the moment |
| "Edit" is clicked, and never again while that editor stays open (see        |
| SequencerDock.tsx's `editingView`) — otherwise painting notes into a fresh   |
| Piano Roll could silently swap it for the Drum Roll mid-session, which is    |
| the whole reported "piano roll doesn't work at all" regression. Freezing    |
| the resolution needs a way back for the one case it was serving: a track    |
| whose Auto guess the user wants to override without leaving the editor.      |
| This toggle is that way back — it writes the SAME `viewMode` field the      |
| TrackList row's Auto/Melodic/Percussive selector does (one field, one       |
| writer, `useSequencerState.ts::setTrackViewMode`), so the two controls can   |
| never disagree about what a track's stored preference is.                   |
================================================================================
*/
import React from 'react';
import { ResolvedTrackViewMode } from './trackViewMode';

interface ViewModeToggleProps {
    mode: ResolvedTrackViewMode;
    onChange: (mode: ResolvedTrackViewMode) => void;
}

const baseButtonStyle: React.CSSProperties = {
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '10px',
    border: '1px solid #444',
    color: '#ccc',
    backgroundColor: '#333',
};

const activeButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: '#007acc',
    color: '#fff',
    borderColor: '#007acc',
};

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => (
    <div
        role="group"
        aria-label="Editor view"
        style={{ display: 'flex', borderRadius: '3px', overflow: 'hidden' }}
    >
        <button
            type="button"
            data-testid="view-mode-toggle-piano"
            style={mode === 'melodic' ? activeButtonStyle : baseButtonStyle}
            onClick={() => onChange('melodic')}
            title="Piano Roll — a chromatic row per pitch"
        >
            Piano Roll
        </button>
        <button
            type="button"
            data-testid="view-mode-toggle-drum"
            style={{ ...(mode === 'percussive' ? activeButtonStyle : baseButtonStyle), borderLeft: 'none' }}
            onClick={() => onChange('percussive')}
            title="Drum Roll — one row at the track's canonical hit note"
        >
            Drum Roll
        </button>
    </div>
);
