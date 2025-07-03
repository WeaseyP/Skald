import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
    border: '1px solid #2f9e44',
    borderRadius: '4px',
    padding: '10px 15px',
    width: 150,
    textAlign: 'center'
};

const adsrNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#fff3bf', borderColor: '#fcc419' };

const ADSRNodeComponent = ({ data }: NodeProps) => {
    return (
        <div style={adsrNodeStyles}>
            <Handle type="target" position={Position.Left} id="input" />
            <div><strong>{data.label || 'ADSR'}</strong></div>
            <Handle type="source" position={Position.Right} id="output" />
        </div>
    );
};

export const ADSRNode = memo(ADSRNodeComponent);