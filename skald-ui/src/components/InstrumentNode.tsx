// src/components/InstrumentNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const nodeStyle: React.CSSProperties = {
  background: '#2D3748', // gray-800
  color: 'white',
  padding: '15px',
  borderRadius: '8px',
  border: '2px solid #4A5568', // gray-600
  minWidth: '180px',
  textAlign: 'center',
  position: 'relative',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '15px',
  fontWeight: 'bold',
  fontSize: '1.1em',
};

const handleStyle: React.CSSProperties = {
    width: '12px',
    height: '12px',
};

const portLabelStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: '10px',
    color: '#A0AEC0', // gray-400
};

// We use React.memo to prevent unnecessary re-renders of the node
const InstrumentNode: React.FC<NodeProps> = ({ data }) => {
  const { label, inputs = [], outputs = [] } = data;

  // Calculate vertical space needed for handles
  const nodeHeight = Math.max(inputs.length, outputs.length) * 25 + 40;

  return (
    <div style={{...nodeStyle, height: `${nodeHeight}px`}}>
      <div style={labelStyle}>{label || 'Instrument'}</div>

      {/* Dynamically create an input handle for each input port */}
      {inputs.map((inputName: string, index: number) => (
        <React.Fragment key={`input-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName}
            style={{ ...handleStyle, top: `${(index + 1) * 25}px` }}
          />
          <div style={{ ...portLabelStyle, left: '18px', top: `${(index + 1) * 25 - 6}px` }}>
            {inputName}
          </div>
        </React.Fragment>
      ))}

      {/* Dynamically create an output handle for each output port */}
      {outputs.map((outputName: string, index: number) => (
        <React.Fragment key={`output-${outputName}`}>
          <Handle
            type="source"
            position={Position.Right}
            id={outputName}
            style={{ ...handleStyle, top: `${(index + 1) * 25}px` }}
          />
           <div style={{ ...portLabelStyle, right: '18px', top: `${(index + 1) * 25 - 6}px` }}>
            {outputName}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export default memo(InstrumentNode);