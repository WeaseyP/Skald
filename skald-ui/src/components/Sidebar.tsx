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

const generateButtonStyles: React.CSSProperties = {
    marginTop: 'auto',
    padding: '12px',
    backgroundColor: '#228be6',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
}

const playButtonStyles: React.CSSProperties = {
    ...generateButtonStyles,
    backgroundColor: '#37b24d',
    marginTop: '10px',
};

const stopButtonStyles: React.CSSProperties = {
    ...generateButtonStyles,
    backgroundColor: '#f03e3e',
    marginTop: '10px',
};

const ioButtonStyles: React.CSSProperties = {
    ...generateButtonStyles,
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
}

const Sidebar: React.FC<SidebarProps> = ({ onGenerate, onPlay, onStop, isPlaying, onSave, onLoad }) => {
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
        <div style={nodeButtonStyles} onDragStart={(event) => onDragStart(event, 'filter')} draggable>
          Filter
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#40c057'}} onDragStart={(event) => onDragStart(event, 'noise')} draggable>
          Noise
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#fab005'}} onDragStart={(event) => onDragStart(event, 'adsr')} draggable>
          ADSR Envelope
        </div>
        <div style={{...nodeButtonStyles, borderColor: '#e8590c'}} onDragStart={(event) => onDragStart(event, 'output')} draggable>
          Graph Output
        </div>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <button style={generateButtonStyles} onClick={onGenerate}>
            Generate Code
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