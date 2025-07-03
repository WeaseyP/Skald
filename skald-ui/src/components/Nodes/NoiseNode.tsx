import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const noiseNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#e9ecef', borderColor: '#495057' };

const NoiseNodeComponent = ({ data }: NodeProps) => {
    return (
        <div style={noiseNodeStyles}>
            <div><strong>{data.label || 'Noise'}</strong></div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
};

export const NoiseNode = memo(NoiseNodeComponent);