import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { commonNodeStyles, nodeHeaderStyles, handleContainerStyles, labelStyles, NodeTheme } from './NodeStyles';

const OscillatorNodeComponent: React.FC<NodeProps> = ({ data }) => {
    return (
        <div style={commonNodeStyles}>
            <div style={nodeHeaderStyles}>
                {data.label || 'Oscillator'}
            </div>

            <div style={handleContainerStyles}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input_freq"
                    style={{ background: NodeTheme.colors.handleIn }}
                />
                <span style={{ marginLeft: '12px', ...labelStyles }}>Freq</span>
            </div>
            <div style={handleContainerStyles}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input_amp"
                    style={{ background: NodeTheme.colors.handleIn }}
                />
                <span style={{ marginLeft: '12px', ...labelStyles }}>Amp</span>
            </div>

            {/* Spacer */}
            <div style={{ height: '10px' }}></div>

            <div style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                <span style={{ marginRight: '12px', ...labelStyles }}>Out</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="output"
                    style={{ background: NodeTheme.colors.handleOut }}
                />
            </div>
        </div>
    );
};

export const OscillatorNode = memo(OscillatorNodeComponent);
