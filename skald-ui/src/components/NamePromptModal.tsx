// src/components/ParameterPanel.tsx
import React from 'react';
import { Node } from 'reactflow';

const panelStyles: React.CSSProperties = {
  padding: '15px',
  fontFamily: 'sans-serif',
};

const inputGroupStyles: React.CSSProperties = {
  marginBottom: '10px',
};

const labelStyles: React.CSSProperties = {
  display: 'block',
  marginBottom: '5px',
  fontWeight: 'bold',
  color: '#333'
};

const inputStyles: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: '1px solid #ccc',
};

interface ParameterPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: object) => void;
}

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode }) => {
  if (!selectedNode) {
    return <div style={panelStyles}><p>Select a node to edit its parameters.</p></div>;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    // For number inputs, convert the value from string to float
    const isNumber = e.target.type === 'number';
    const parsedValue = isNumber ? parseFloat(value) : value;
    onUpdateNode(selectedNode.id, { [name]: parsedValue });
  };

  const renderParameters = () => {
    switch (selectedNode.type) {
      case 'oscillator':
        return (
          <>
            <div style={inputGroupStyles}>
              <label style={labelStyles}>Waveform</label>
              <select
                name="waveform"
                value={selectedNode.data.waveform || 'Sawtooth'}
                onChange={handleInputChange}
                style={inputStyles}
              >
                <option value="Sawtooth">Sawtooth</option>
                <option value="Sine">Sine</option>
                <option value="Triangle">Triangle</option>
                <option value="Square">Square</option>
              </select>
            </div>
            <div style={inputGroupStyles}>
              <label style={labelStyles}>Frequency (Hz)</label>
              <input
                type="number"
                name="frequency"
                value={selectedNode.data.frequency || 440}
                onChange={handleInputChange}
                style={inputStyles}
                step="0.1"
              />
            </div>
          </>
        );
      case 'filter':
        return (
          <>
             <div style={inputGroupStyles}>
              <label style={labelStyles}>Filter Type</label>
              <select
                name="type"
                value={selectedNode.data.type || 'Lowpass'}
                onChange={handleInputChange}
                style={inputStyles}
              >
                <option value="Lowpass">Lowpass</option>
                <option value="Highpass">Highpass</option>
                <option value="Bandpass">Bandpass</option>
              </select>
            </div>
            <div style={inputGroupStyles}>
              <label style={labelStyles}>Cutoff (Hz)</label>
              <input
                type="number"
                name="cutoff"
                value={selectedNode.data.cutoff || 800}
                onChange={handleInputChange}
                style={inputStyles}
                step="1"
              />
            </div>
          </>
        );
      case 'adsr':
        return (
            <>
                {['attack', 'decay', 'sustain', 'release'].map(param => (
                    <div style={inputGroupStyles} key={param}>
                        <label style={labelStyles}>{param.charAt(0).toUpperCase() + param.slice(1)} (s)</label>
                        <input
                            type="number"
                            name={param}
                            value={selectedNode.data[param] || 0.1}
                            onChange={handleInputChange}
                            style={inputStyles}
                            step="0.01"
                            min="0"
                        />
                    </div>
                ))}
            </>
        );
      case 'instrument':
        return (
            <div style={inputGroupStyles}>
              <label style={labelStyles}>Instrument Name</label>
              <input
                type="text"
                name="name"
                value={selectedNode.data.name || ''}
                onChange={handleInputChange}
                style={inputStyles}
              />
            </div>
        );
      default:
        return <p>This node has no configurable parameters.</p>;
    }
  };

  return (
    <div style={panelStyles}>
      <h3>Parameters for "{selectedNode.data.label || selectedNode.type}"</h3>
      {renderParameters()}
    </div>
  );
};

export default ParameterPanel;
