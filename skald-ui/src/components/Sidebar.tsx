import React from 'react';

// --- STYLES ---

const sidebarStyles: React.CSSProperties = {
    padding: '15px',
    fontFamily: 'sans-serif',
    color: '#E0E0E0',
    height: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
};

const titleStyles: React.CSSProperties = {
    fontSize: '1.5em',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#FFFFFF',
};

const sectionTitleStyles: React.CSSProperties = {
    fontSize: '1.1em',
    fontWeight: '600',
    marginTop: '20px',
    marginBottom: '10px',
    color: '#a0aec0',
    borderBottom: '1px solid #4A5568',
    paddingBottom: '5px',
};

const nodeStyles: React.CSSProperties = {
    padding: '10px',
    marginBottom: '10px',
    borderRadius: '5px',
    background: '#384252',
    border: '1px solid #4A5568',
    cursor: 'grab',
    textAlign: 'center',
};

const buttonStyles: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '5px',
    border: 'none',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '5px',
    transition: 'background-color 0.2s',
};

const primaryButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#3182CE',
};

const secondaryButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#4A5568',
};

const activeLoopButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#2F855A', // A green color to indicate it's active
};

const disabledButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#4A5568',
    opacity: 0.5,
    cursor: 'not-allowed',
};

const bpmInputStyles: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    outline: 'none',
    textAlign: 'center',
    fontSize: '1.2em',
};

// --- PROPS INTERFACE ---

interface SidebarProps {
    onGenerate: () => void;
    onPlay: () => void;
    onStop: () => void;
    isPlaying: boolean;
    onSave: () => void;
    onLoad: () => void;
    onCreateInstrument: () => void;
    onCreateGroup: () => void;
    canCreateInstrument: boolean;
    bpm: number;
    onBpmChange: (newBpm: number) => void;
    isLooping: boolean;
    onLoopToggle: () => void;
}


// --- MAIN COMPONENT ---

const Sidebar: React.FC<SidebarProps> = ({ 
    onGenerate, 
    onPlay, 
    onStop, 
    isPlaying,
    onSave,
    onLoad,
    onCreateInstrument,
    onCreateGroup,
    canCreateInstrument,
    bpm,
    onBpmChange,
    isLooping,
    onLoopToggle,
}) => {

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div style={sidebarStyles}>
            <h1 style={titleStyles}>Skald</h1>

            <div>
                <h2 style={sectionTitleStyles}>Global</h2>
                <label style={{display: 'block', textAlign: 'center', marginBottom: '5px'}}>BPM</label>
                <input 
                    type="number" 
                    value={bpm} 
                    onChange={(e) => onBpmChange(parseInt(e.target.value, 10))}
                    style={bpmInputStyles}
                    min="20"
                    max="300"
                />
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Graph Actions</h2>
                <button style={primaryButtonStyles} onClick={onGenerate}>Generate</button>
                {!isPlaying ? (
                    <button style={secondaryButtonStyles} onClick={onPlay}>Play</button>
                ) : (
                    <button style={{...secondaryButtonStyles, background: '#C53030'}} onClick={onStop}>Stop</button>
                )}
                <button 
                    style={isLooping ? activeLoopButtonStyles : secondaryButtonStyles} 
                    onClick={onLoopToggle}
                >
                    {isLooping ? 'Looping' : 'Loop'}
                </button>
                <button style={secondaryButtonStyles} onClick={onSave}>Save</button>
                <button style={secondaryButtonStyles} onClick={onLoad}>Load</button>
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Grouping</h2>
                <button 
                    style={canCreateInstrument ? secondaryButtonStyles : disabledButtonStyles} 
                    onClick={onCreateInstrument}
                    disabled={!canCreateInstrument}
                    title={canCreateInstrument ? "Group selected nodes into a reusable instrument" : "Select 2 or more nodes to create an instrument"}
                >
                    Create Instrument
                </button>
                <button 
                    style={canCreateInstrument ? secondaryButtonStyles : disabledButtonStyles} 
                    onClick={onCreateGroup}
                    disabled={!canCreateInstrument}
                    title={canCreateInstrument ? "Group selected nodes visually" : "Select 2 or more nodes to create a group"}
                >
                    Create Group
                </button>
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Nodes</h2>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'oscillator')} draggable>Oscillator</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'noise')} draggable>Noise</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'lfo')} draggable>LFO</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'sampleHold')} draggable>S & H</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'fmOperator')} draggable>FM Operator</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'wavetable')} draggable>Wavetable</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'adsr')} draggable>ADSR</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'filter')} draggable>Filter</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'delay')} draggable>Delay</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'reverb')} draggable>Reverb</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'distortion')} draggable>Distortion</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'mixer')} draggable>Mixer</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'panner')} draggable>Panner</div>
                <div style={nodeStyles} onDragStart={(event) => onDragStart(event, 'output')} draggable>Output</div>
            </div>
        </div>
    );
};

export default Sidebar;
