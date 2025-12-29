import React, { useState } from 'react';
import { SequencerToolbar } from './SequencerToolbar';
import { TrackList } from './TrackList';
import { StepGrid } from './StepGrid';
import { SequencerTrack, SequencerState } from '../../definitions/types';

interface SequencerDockProps {
    state: SequencerState;
    bpm: number;
    setBpm: (bpm: number) => void;
    // Actions
    onPlay: () => void;
    onStop: () => void;
    onToggleLoop: () => void;
    isLooping: boolean;
    // Track Actions
    onMuteToggle: (trackId: string) => void;
    onSoloToggle: (trackId: string) => void;
    onFocusTrack: (trackId: string) => void;
    onToggleStep: (trackId: string, step: number) => void;
}

const dockContainerStyles: React.CSSProperties = {
    // position: 'fixed', // REMOVED to allow Flexbox layout in App.tsx
    // bottom: 0,
    // left: 0,
    // right: 0,
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderTop: '1px solid #333',
    zIndex: 100, // Reduced from 1000
    display: 'flex',
    flexDirection: 'column',
    transition: 'height 0.2s ease-in-out',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.5)'
};

const contentAreaStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    overflow: 'hidden'
};

export const SequencerDock: React.FC<SequencerDockProps> = ({
    state,
    bpm,
    setBpm,
    onPlay,
    onStop,
    onToggleLoop,
    isLooping,
    onMuteToggle,
    onSoloToggle,
    onFocusTrack,
    onToggleStep
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Height: 40px (Toolbar only) vs 300px (Expanded)
    const height = isCollapsed ? '40px' : '300px';

    return (
        <div style={{ ...dockContainerStyles, height }}>
            <SequencerToolbar
                isPlaying={state.isPlaying}
                bpm={bpm}
                isLooping={isLooping}
                onPlay={onPlay}
                onStop={onStop}
                onBpmChange={setBpm}
                onLoopToggle={onToggleLoop}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            />

            {!isCollapsed && (
                <div style={contentAreaStyles}>
                    <TrackList
                        tracks={state.tracks}
                        onMuteToggle={onMuteToggle}
                        onSoloToggle={onSoloToggle}
                        onFocusTrack={onFocusTrack}
                    />
                    <StepGrid
                        tracks={state.tracks}
                        currentStep={state.currentStep}
                        steps={16}
                        onToggleStep={onToggleStep}
                    />
                </div>
            )}
        </div>
    );
};
