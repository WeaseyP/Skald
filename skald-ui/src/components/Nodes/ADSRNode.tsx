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

const handleLabelStyles: React.CSSProperties = {
    fontSize: '0.6em',
    color: '#000',
    position: 'absolute',
    pointerEvents: 'none'
};

const ADSRNodeComponent = ({ data }: NodeProps) => {
    return (
        <div style={adsrNodeStyles}>
            <div style={{ position: 'relative', height: '10px' }}>
                <Handle type="target" position={Position.Left} id="input" style={{ top: '50%' }} />
                <span style={{ ...handleLabelStyles, left: '10px', top: '0px' }}>Gate</span>
            </div>

            <div style={{ margin: '5px 0' }}><strong>{data.label || 'ADSR'}</strong></div>

            <div style={{ position: 'relative', height: '10px' }}>
                <span style={{ ...handleLabelStyles, right: '10px', top: '0px' }}>Env</span>
                <Handle type="source" position={Position.Right} id="output" style={{ top: '50%' }} />
            </div>
        </div>
    );
};

export const ADSRNode = memo(ADSRNodeComponent);