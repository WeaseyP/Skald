import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NumberInput } from '../common/NumberInput';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    inputGroupStyles, numberInputStyles, NodeTheme, accentFor,
} from './NodeStyles';
import { useNodeParamUpdater } from './ParamNode';

const accent = accentFor('mixer');

type ChannelLevel = { id: number; level: number; pan: number };

// Custom (not makeParamNode) because the input handles AND the per-channel
// level fields are dynamic — one row per channel, dot and level side by side.
const MixerNodeComponent = ({ id, data }: NodeProps) => {
    const update = useNodeParamUpdater(id);
    const inputCount = Math.min(Math.max(Number(data.inputCount) || 4, 1), 32);
    const levels: ChannelLevel[] = Array.isArray(data.levels) ? data.levels : [];
    const channel = (ch: number): ChannelLevel => {
        const existing = levels.find(l => l?.id === ch);
        return { id: ch, level: typeof existing?.level === 'number' ? existing.level : 0.75, pan: existing?.pan ?? 0 };
    };

    const setLevel = (ch: number, val: number) => {
        update({
            levels: Array.from({ length: inputCount }, (_, i) => {
                const c = channel(i + 1);
                return i + 1 === ch ? { ...c, level: val } : c;
            }),
        });
    };

    const setCount = (val: number) => {
        const count = Math.min(Math.max(Math.round(val), 1), 32);
        update({
            inputCount: count,
            levels: Array.from({ length: count }, (_, i) => channel(i + 1)),
        });
    };

    return (
        <div style={nodeShellStyles(accent)}>
            <div style={nodeHeaderStylesFor(accent)}>{data.label || 'Mixer'}</div>

            <div style={inputGroupStyles}>
                <label style={{ color: NodeTheme.colors.textMuted, marginRight: '8px' }}>Inputs</label>
                <NumberInput className="nodrag" style={numberInputStyles}
                    min={1} max={32} step={1} value={inputCount} onChange={setCount} />
            </div>

            {Array.from({ length: inputCount }, (_, i) => i + 1).map((ch) => (
                <div key={ch} style={{ ...handleContainerStyles, justifyContent: 'space-between' }}>
                    <Handle type="target" position={Position.Left} id={`input_${ch}`}
                        style={{ background: NodeTheme.colors.handleIn }} />
                    <span style={{ marginLeft: '12px', ...labelStyles }}>In {ch}</span>
                    <NumberInput className="nodrag" style={numberInputStyles}
                        min={0} max={2} step={0.05} value={channel(ch).level}
                        onChange={(val) => setLevel(ch, val)} />
                </div>
            ))}

            <div style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                <span style={{ marginRight: '12px', ...labelStyles }}>Out</span>
                <Handle type="source" position={Position.Right} id="output"
                    style={{ background: NodeTheme.colors.handleOut }} />
            </div>
        </div>
    );
};

export const MixerNode = memo(MixerNodeComponent);
