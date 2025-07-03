// src/components/Sidebar.tsx

import React from 'react';

const sidebarStyles: React.CSSProperties = {
  padding: '15px',
  borderRight: '1px solid #ddd',
  display: 'flex',
  flexDirection: 'column'
};

const nodeButtonStyles: React.CSSProperties = {
    border: '2px solid #777',
    padding: '10px',
    borderRadius: '5px',
    backgroundColor: '#fff',
    cursor: 'grab',
    textAlign: 'center',
    marginBottom: '10px'
}

const actionButtonStyles: React.CSSProperties = {
    marginTop: 'auto',
    padding: '12px',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box'
}

const generateButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#228be6',
}

const createInstrumentButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#15aabf',
    marginTop: '10px',
};

const createGroupButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#868e96',
    marginTop: '10px',
};

const playButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#37b24d',
    marginTop: '10px',
};

const stopButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#f03e3e',
    marginTop: '10px',
};

const ioButtonStyles: React.CSSProperties = {
    ...actionButtonStyles,
    backgroundColor: '#868e96',
    marginTop: '10px',
};

interface SidebarProps {
    onGenerate: () => void;
    onPlay: () => void;
    onStop: () => void;
    isPlaying: boolean;
    onSave: () => void;
    onLoad: () => void;
    onCreateInstrument: () => void;
    onCreateGroup: () => void;
    canCreateInstrument: boolean; // This can be reused for groups
}

const Sidebar: React.FC<SidebarProps> = ({ 
    onGenerate, 
    onPlay, 
    onStop, 
    isPlaying, 
    onSave, 
    onLoad,
    onCreateInstrument,
    onCreateGroup,
    canCreateInstrument
}) => {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };


  return (
    <div style={sidebarStyles}>
      <div>
        <h2>Node Library</h2>
        <div style={nodeButtonStyles} onDragStart={(event) => onDragStart(event, 'oscillator')} draggable>
          Oscillator
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#be4bdb'}} onDragStart={(event) => onDragStart(event, 'lfo')} draggable>
          LFO
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#be4bdb'}} onDragStart={(event) => onDragStart(event, 'sampleHold')} draggable>
          Sample & Hold
        </div>
        <div style={nodeButtonStyles} onDragStart={(event) => onDragStart(event, 'filter')} draggable>
          Filter
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#40c057'}} onDragStart={(event) => onDragStart(event, 'noise')} draggable>
          Noise
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#fab005'}} onDragStart={(event) => onDragStart(event, 'adsr')} draggable>
          ADSR Envelope
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#f08c00'}} onDragStart={(event) => onDragStart(event, 'delay')} draggable>
          Delay/Echo
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#e03131'}} onDragStart={(event) => onDragStart(event, 'distortion')} draggable>
          Distortion
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#4c6ef5'}} onDragStart={(event) => onDragStart(event, 'reverb')} draggable>
          Reverb
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#868e96'}} onDragStart={(event) => onDragStart(event, 'mixer')} draggable>
          Mixer
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#74c0fc'}} onDragStart={(event) => onDragStart(event, 'panner')} draggable>
          Panner
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#e8590c'}} onDragStart={(event) => onDragStart(event, 'output')} draggable>
          Graph Output
        </div>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <button style={generateButtonStyles} onClick={onGenerate}>
            Generate Code
        </button>
        <button 
            style={{
                ...createGroupButtonStyles, 
                cursor: canCreateInstrument ? 'pointer' : 'not-allowed',
                opacity: canCreateInstrument ? 1 : 0.5
            }} 
            onClick={onCreateGroup}
            disabled={!canCreateInstrument}
            title={canCreateInstrument ? "Group selected nodes for organization" : "Select 2 or more nodes to create a group"}
        >
            Create Group
        </button>
        <button 
            style={{
                ...createInstrumentButtonStyles, 
                cursor: canCreateInstrument ? 'pointer' : 'not-allowed',
                opacity: canCreateInstrument ? 1 : 0.5
            }} 
            onClick={onCreateInstrument}
            disabled={!canCreateInstrument}
            title={canCreateInstrument ? "Group selected nodes into a reusable instrument" : "Select 2 or more nodes to create an instrument"}
        >
            Create Instrument
        </button>
        {!isPlaying ? (
            <button style={playButtonStyles} onClick={onPlay}>
                Play
            </button>
        ) : (
            <button style={stopButtonStyles} onClick={onStop}>
                Stop
            </button>
        )}
        <button style={ioButtonStyles} onClick={onSave}>
            Save Graph
        </button>
        <button style={ioButtonStyles} onClick={onLoad}>
            Load Graph
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
