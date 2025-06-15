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
  const [nodeData, setNodeData] = useState<any>({});

  useEffect(() => {
    if (selectedNode?.data) {
        setNodeData(selectedNode.data);
        const freqValue = selectedNode.data.frequency ?? 0;
        setFrequency(freqValue % 1 === 0 ? freqValue.toFixed(1) : String(freqValue));

        const cutoffValue = selectedNode.data.cutoff ?? 0;
        setCutoff(cutoffValue % 1 === 0 ? cutoffValue.toFixed(1) : String(cutoffValue));
    } else {
        setNodeData({});
    }
  }, [selectedNode]);

  const handleBlur = (field: string, value: string) => {
    if (!selectedNode) return;
    
    let num = parseFloat(value);
    if (isNaN(num)) {
        num = 0.0;
    }
    
    const rounded = Math.round(num * 1e2) / 1e2;
    onUpdateNode(selectedNode.id, { [field]: rounded });

    // This updates the local state for display, ensuring a consistent format
    if (field === 'frequency') {
        setFrequency(rounded % 1 === 0 ? rounded.toFixed(1) : String(rounded));
    } else if (field === 'cutoff') {
        setCutoff(rounded % 1 === 0 ? rounded.toFixed(1) : String(rounded));
    }
  };

  const handleDataChange = (field: string, value: string | number) => {
      if (!selectedNode) return;
      onUpdateNode(selectedNode.id, { [field]: value });
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
                style={inputStyles} type="number" id="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                onBlur={(e) => handleBlur('frequency', e.target.value)}
                step="0.01"
              />
            </div>
            <div style={inputGroupStyles}>
              <label style={labelStyles} htmlFor="waveform">Waveform</label>
              <select id="waveform" style={inputStyles} value={nodeData.waveform}
                onChange={(e) => handleDataChange('waveform', e.target.value)}>
                <option value="Sine">Sine</option>
                <option value="Sawtooth">Sawtooth</option>
                <option value="Triangle">Triangle</option>
                <option value="Square">Square</option>
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
                style={inputStyles} type="number" id="cutoff"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
                onBlur={(e) => handleBlur('cutoff', e.target.value)}
                step="0.01"
              />
            </div>
          </>
        );
      case 'noise':
        return (
            <div style={inputGroupStyles}>
              <label style={labelStyles} htmlFor="noiseType">Noise Type</label>
              <select id="noiseType" style={inputStyles} value={nodeData.noiseType}
                onChange={(e) => handleDataChange('noiseType', e.target.value)}>
                <option value="White">White</option>
                <option value="Pink">Pink</option>
              </select>
            </div>
        );
       case 'adsr':
        return (
            <>
                <div style={inputGroupStyles}>
                    <label style={labelStyles}>Attack: {nodeData.attack}s</label>
                    <input type="range" min="0" max="2" step="0.01" value={nodeData.attack}
                           onChange={e => handleDataChange('attack', parseFloat(e.target.value))} style={inputStyles} />
                </div>
                <div style={inputGroupStyles}>
                    <label style={labelStyles}>Decay: {nodeData.decay}s</label>
                    <input type="range" min="0" max="2" step="0.01" value={nodeData.decay}
                           onChange={e => handleDataChange('decay', parseFloat(e.target.value))} style={inputStyles} />
                </div>
                <div style={inputGroupStyles}>
                    <label style={labelStyles}>Sustain: {nodeData.sustain}</label>
                    <input type="range" min="0" max="1" step="0.01" value={nodeData.sustain}
                           onChange={e => handleDataChange('sustain', parseFloat(e.target.value))} style={inputStyles} />
                </div>
                <div style={inputGroupStyles}>
                    <label style={labelStyles}>Release: {nodeData.release}s</label>
                    <input type="range" min="0" max="5" step="0.01" value={nodeData.release}
                           onChange={e => handleDataChange('release', parseFloat(e.target.value))} style={inputStyles} />
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