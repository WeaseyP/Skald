import React from 'react';
import { SequencerTrack } from '../../definitions/types';

interface TrackListProps {
    tracks: SequencerTrack[];
    onMuteToggle: (trackId: string) => void;
    onSoloToggle: (trackId: string) => void;
    onFocusTrack: (trackId: string) => void;
}

const listContainerStyles: React.CSSProperties = {
    width: '200px',
    backgroundColor: '#1E1E1E',
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'hidden' // Scrolling handled by parent or synced
};

const trackHeaderStyles: React.CSSProperties = {
    height: '30px', // Fixed row height
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #2A2A2A',
    padding: '0 5px',
    color: '#ccc',
    fontSize: '12px',
    backgroundColor: '#252526',
    boxSizing: 'border-box'
};

const iconBtnStyles: React.CSSProperties = {
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    cursor: 'pointer',
    width: '20px',
    height: '20px',
    padding: 0,
    fontSize: '10px',
    marginLeft: '3px',
    borderRadius: '2px'
};

const activeMuteStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#d9534f', color: 'white', borderColor: '#d9534f' };
const activeSoloStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#f0ad4e', color: 'black', borderColor: '#f0ad4e' };

export const TrackList: React.FC<TrackListProps> = ({ tracks, onMuteToggle, onSoloToggle, onFocusTrack }) => {
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
                </div>
            ))}
        </div>
    );
};
