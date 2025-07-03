// src/components/Nodes/PannerNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const pannerNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#e7f5ff', borderColor: '#74c0fc' };

const PannerNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={pannerNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" />
      <div><strong>{data.label || 'Panner'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const PannerNode = memo(PannerNodeComponent);
