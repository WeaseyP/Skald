import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const lfoNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#f3d9fa', borderColor: '#be4bdb' };

const LFONodeComponent = ({ data }: NodeProps) => {
    return (
        <div style={lfoNodeStyles}>
            <div><strong>{data.label || 'LFO'}</strong></div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
};

export const LFONode = memo(LFONodeComponent);