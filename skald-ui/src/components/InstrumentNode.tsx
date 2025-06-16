import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

// This is a basic representation. We'll expand this later to dynamically
// render handles based on the instrument's subgraph.
const InstrumentNode = ({ data }: NodeProps) => {
  return (
    <div style={{
      background: '#2D3748', // A dark, slate-gray background
      border: '1px solid #4A5568',
      borderRadius: '8px',
      padding: '15px 25px',
      color: 'white',
      minWidth: '150px',
      textAlign: 'center',
      fontFamily: 'sans-serif',
    }}>
      {/* Input Handle - for gate, note, etc. */}
      <Handle
        type="target"
        position={Position.Left}
        id="input" // Generic input for now
        style={{ background: '#555' }}
      />

      <strong>{data.name || 'Instrument'}</strong>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output" // Generic output
        style={{ background: '#555' }}
      />
    </div>
  );
};

export default memo(InstrumentNode);