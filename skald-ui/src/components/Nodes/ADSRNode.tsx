import React, { memo } from 'react';
import { NumberInput } from '../common/NumberInput';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { commonNodeStyles, nodeHeaderStyles, handleContainerStyles, labelStyles, inputGroupStyles, numberInputStyles, NodeTheme } from './NodeStyles';
import { useGraphActions } from '../../contexts/GraphActionsContext';

const ADSRNodeComponent = ({ id, data }: NodeProps) => {
    const graphActions = useGraphActions();
    const { setNodes } = useReactFlow();

    const updateParam = (param: string, value: number) => {
        // Write through app state (useGraphState), NOT React Flow's internal
        // store. The flow is controlled: the audio engine, save and codegen
        // all read useGraphState's nodes, so a `useReactFlow().setNodes`
        // write was never heard, never exported, and visually snapped back
        // on the next state change — "the instrument still plays the old
        // sound after I edit it".
        if (graphActions) {
            graphActions.updateNodeData(id, { [param]: value });
            return;
        }
        // Fallback for isolated rendering (tests) without the app provider.
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
