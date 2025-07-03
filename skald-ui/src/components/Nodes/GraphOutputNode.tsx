import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const outputNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#ffe8cc', borderColor: '#e8590c' };

const GraphOutputNodeComponent = ({ data }: NodeProps) => {
    return (
      <div style={outputNodeStyles}>
        <Handle type="target" position={Position.Left} id="input" />
        <div><strong>{data.label || 'Output'}</strong></div>
      </div>
    );
};

export const GraphOutputNode = memo(GraphOutputNodeComponent);