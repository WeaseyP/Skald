import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const gainNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#fff9db', borderColor: '#ffd43b' };

const GainNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={gainNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" style={{ top: '30%' }} />
      <Handle type="target" position={Position.Left} id="input_gain" style={{ top: '70%', background: '#ff6b6b' }} />
      <div><strong>{data.label || 'Gain'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const GainNode = memo(GainNodeComponent);
