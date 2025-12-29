import React from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';

interface StepGridProps {
    tracks: SequencerTrack[];
    currentStep: number;
    steps: number; // usually 16
    onToggleStep: (trackId: string, step: number) => void;
}

const gridContainerStyles: React.CSSProperties = {
    flexGrow: 1,
    backgroundColor: '#1E1E1E',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative'
};

const rowStyles: React.CSSProperties = {
    height: '30px', // Matches TrackList header height
    display: 'flex',
    borderBottom: '1px solid #2A2A2A',
    boxSizing: 'border-box'
};

const cellStyles: React.CSSProperties = {
    flex: '0 0 40px', // Fixed width per step
    borderRight: '1px solid #2A2A2A',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const beatMarkerStyle: React.CSSProperties = {
    ...cellStyles,
    borderRight: '1px solid #444' // Every 4th step
};

const noteStyle: React.CSSProperties = {
    width: '90%',
    height: '80%',
    borderRadius: '2px',
    backgroundColor: '#007acc'
};

// Playhead overlay
const Playhead: React.FC<{ step: number }> = ({ step }) => {
    return (
        <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${step * 40}px`, // 40px per step
            width: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
            pointerEvents: 'none',
            zIndex: 10
        }} />
    );
};

export const StepGrid: React.FC<StepGridProps> = ({ tracks, currentStep, steps = 16, onToggleStep }) => {
    const stepArray = Array.from({ length: steps }, (_, i) => i);

    const isBeat = (step: number) => (step + 1) % 4 === 0;

    return (
        <div style={gridContainerStyles}>
            <Playhead step={currentStep} />

            {tracks.map(track => (
                <div key={track.id} style={rowStyles}>
                    {stepArray.map(step => {
                        const note = track.notes.find(n => n.step === step);
                        const hasNote = !!note;

                        return (
                            <div
                                key={step}
                                style={isBeat(step) ? beatMarkerStyle : cellStyles}
                                onClick={() => onToggleStep(track.id, step)}
                                onContextMenu={(e) => { e.preventDefault(); /* Future: Velocity edit */ }}
                            >
                                {hasNote && (
                                    <div style={{ ...noteStyle, backgroundColor: track.color || '#007acc', opacity: note!.velocity }} />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
