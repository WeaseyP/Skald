import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const oscNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#d3f9d8' };

const OscillatorNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={oscNodeStyles}>
      <Handle type="target" position={Position.Left} id="input_freq" style={{ top: '33%' }} />
      <Handle type="target" position={Position.Left} id="input_amp" style={{ top: '66%' }}/>
      <div><strong>{data.label || 'Oscillator'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const OscillatorNode = memo(OscillatorNodeComponent);