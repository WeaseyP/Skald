import React, { useState } from 'react';
import { SequencerToolbar } from './SequencerToolbar';
import { TrackList } from './TrackList';
import { StepGrid } from './StepGrid';
import { SequencerTrack, SequencerState } from '../../definitions/types';

interface SequencerDockProps {
    state: SequencerState;
    bpm: number;
    setBpm: (bpm: number) => void;
    patternSteps: number;
    setPatternSteps: (steps: number) => void;
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
    onStepSelect: (trackId: string, step: number) => void;
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

// import { ActionSettings } from 'react-icons/ai'; // REMOVED

import { AudioVisualizer } from '../Visualization/AudioVisualizer';
import { PianoRoll } from './PianoRoll';
import { NumberInput } from '../common/NumberInput';
import { NoteEvent } from '../../definitions/types';



export const SequencerDock: React.FC<SequencerDockProps & { analyserNode: AnalyserNode | null; masterGainNode: GainNode | null }> = ({
    state,
    bpm,
    setBpm,
    patternSteps,
    setPatternSteps,
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
    onStepSelect,
    analyserNode,
    masterGainNode
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [masterVolume, setMasterVolume] = useState(0.8);
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null);

    const [height, setHeight] = useState(300);
    const [isResizing, setIsResizing] = useState(false);

    // Height: 40px (Toolbar only) vs Custom Height (Expanded)
    const currentHeight = isCollapsed ? 40 : height;

    const handleMasterVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setMasterVolume(val);
        if (masterGainNode) {
            console.log('[SequencerDock] Setting Master Gain:', val);
            masterGainNode.gain.setTargetAtTime(val, masterGainNode.context.currentTime, 0.01);
        } else {
            console.warn('[SequencerDock] Master Gain Node is missing!');
        }
    };

    // Sync volume when node becomes available
    React.useEffect(() => {
        if (masterGainNode) {
            console.log('[SequencerDock] Master Gain Node connected. Syncing volume:', masterVolume);
            masterGainNode.gain.setValueAtTime(masterVolume, masterGainNode.context.currentTime); // Use setValueAtTime for immediate sync
        } else {
            console.log('[SequencerDock] Master Gain Node is NULL');
        }
    }, [masterGainNode]); // masterVolume excluded to avoid reset loops if logic changes, though safe here.

    const editingTrack = state.tracks.find(t => t.id === editingTrackId);

    // Resize Handlers
    const startResizing = React.useCallback(() => setIsResizing(true), []);
    const stopResizing = React.useCallback(() => setIsResizing(false), []);
    const resize = React.useCallback((e: MouseEvent) => {
        if (isResizing) {
            // Calculate new height based on mouse position from bottom
            // Since it's fixed/flex at bottom, usually we do window.innerHeight - e.clientY
            // But here it seems to be just a div in clean layout. 
            // If it's `width: 100%`, `display: flex`, `flexDirection: column`...
            // Wait, previous styles had `transition: height`. Removing that if resizing.

            // NOTE: The previous styles had `bottom: 0`, but the user removed it to "allow Flexbox layout".
            // If it's in a flexbox, we might need to set `flexBasis` or exact `height`.

            // Let's assume for now we just set pixels.
            // In a typical "bottom dock" scenario, moving mouse UP increases height.
            // e.movementY < 0 => increase height
            setHeight(h => Math.max(150, Math.min(800, h - e.movementY)));
        }
    }, [isResizing]);

    React.useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return (
        <div style={{ ...dockContainerStyles, height: `${currentHeight}px`, transition: isResizing ? 'none' : 'height 0.2s ease-in-out', position: 'relative' }}>
            {/* Resize Handle */}
            {!isCollapsed && (
                <div
                    onMouseDown={startResizing}
                    style={{
                        position: 'absolute',
                        top: -5, // Extend slightly above to capturing hovering easily
                        left: 0,
                        right: 0,
                        height: '10px',
                        zIndex: 101, // Above everything
                        cursor: 'row-resize',
                        backgroundColor: 'transparent' // Invisible hit area
                    }}
                />
            )}

            <SequencerToolbar
                isPlaying={state.isPlaying}
                bpm={bpm}
                isLooping={isLooping}
                onPlay={onPlay}
                onStop={onStop}
                onBpmChange={setBpm}
                patternSteps={patternSteps}
                onPatternStepsChange={setPatternSteps}
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
                        onUpdateSteps={onUpdateSteps}
                        onOpenPianoRoll={setEditingTrackId}
                    />

                    <div style={{ flexGrow: 1, position: 'relative' }}>
                        <StepGrid
                            tracks={state.tracks}
                            currentStep={state.currentStep}
                            steps={patternSteps}
                            onToggleStep={onToggleStep}
                            onUpdateNote={onUpdateNote}
                            bpm={bpm}
                            onStepContext={(trackId, step, x, y) => onStepSelect(trackId, step)}
                        />

                        {editingTrack && (
                            <PianoRoll
                                track={editingTrack}
                                onUpdateNote={onUpdateNote}
                                onToggleStep={onToggleStep}
                                currentStep={state.currentStep}
                                steps={editingTrack.steps || 16}
                                onClose={() => setEditingTrackId(null)}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

