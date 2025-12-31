import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MidiInputParams } from '../../definitions/types';

const nodeStyles: React.CSSProperties = {
    padding: '10px',
    borderRadius: '5px',
    background: '#2D3748',
    color: '#E0E0E0',
    border: '1px solid #4A5568',
    minWidth: '100px',
    fontSize: '0.8em',
};

const labelStyles: React.CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
    textAlign: 'center',
    borderBottom: '1px solid #4A5568',
    paddingBottom: '5px',
};

const handleLabelStyles: React.CSSProperties = {
    fontSize: '0.7em',
    color: '#A0AEC0',
    position: 'absolute',
    right: '10px',
};

const MidiInputNode = ({ data }: NodeProps<MidiInputParams>) => {
    return (
        <div style={nodeStyles}>
            <span style={labelStyles}>MIDI Input</span>
            <div style={{ position: 'relative', height: '15px', marginBottom: '5px' }}>
                <span style={{ ...handleLabelStyles, top: 0 }}>Pitch</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="pitch"
                    style={{ background: '#63B3ED', top: '50%' }}
                />
            </div>
            <div style={{ position: 'relative', height: '15px', marginBottom: '5px' }}>
                <span style={{ ...handleLabelStyles, top: 0 }}>Gate</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="gate"
                    style={{ background: '#F6E05E', top: '50%' }}
                />
            </div>
            <div style={{ position: 'relative', height: '15px' }}>
                <span style={{ ...handleLabelStyles, top: 0 }}>Vel</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="velocity"
                    style={{ background: '#68D391', top: '50%' }}
                />
            </div>
            {data.useMpe && (
                <div style={{ fontSize: '0.6em', color: '#68D391', textAlign: 'center', marginTop: '5px' }}>
                    MPE Active
                </div>
            )}
        </div>
    );
};

export default memo(MidiInputNode);
