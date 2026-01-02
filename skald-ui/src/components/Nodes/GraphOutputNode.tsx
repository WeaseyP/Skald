import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
  border: '1px solid #2f9e44',
  borderRadius: '4px',
  padding: '10px 15px',
  width: 150,
  textAlign: 'center'
};

const outputNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#ffe8cc', borderColor: '#e8590c' };

import { AudioVisualizer } from '../Visualization/AudioVisualizer';

const GraphOutputNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={outputNodeStyles}>
      <Handle type="target" position={Position.Left} id="input" />
      <div style={{ marginBottom: '5px' }}><strong>{data.label || 'Output'}</strong></div>
      <AudioVisualizer
        analyser={data.analyser}
        width={120}
        height={40}
        showSpectrum={false}
        showOscilloscope={true}
      />
    </div>
  );
};

export const GraphOutputNode = memo(GraphOutputNodeComponent);