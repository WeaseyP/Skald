import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const delayNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#fff9db', borderColor: '#f08c00' };

const DelayNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={delayNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" />
      <div><strong>{data.label || 'Delay'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const DelayNode = memo(DelayNodeComponent);