import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const baseNodeStyles: React.CSSProperties = {
  border: '1px solid #2f9e44',
  borderRadius: '4px',
  padding: '10px 15px',
  width: 150,
  textAlign: 'center'
};

const filterNodeStyles: React.CSSProperties = { ...baseNodeStyles, background: '#d0ebff' };

const handleLabelStyles: React.CSSProperties = {
  fontSize: '0.6em',
  color: '#000',
  position: 'absolute',
  pointerEvents: 'none'
};

const FilterNodeComponent = ({ data }: NodeProps) => {
  return (
    <div style={filterNodeStyles}>
      <div style={{ position: 'relative', height: '10px' }}>
        <Handle type="target" position={Position.Left} id="input" style={{ top: '50%' }} />
        <span style={{ ...handleLabelStyles, left: '10px', top: '0px' }}>In</span>
      </div>
      <div style={{ position: 'relative', height: '10px', marginTop: '5px' }}>
        <Handle type="target" position={Position.Left} id="input_cutoff" style={{ top: '50%' }} />
        <span style={{ ...handleLabelStyles, left: '10px', top: '0px' }}>Cut</span>
      </div>
      <div style={{ position: 'relative', height: '10px', marginTop: '5px' }}>
        <Handle type="target" position={Position.Left} id="input_res" style={{ top: '50%' }} />
        <span style={{ ...handleLabelStyles, left: '10px', top: '0px' }}>Res</span>
      </div>

      <div style={{ margin: '5px 0' }}><strong>{data.label || 'Filter'}</strong></div>

      <div style={{ position: 'relative', height: '10px' }}>
        <span style={{ ...handleLabelStyles, right: '10px', top: '0px' }}>Out</span>
        <Handle type="source" position={Position.Right} id="output" style={{ top: '50%' }} />
      </div>
    </div>
  );
};

export const FilterNode = memo(FilterNodeComponent);