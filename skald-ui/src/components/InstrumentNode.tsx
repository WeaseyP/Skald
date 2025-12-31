import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

// This is a basic representation. We'll expand this later to dynamically
// render handles based on the instrument's subgraph.
const InstrumentNode = ({ data }: NodeProps) => {
  // Collect all inputs and outputs.
  // data.inputs and data.outputs are arrays of strings (port names).
  // If they aren't present (legacy instruments?), we can fallback to default.
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];

  // Helper for handle styling
  const handleContainerStyle: React.CSSProperties = {
    position: 'relative',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    margin: '5px 0'
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8em',
    color: '#CBD5E0'
  };

  return (
    <div style={{
      background: '#2D3748',
      border: '2px solid #5A67D8', // Distinct border for instruments
      borderRadius: '8px',
      padding: '10px',
      color: 'white',
      minWidth: '150px',
      fontFamily: 'sans-serif',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '10px', fontWeight: 'bold', borderBottom: '1px solid #4A5568', paddingBottom: '5px' }}>
        {data.name || 'Instrument'}
      </div>

      {/* Inputs Section */}
      {inputs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {inputs.map((portName: string, index: number) => (
            <div key={`in-${portName}`} style={handleContainerStyle}>
              <Handle
                type="target"
                position={Position.Left}
                id={portName}
                style={{ left: '-10px', width: '8px', height: '8px', background: '#90CDF4' }}
              />
              <span style={{ marginLeft: '10px', ...labelStyle }}>{portName}</span>
            </div>
          ))}
        </div>
      ) : (
        /* Fallback for basic testing if no inputs defined yet */
        <div style={handleContainerStyle}>
          <Handle type="target" position={Position.Left} id="input" style={{ left: '-10px' }} />
          <span style={{ marginLeft: '10px', ...labelStyle }}>In</span>
        </div>
      )}

      {/* Spacer/Divider if both exist */}
      {inputs.length > 0 && outputs.length > 0 && <div style={{ height: '5px' }} />}

      {/* Outputs Section */}
      {outputs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {outputs.map((portName: string, index: number) => (
            <div key={`out-${portName}`} style={handleContainerStyle}>
              <span style={{ marginRight: '10px', ...labelStyle }}>{portName}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={portName}
                style={{ right: '-10px', width: '8px', height: '8px', background: '#68D391' }}
              />
            </div>
          ))}
        </div>
      ) : (
        /* Fallback */
        <div style={{ ...handleContainerStyle, justifyContent: 'flex-end' }}>
          <span style={{ marginRight: '10px', ...labelStyle }}>Out</span>
          <Handle type="source" position={Position.Right} id="output" style={{ right: '-10px' }} />
        </div>
      )}
    </div>
  );
};

export default memo(InstrumentNode);