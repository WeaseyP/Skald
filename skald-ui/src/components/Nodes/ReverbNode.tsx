import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const reverbNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#dbe4ff', borderColor: '#4c6ef5' };

const ReverbNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={reverbNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" />
      <div><strong>{data.label || 'Reverb'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const ReverbNode = memo(ReverbNodeComponent);