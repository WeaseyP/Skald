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
    // Track Actions
    onMuteToggle: (trackId: string) => void;
    onSoloToggle: (trackId: string) => void;
    onFocusTrack: (trackId: string) => void;
    onToggleStep: (trackId: string, step: number) => void;
    onUpdateNote: (trackId: string, step: number, changes: Partial<any>) => void;
    onUpdateSteps: (trackId: string, steps: number) => void;
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

import { AudioVisualizer } from '../Visualization/AudioVisualizer';

export const SequencerDock: React.FC<SequencerDockProps & { analyserNode: AnalyserNode | null; masterGainNode: GainNode | null }> = ({
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
    onToggleStep,
    onUpdateNote,
    onUpdateSteps,
    analyserNode,
    masterGainNode
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [masterVolume, setMasterVolume] = useState(0.8);

    // Height: 40px (Toolbar only) vs 300px (Expanded)
    const height = isCollapsed ? '40px' : '300px';

    const handleMasterVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setMasterVolume(val);
        if (masterGainNode) {
            masterGainNode.gain.setTargetAtTime(val, masterGainNode.context.currentTime, 0.01);
        }
    };

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
                    {/* Master Section */}
                    <div style={{ width: '120px', backgroundColor: '#202020', borderRight: '1px solid #333', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', color: '#ccc' }}>MASTER</div>
                        <AudioVisualizer
                            analyser={analyserNode}
                            width={100}
                            height={60}
                            showSpectrum={true}
                            showOscilloscope={true}
                        />
                        <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
                            <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '2px' }}>Volume</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={masterVolume}
                                onChange={handleMasterVolumeChange}
                                style={{ width: '100%', cursor: 'pointer' }}
                                title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
                            />
                        </div>
                    </div>

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
                        onUpdateNote={onUpdateNote}
                        bpm={bpm}
                    />
                </div>
            )}
        </div>
    );
};
