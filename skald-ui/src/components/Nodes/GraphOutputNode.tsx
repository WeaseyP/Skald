import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { OutputParams } from '../../definitions/types';
import { AudioVisualizer } from '../Visualization/AudioVisualizer';
import { useMeterAnalysers } from '../../contexts/GraphActionsContext';
import { useVisualizerModePreference } from '../../hooks/nodeEditor/useVisualizerModePreference';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    NodeTheme, accentFor,
} from './NodeStyles';

const accent = accentFor('output');

const GraphOutputNodeComponent = ({ data }: NodeProps<Node<OutputParams>>) => {
    // E9 (roadmap 0.2 §9.4 item 3): which mode this scope shows is a view
    // preference (persisted, never saved, never through pushHistory — see
    // the hook's own comment), shared by every Output node on the canvas the
    // same way the injected `analyser` already is (one shared mono tap, one
    // shared mode — not a per-node setting nobody asked for).
    const [visualizerMode, setVisualizerMode] = useVisualizerModePreference();
    // Reused, not re-wired: the same stereo pair PeakMeter already taps in
    // the transport dock (see GraphActionsContext's meterAnalysers comment).
    const meterAnalysers = useMeterAnalysers();

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
                stereoAnalysers={meterAnalysers}
                width={140}
                height={40}
                mode={visualizerMode}
                onModeChange={setVisualizerMode}
            />
        </div>
    );
};

export const GraphOutputNode = memo(GraphOutputNodeComponent);
