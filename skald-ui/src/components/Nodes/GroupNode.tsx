// src/components/Nodes/GroupNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const nodeStyle: React.CSSProperties = {
  background: 'rgba(45, 55, 72, 0.8)', // Semi-transparent dark blue-gray
  color: 'white',
  padding: '15px',
  paddingTop: '30px', // Extra padding for the label
  borderRadius: '8px',
  border: '2px solid #718096', // gray-500
  textAlign: 'center',
  position: 'relative',
};

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '5px',
  left: '15px',
  fontWeight: 'bold',
  fontSize: '1.1em',
};

const handleStyle: React.CSSProperties = {
    width: '12px',
    height: '12px',
    background: '#a0aec0', // gray-400
};

const portLabelStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: '10px',
    color: '#A0AEC0', // gray-400
};

const GroupNodeComponent: React.FC<NodeProps> = ({ data }) => {
  const { label, inputs = [], outputs = [] } = data;

  // Calculate vertical space needed for handles
  const nodeHeight = Math.max(inputs.length, outputs.length) * 25 + 40;

  return (
    <div style={{...nodeStyle, height: `${nodeHeight}px`}}>
      <div style={labelStyle}>{label || 'Group'}</div>

      {/* Dynamically create an input handle for each determined entry point */}
      {inputs.map((input: { nodeId: string, handleId: string }, index: number) => (
        <React.Fragment key={`input-${input.nodeId}-${input.handleId}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`${input.nodeId}-${input.handleId}`} // Unique ID for the handle
            style={{ ...handleStyle, top: `${(index + 1) * 25}px` }}
          />
           <div style={{ ...portLabelStyle, left: '18px', top: `${(index + 1) * 25 - 6}px` }}>
            {input.handleId}
          </div>
        </React.Fragment>
      ))}

      {/* Dynamically create an output handle for each determined exit point */}
      {outputs.map((output: { nodeId: string, handleId: string }, index: number) => (
        <React.Fragment key={`output-${output.nodeId}-${output.handleId}`}>
          <Handle
            type="source"
            position={Position.Right}
            id={`${output.nodeId}-${output.handleId}`} // Unique ID for the handle
            style={{ ...handleStyle, top: `${(index + 1) * 25}px` }}
          />
          <div style={{ ...portLabelStyle, right: '18px', top: `${(index + 1) * 25 - 6}px` }}>
            {output.handleId}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export const GroupNode = memo(GroupNodeComponent);
