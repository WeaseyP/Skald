import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const nodeStyles: React.CSSProperties = {
    background: '#593E59',
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #795A79',
    color: '#E0E0E0',
    textAlign: 'center',
    minWidth: '150px',
};

const labelStyles: React.CSSProperties = {
    display: 'block',
    marginBottom: '10px',
    fontWeight: 'bold',
    fontSize: '1.1em',
};

const handleStyle: React.CSSProperties = {
    width: '10px',
    height: '10px',
};

const handleLabelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-18px',
    fontSize: '10px',
    color: '#A0AEC0',
};


export const WavetableNode: React.FC<NodeProps> = ({ data }) => {
    return (
        <div style={nodeStyles}>
            <Handle
                type="target"
                position={Position.Top}
                id="input_freq"
                style={{ ...handleStyle, left: '25%' }}
            >
                 <span style={{...handleLabelStyle, left: '-10px'}}>Freq</span>
            </Handle>
             <Handle
                type="target"
                position={Position.Top}
                id="input_pos"
                style={{ ...handleStyle, left: '75%' }}
            >
                 <span style={{...handleLabelStyle, left: '-20px'}}>Position</span>
            </Handle>
            
            <label style={labelStyles}>{data.label || 'Wavetable'}</label>
            
            <Handle
                type="source"
                position={Position.Bottom}
                id="output"
                style={handleStyle}
            />
        </div>
    );
};

export default memo(WavetableNode);
