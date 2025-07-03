import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const filterNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#d0ebff' };

const FilterNodeComponent = ({ data }: NodeProps) => {
    return (
      <div style={filterNodeStyles}>
        <Handle type="target" position={Position.Left} id="input" />
        <div><strong>{data.label || 'Filter'}</strong></div>
        <Handle type="source" position={Position.Right} id="output" />
      </div>
    );
};

export const FilterNode = memo(FilterNodeComponent);