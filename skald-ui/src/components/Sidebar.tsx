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

interface SidebarProps {
    onGenerate: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onGenerate }) => {
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
        <div style={{...nodeButtonStyles, borderColor: '#e8590c'}} onDragStart={(event) => onDragStart(event, 'output')} draggable>
          Graph Output
        </div>
      </div>
      <button style={generateButtonStyles} onClick={onGenerate}>
        Generate Code
      </button>
    </div>
  );
};

export default Sidebar;