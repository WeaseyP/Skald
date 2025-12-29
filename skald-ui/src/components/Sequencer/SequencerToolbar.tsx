import React from 'react';

interface SequencerToolbarProps {
    isPlaying: boolean;
    bpm: number;
    isLooping: boolean;
    onPlay: () => void;
    onStop: () => void;
    onBpmChange: (bpm: number) => void;
    onLoopToggle: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const toolbarStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '40px',
    backgroundColor: '#333',
    borderBottom: '1px solid #1A1A1A',
    padding: '0 10px',
    color: '#eee',
    fontFamily: 'sans-serif',
    fontSize: '12px',
    gap: '15px'
};

const buttonStyles: React.CSSProperties = {
    backgroundColor: '#444',
    border: 'none',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    textTransform: 'uppercase',
    fontWeight: 600
};

const activeButtonStyle: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: '#007acc',
};

const inputStyles: React.CSSProperties = {
    backgroundColor: '#222',
    border: '1px solid #444',
    color: 'white',
    width: '50px',
    padding: '2px 5px',
    borderRadius: '3px',
    textAlign: 'center'
};

export const SequencerToolbar: React.FC<SequencerToolbarProps> = ({
    isPlaying,
    bpm,
    isLooping,
    onPlay,
    onStop,
    onBpmChange,
    onLoopToggle,
    isCollapsed,
    onToggleCollapse
}) => {
    return (
        <div style={toolbarStyles}>
            <button
                style={buttonStyles}
                onClick={onToggleCollapse}
                title={isCollapsed ? "Expand" : "Collapse"}
            >
                {isCollapsed ? "▲" : "▼"}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button
                    style={isPlaying ? activeButtonStyle : buttonStyles}
                    onClick={onPlay}
                >
                    Play
                </button>
                <button style={buttonStyles} onClick={onStop}>Stop</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>BPM:</label>
                <input
                    type="number"
                    value={bpm}
                    onChange={(e) => onBpmChange(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
                    style={inputStyles}
                />
            </div>

            <button
                style={isLooping ? activeButtonStyle : buttonStyles}
                onClick={onLoopToggle}
            >
                Loop
            </button>

            <div style={{ flexGrow: 1 }} />

            <div style={{ opacity: 0.5 }}>
                Master Transport
            </div>
        </div>
    );
};
