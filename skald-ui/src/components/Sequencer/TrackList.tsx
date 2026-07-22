import React from 'react';
import { NumberInput } from '../common/NumberInput';
import { SequencerTrack } from '../../definitions/types';

interface TrackListProps {
    tracks: SequencerTrack[];
    onMuteToggle: (trackId: string) => void;
    onSoloToggle: (trackId: string) => void;
    onFocusTrack: (trackId: string) => void;
    onUpdateSteps?: (trackId: string, steps: number) => void;
    onOpenPianoRoll?: (trackId: string) => void;
}

const listContainerStyles: React.CSSProperties = {
    width: '260px',
    backgroundColor: '#1E1E1E',
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'hidden' // Scrolling handled by parent or synced
};

const trackHeaderStyles: React.CSSProperties = {
    height: '34px', // Fixed row height (fits 24px hit targets)
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #2A2A2A',
    padding: '0 5px',
    color: '#ccc',
    fontSize: '12px',
    backgroundColor: '#252526',
    boxSizing: 'border-box'
};

// 24×24 minimum hit target (WCAG 2.2 / touch guidance) — these were 20px.
const iconBtnStyles: React.CSSProperties = {
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    padding: 0,
    fontSize: '11px',
    marginLeft: '3px',
    borderRadius: '2px'
};

const activeMuteStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#d9534f', color: 'white', borderColor: '#d9534f' };
const activeSoloStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#f0ad4e', color: 'black', borderColor: '#f0ad4e' };

export const TrackList: React.FC<TrackListProps> = ({ tracks, onMuteToggle, onSoloToggle, onFocusTrack, onUpdateSteps, onOpenPianoRoll }) => {
    return (
        <div style={listContainerStyles}>
            {tracks.map(track => (
                <div key={track.id} style={trackHeaderStyles}>
                    {/* Color Strip */}
                    <div style={{ width: '4px', height: '100%', backgroundColor: track.color, marginRight: '8px' }} />

                    {/* Name */}
                    <span
                        style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => onFocusTrack(track.id)}
                        title="Click to focus node in graph"
                    >
                        {track.name}
                    </span>

                    {/* Piano Roll Button */}
                    <button
                        style={{ ...iconBtnStyles, width: 'auto', padding: '0 4px', fontSize: '9px' }}
                        onClick={() => onOpenPianoRoll && onOpenPianoRoll(track.id)}
                        title="Open Piano Roll"
                    >
                        Edit
                    </button>

                    {/* Mute/Solo */}
                    <button
                        style={track.isMuted ? activeMuteStyle : iconBtnStyles}
                        onClick={() => onMuteToggle(track.id)}
                        title="Mute"
                    >
                        M
                    </button>
                    <button
                        style={track.isSolo ? activeSoloStyle : iconBtnStyles}
                        onClick={() => onSoloToggle(track.id)}
                        title="Solo"
                    >
                        S
                    </button>

                    {/* Steps Input */}
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: '5px' }}>
                        <label style={{ fontSize: '9px', color: '#666', marginRight: '2px' }}>Len</label>
                        <NumberInput
                            min={1}
                            max={64}
                            value={track.steps || 16}
                            onChange={(val) => {
                                if (onUpdateSteps) {
                                    onUpdateSteps(track.id, val);
                                }
                            }}
                            style={{ width: '35px', backgroundColor: '#333', color: '#ccc', border: '1px solid #444', fontSize: '10px', textAlign: 'center' }}
                            title="Track Length (Steps)"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};
