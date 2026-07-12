import React, { memo } from 'react';
import { NumberInput } from '../common/NumberInput';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { commonNodeStyles, nodeHeaderStyles, handleContainerStyles, labelStyles, inputGroupStyles, numberInputStyles, NodeTheme } from './NodeStyles';
import { useGraphActions } from '../../contexts/GraphActionsContext';

const FilterNodeComponent = ({ id, data }: NodeProps) => {
  const graphActions = useGraphActions();
  const { setNodes } = useReactFlow();

  const updateParam = (param: string, value: number) => {
    // Write through app state (useGraphState), NOT React Flow's internal
    // store — see ADSRNode for the full story. Internal-store writes were
    // never heard by the audio engine and never reached save/codegen.
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
        {data.label || 'Filter'}
      </div>

      <div style={handleContainerStyles}>
        <Handle type="target" position={Position.Left} id="input" style={{ background: NodeTheme.colors.handleIn }} />
        <span style={{ marginLeft: '12px', ...labelStyles }}>In</span>
      </div>
      <div style={handleContainerStyles}>
        <Handle type="target" position={Position.Left} id="input_cutoff" style={{ background: NodeTheme.colors.handleIn }} />
        <span style={{ marginLeft: '12px', ...labelStyles }}>Cut</span>
      </div>
      <div style={handleContainerStyles}>
        <Handle type="target" position={Position.Left} id="input_res" style={{ background: NodeTheme.colors.handleIn }} />
        <span style={{ marginLeft: '12px', ...labelStyles }}>Res</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '10px 0' }}>
        <div style={inputGroupStyles}>
          <label style={{ color: NodeTheme.colors.textMuted }}>Freq</label>
          <NumberInput
            min={20}
            max={20000}
            style={numberInputStyles}
            value={data.cutoff ?? 800}
            onChange={(val) => updateParam('cutoff', val)}
            className="nodrag"
          />
        </div>
        <div style={inputGroupStyles}>
          <label style={{ color: NodeTheme.colors.textMuted }}>Res</label>
          <NumberInput
            step={0.1}
            min={0}
            max={20}
            style={numberInputStyles}
            value={data.resonance ?? 1}
            onChange={(val) => updateParam('resonance', val)}
            className="nodrag"
          />
        </div>
      </div>

      <div style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
        <span style={{ marginRight: '12px', ...labelStyles }}>Out</span>
        <Handle type="source" position={Position.Right} id="output" style={{ background: NodeTheme.colors.handleOut }} />
      </div>
    </div>
  );
};

export const FilterNode = memo(FilterNodeComponent);
