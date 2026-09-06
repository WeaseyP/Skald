import React, { useState } from 'react';
import { SequencerToolbar } from './SequencerToolbar';
import { TrackList } from './TrackList';
import { StepGrid } from './StepGrid';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack, SequencerState , NoteEvent } from '../../definitions/types';
import { TrackViewMode, resolveTrackViewMode } from './trackViewMode';

interface SequencerDockProps {
    state: SequencerState;
    // F4: the canvas, only so a track can be matched to its Instrument node
    // and the view mode resolved. The dock reads no other node data.
    nodes: Node<NodeParams>[];
    // True while a preview build (Play or a hot-swap rebuild) is running —
    // drives the small status pip next to Play/Stop (roadmap A7 item 3).
    isBuilding: boolean;
    bpm: number;
    setBpm: (bpm: number) => void;
    patternSteps: number;
    setPatternSteps: (steps: number) => void;
    // Master volume is OWNED by the app (it's exported into the generated
    // code and persisted in saves), not by this dock — when it was local
    // state here, Generate-while-stopped baked a hardcoded 0.8 instead of
    // the slider value.
    masterVolume: number;
    setMasterVolume: (volume: number) => void;
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
    onToggleStep: (trackId: string, step: number, notePitch?: number) => void;
    // Right-click erase on a grid row: the row has no pitch axis, so it clears
    // the step rather than deleting one arbitrary chord member (SKB-025).
    onClearStep: (trackId: string, step: number) => void;
    onUpdateNote: (trackId: string, step: number, changes: Partial<any>, notePitch?: number) => void;
    onUpdateSteps: (trackId: string, steps: number) => void;
    // notePitch: which note of the step the selection refers to.
    onStepSelect: (trackId: string, step: number, notePitch: number) => void;
    // F4: the per-track Auto/Melodic/Percussive override, stored on the track
    // and therefore pushed onto the editor history like any other track edit.
    onSetTrackViewMode: (trackId: string, viewMode: TrackViewMode) => void;
    // F2: the canonical hit note the Drum Roll paints at.
    onSetTrackDefaultNote: (trackId: string, note: number) => void;
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
import { PeakMeter } from '../Visualization/PeakMeter';
import { useVisualizerModePreference } from '../../hooks/nodeEditor/useVisualizerModePreference';
import { StereoAnalysers } from '../../utils/meter';
import { PianoRoll } from './PianoRoll';
import { DrumRoll } from './DrumRoll';
import { NumberInput } from '../common/NumberInput';




export const SequencerDock: React.FC<SequencerDockProps & { analyserNode: AnalyserNode | null; meterAnalysers: StereoAnalysers | null }> = ({
    state,
    nodes,
    isBuilding,
    bpm,
    setBpm,
    patternSteps,
    setPatternSteps,
    masterVolume,
    setMasterVolume,
    onPlay,
    onStop,
    onToggleLoop,
    isLooping,
    onMuteToggle,
    onSoloToggle,
    onFocusTrack,
    onToggleStep,
    onClearStep,
    onUpdateNote,
    onUpdateSteps,
    onStepSelect,
    onSetTrackViewMode,
    onSetTrackDefaultNote,
    analyserNode,
    meterAnalysers
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
    // E9 (roadmap 0.2 §9.4 item 3): same persisted mode preference the
    // per-Output-node visualizer uses — one app-wide setting, not a second
    // one that could disagree about which mode "the visualizer" means.
    const [visualizerMode, setVisualizerMode] = useVisualizerModePreference();

    const [height, setHeight] = useState(300);
    const [isResizing, setIsResizing] = useState(false);

    // Height: 40px (Toolbar only) vs Custom Height (Expanded)
    const currentHeight = isCollapsed ? 40 : height;

    // setMasterVolume alone is now the whole story: it updates the document's
    // session state, which useWasmAudioEngine reads and pushes live into the
    // running module via skald_set_master_volume (inside the DSP graph, at
    // the export's exact mix point). There is no second, dock-owned audio
    // path anymore — that JS GainNode workaround was SKB-011 (BUGS.md):
    // preview applied the fader AFTER the worklet while export applies it
    // INSIDE it, and since tanh is concave the two only ever agreed at
    // vol∈{0,1}.
    const handleMasterVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMasterVolume(parseFloat(e.target.value));
    };

    const editingTrack = state.tracks.find(t => t.id === editingTrackId);

    // F4: which editor "Edit" opens. The decision is trackViewMode.ts's alone —
    // the dock resolves, it does not detect, so the row's selector and this
    // dispatch can never disagree about whether a track is percussive and
    // leave it editable in neither view.
    const editingInstrument = editingTrack
        ? nodes.find(n => n.id === editingTrack.targetNodeId) ?? null
        : null;
    const editingViewMode = editingTrack ? resolveTrackViewMode(editingTrack, editingInstrument) : null;

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
                isBuilding={isBuilding}
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
                            stereoAnalysers={meterAnalysers}
                            width={100}
                            height={60}
                            mode={visualizerMode}
                            onModeChange={setVisualizerMode}
                        />
                        {/* Packet B10: stereo peak-hold meter + clip LED, tapped
                            from the worklet output — what the export produces. */}
                        <div style={{ marginTop: '8px' }}>
                            <PeakMeter analysers={meterAnalysers} width={100} height={40} />
                        </div>
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
                        onSetViewMode={onSetTrackViewMode}
                    />

                    <div style={{ flexGrow: 1, position: 'relative' }}>
                        <StepGrid
                            tracks={state.tracks}
                            currentStep={state.currentStep}
                            steps={patternSteps}
                            onToggleStep={onToggleStep}
                            onClearStep={onClearStep}
                            onUpdateNote={onUpdateNote}
                            bpm={bpm}
                            onStepContext={(trackId, step, notePitch) => onStepSelect(trackId, step, notePitch)}
                        />

                        {editingTrack && editingViewMode === 'percussive' && (
                            <DrumRoll
                                track={editingTrack}
                                currentStep={state.currentStep}
                                steps={editingTrack.steps || 16}
                                patternSteps={patternSteps}
                                bpm={bpm}
                                onToggleStep={onToggleStep}
                                onClearStep={onClearStep}
                                onUpdateNote={onUpdateNote}
                                onSelectNote={onStepSelect}
                                onSetDefaultNote={onSetTrackDefaultNote}
                                onClose={() => setEditingTrackId(null)}
                            />
                        )}

                        {editingTrack && editingViewMode === 'melodic' && (
                            <PianoRoll
                                track={editingTrack}
                                onUpdateNote={onUpdateNote}
                                onToggleStep={onToggleStep}
                                currentStep={state.currentStep}
                                steps={editingTrack.steps || 16}
                                patternSteps={patternSteps}
                                onClose={() => setEditingTrackId(null)}
                                // E3: the same selection callback StepGrid feeds through
                                // onStepContext, so a note picked in the roll opens the
                                // same Step Properties panel a grid click would.
                                onSelectNote={onStepSelect}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

