import React, { memo } from 'react';
import { NumberInput } from '../common/NumberInput';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { commonNodeStyles, nodeHeaderStyles, handleContainerStyles, labelStyles, inputGroupStyles, numberInputStyles, NodeTheme } from './NodeStyles';

const ADSRNodeComponent = ({ id, data }: NodeProps) => {
    const { setNodes } = useReactFlow();

    const updateParam = (param: string, value: number) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === id) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [param]: value
                    }
                };
            }
            return node;
        }));
    };

    return (
        <div style={commonNodeStyles}>
            <div style={nodeHeaderStyles}>
                {data.label || 'ADSR'}
            </div>

            <div style={handleContainerStyles}>
                <Handle type="target" position={Position.Left} id="input" style={{ background: NodeTheme.colors.handleIn }} />
                <span style={{ marginLeft: '12px', ...labelStyles }}>Gate</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '10px 0' }}>
                {['attack', 'decay', 'sustain', 'release'].map((param) => (
                    <div key={param} style={inputGroupStyles}>
                        <label style={{ color: NodeTheme.colors.textMuted }}>{param.charAt(0).toUpperCase()}</label>
                        <NumberInput
                            step={0.1}
                            min={0}
                            max={param === 'sustain' ? 1 : 10}
                            style={numberInputStyles}
                            value={data[param] ?? 0}
                            onChange={(val) => updateParam(param, val)}
                            className="nodrag" // Important so it can be focused
                        />
                    </div>
                ))}
            </div>

            <div style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                <span style={{ marginRight: '12px', ...labelStyles }}>Env</span>
                <Handle type="source" position={Position.Right} id="output" style={{ background: NodeTheme.colors.handleOut }} />
            </div>
        </div>
    );
};

export const ADSRNode = memo(ADSRNodeComponent);
