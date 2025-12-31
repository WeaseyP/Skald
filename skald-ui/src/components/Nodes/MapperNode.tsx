import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const nodeStyles: React.CSSProperties = {
    background: '#fff9db',
    border: '1px solid #f08c00',
    borderRadius: '4px',
    padding: '8px',
    width: 140,
    fontSize: '0.8em',
    color: '#333',
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
};

const MapperNodeComponent: React.FC<NodeProps> = ({ data }) => {
    return (
        <div style={nodeStyles}>
            <div style={{ marginBottom: 5, fontWeight: 'bold' }}>Mapper</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.7em' }}>In: {data.inMin ?? 0} to {data.inMax ?? 1}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7em' }}>Out: {data.outMin ?? 0} to {data.outMax ?? 1}</span>
            </div>

            <Handle
                type="target"
                position={Position.Left}
                id="input"
                style={{ background: '#f08c00' }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="output"
                style={{ background: '#f08c00' }}
            />
        </div>
    );
};

export const MapperNode = memo(MapperNodeComponent);
