import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AudioVisualizer } from '../Visualization/AudioVisualizer';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    NodeTheme, accentFor,
} from './NodeStyles';

const accent = accentFor('output');

const GraphOutputNodeComponent = ({ data }: NodeProps) => {
    return (
        <div style={nodeShellStyles(accent)}>
            <div style={nodeHeaderStylesFor(accent)}>{data.label || 'Output'}</div>
            <div style={handleContainerStyles}>
                <Handle type="target" position={Position.Left} id="input"
                    style={{ background: NodeTheme.colors.handleIn }} />
                <span style={{ marginLeft: '12px', ...labelStyles }}>In</span>
            </div>
            <AudioVisualizer
                analyser={data.analyser}
                width={140}
                height={40}
                showSpectrum={false}
                showOscilloscope={true}
            />
        </div>
    );
};

export const GraphOutputNode = memo(GraphOutputNodeComponent);
