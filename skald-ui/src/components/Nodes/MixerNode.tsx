// src/components/Nodes/MixerNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const mixerNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#e9ecef', borderColor: '#868e96' };

const MixerNodeComponent = ({ data }: NodeProps) => {
  const numInputs = data.inputCount || 4; // Default to 4 inputs if not specified
  const handles = [];
  for (let i = 1; i <= numInputs; i++) {
    handles.push( 
      <Handle 
        key={`input_${i}`}
        type="target" 
        position={Position.Left} 
        id={`input_${i}`} 
        style={{ top: `${(i / (numInputs + 1)) * 100}%` }} 
      />
    );
  }

  return (
    <div style={mixerNodeStyles}>
      {handles}
      <div><strong>{data.label || 'Mixer'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const MixerNode = memo(MixerNodeComponent);
