// src/components/Nodes/DistortionNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const distortionNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#ffc9c9', borderColor: '#e03131' };

const DistortionNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={distortionNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" />
      <div><strong>{data.label || 'Distortion'}</strong></div>
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
};

export const DistortionNode = memo(DistortionNodeComponent);
