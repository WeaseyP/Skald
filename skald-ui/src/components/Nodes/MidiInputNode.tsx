import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MidiInputParams } from '../../definitions/types';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    NodeTheme, accentFor,
} from './NodeStyles';

const accent = accentFor('midiInput');

const MidiInputNode = ({ data }: NodeProps<MidiInputParams>) => {
    const outputs = [
        { id: 'pitch', label: 'Pitch' },
        { id: 'gate', label: 'Gate' },
        { id: 'velocity', label: 'Vel' },
    ];
    return (
        <div style={nodeShellStyles(accent)}>
            <div style={nodeHeaderStylesFor(accent)}>{data.label || 'MIDI Input'}</div>
            {outputs.map((port) => (
                <div key={port.id} style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                    <span style={{ marginRight: '12px', ...labelStyles }}>{port.label}</span>
                    <Handle type="source" position={Position.Right} id={port.id}
                        style={{ background: NodeTheme.colors.handleOut }} />
                </div>
            ))}
            {data.useMpe && (
                <div style={{ fontSize: '0.6em', color: NodeTheme.colors.handleOut, textAlign: 'center', marginTop: '5px' }}>
                    MPE Active
                </div>
            )}
        </div>
    );
};

export default memo(MidiInputNode);
