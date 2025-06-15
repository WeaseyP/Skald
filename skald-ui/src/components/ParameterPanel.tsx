// src/components/ParameterPanel.tsx

import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';

const panelStyles: React.CSSProperties = {
  padding: '15px',
  borderLeft: '1px solid #ddd',
};

const inputGroupStyles: React.CSSProperties = {
    marginBottom: '10px'
}

const labelStyles: React.CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    color: '#333'
}

const inputStyles: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    border: '1px solid #ccc',
    borderRadius: '4px'
}

interface ParameterPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (id: string, data: object) => void;
}

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode }) => {
  const [frequency, setFrequency] = useState('');
  const [cutoff, setCutoff] = useState('');

  useEffect(() => {
    if (selectedNode?.data) {
        // When a new node is selected, format its initial value for display
        const freqValue = selectedNode.data.frequency ?? 0;
        setFrequency(freqValue % 1 === 0 ? freqValue.toFixed(1) : String(freqValue));

        const cutoffValue = selectedNode.data.cutoff ?? 0;
        setCutoff(cutoffValue % 1 === 0 ? cutoffValue.toFixed(1) : String(cutoffValue));
    }
  }, [selectedNode]);

  // When the user leaves an input field, validate, round, and format the value
  const handleBlur = (field: 'frequency' | 'cutoff', value: string) => {
    if (!selectedNode) return;
    
    let num = parseFloat(value);
    if (isNaN(num)) {
        num = 0.0;
    }
    
    // Round to 5 decimal places
    const rounded = Math.round(num * 1e2) / 1e2;
    
    // Update the global state with the pure number
    onUpdateNode(selectedNode.id, { [field]: rounded });

    // Update the local display state with a nicely formatted string
    // This ensures "400" becomes "400.0" in the input field
    setFrequency(rounded % 1 === 0 ? rounded.toFixed(1) : String(rounded));
  };

  if (!selectedNode) {
    return (
      <div style={panelStyles}>
        <h2>Parameters</h2>
        <p>Select a node to edit its parameters.</p>
      </div>
    );
  }

  const renderParameters = () => {
    switch (selectedNode.type) {
      case 'oscillator':
        return (
          <>
            <div style={inputGroupStyles}>
              <label style={labelStyles} htmlFor="frequency">Frequency</label>
              <input
                style={inputStyles}
                type="number"
                id="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)} // Just update the string as user types
                onBlur={(e) => handleBlur('frequency', e.target.value)} // Format and update state on blur
                step="0.01"
              />
            </div>
            <div style={inputGroupStyles}>
              <label style={labelStyles} htmlFor="wavetype">Waveform Type</label>
              <select id="wavetype" style={inputStyles} value={selectedNode.data.waveform}
                onChange={(e) => onUpdateNode(selectedNode.id, { waveform: e.target.value })}>
                <option value="Sine">Sine</option>
                <option value="Sawtooth">Sawtooth</option>
              </select>
            </div>
          </>
        );
      case 'filter':
        return (
          <>
            <div style={inputGroupStyles}>
              <label style={labelStyles} htmlFor="cutoff">Cutoff Frequency</label>
              <input
                style={inputStyles}
                type="number"
                id="cutoff"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
                onBlur={(e) => handleBlur('cutoff', e.target.value)}
                step="0.01"
              />
            </div>
          </>
        );
      case 'output':
        return <p>This is the final audio output.</p>;
      default:
        return <p>No parameters for this node type.</p>;
    }
  }

  return (
    <div style={panelStyles}>
      <h2>Parameters: {selectedNode.data.label}</h2>
      {renderParameters()}
    </div>
  );
};

export default ParameterPanel;