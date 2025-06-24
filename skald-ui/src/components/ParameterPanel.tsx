// src/components/ParameterPanel.tsx
import React from 'react';
import { Node } from 'reactflow';

// --- STYLES ---
const panelStyles: React.CSSProperties = {
  padding: '15px',
  fontFamily: 'sans-serif',
  color: '#E0E0E0',
  background: '#2D2D2D',
  height: '100%',
};

const headerStyles: React.CSSProperties = {
    borderBottom: '1px solid #444',
    paddingBottom: '10px',
    marginBottom: '15px',
}

const inputGroupStyles: React.CSSProperties = {
  marginBottom: '15px',
};

const labelContainerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '5px',
}

const labelStyles: React.CSSProperties = {
  fontWeight: 'bold',
  color: '#CCCCCC'
};

const inputStyles: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: '1px solid #555',
  background: '#333',
  color: '#E0E0E0',
  outline: 'none',
};

const iconButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 4px',
};

// --- ICONS (as inline SVG components) ---

const LinkIcon: React.FC<{ isExposed: boolean }> = ({ isExposed }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="18" 
        height="18" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={isExposed ? '#22A5F1' : '#777'}
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        style={{ transition: 'stroke 0.2s ease-in-out' }}
    >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"></path>
    </svg>
);


// --- PROPS INTERFACE ---

interface ParameterPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: object) => void;
}


// --- MAIN COMPONENT ---

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode }) => {

  if (!selectedNode) {
    return <div style={panelStyles}><p>Select a node to edit its parameters.</p></div>;
  }

  // --- EVENT HANDLERS ---

  /**
   * Handles changes for standard input controls (text, number, select).
   * It updates the corresponding key in the node's data object.
   */
  const handleParameterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) : value;
    
    // Create a new data object with the updated parameter
    const newData = {
      ...selectedNode.data,
      [name]: parsedValue,
    };
    onUpdateNode(selectedNode.id, newData);
  };

  /**
   * Toggles whether a parameter is "exposed" to the public API.
   * It adds or removes the parameter key from the 'exposedParameters' array.
   */
  const toggleParameterExposure = (paramKey: string) => {
    const currentExposed: string[] = selectedNode.data.exposedParameters || [];
    const isExposed = currentExposed.includes(paramKey);
    
    let newExposed: string[];
    if (isExposed) {
      newExposed = currentExposed.filter(p => p !== paramKey);
    } else {
      newExposed = [...currentExposed, paramKey];
    }

    // Create a new data object with the updated exposure list
    const newData = {
      ...selectedNode.data,
      exposedParameters: newExposed,
    };
    onUpdateNode(selectedNode.id, newData);
  };


  // --- RENDER HELPERS ---

  /**
   * A generic renderer for a single parameter control.
   * It includes the label, input, and the new "expose" icon button.
   */
  const renderParameterControl = (
    paramKey: string, 
    label: string, 
    children: React.ReactNode, 
    isExposable: boolean = true
  ) => {
    const isExposed = selectedNode.data.exposedParameters?.includes(paramKey) || false;

    return (
      <div style={inputGroupStyles} key={paramKey}>
        <div style={labelContainerStyles}>
            <label style={labelStyles}>{label}</label>
            {isExposable && (
                 <button 
                    style={iconButtonStyles} 
                    onClick={() => toggleParameterExposure(paramKey)}
                    title={isExposed ? `Un-expose "${label}"` : `Expose "${label}" to public API`}
                 >
                    <LinkIcon isExposed={isExposed} />
                </button>
            )}
        </div>
        {children}
      </div>
    );
  };


  /**
   * Determines which set of parameter controls to render based on the selected node type.
   */
  const renderParameters = () => {
    const { type, data } = selectedNode;

    switch (type) {
      case 'lfo':
        return (
          <>
            {renderParameterControl('waveform', 'Waveform', 
              <select name="waveform" value={data.waveform || 'Sine'} onChange={handleParameterChange} style={inputStyles}>
                <option value="Sine">Sine</option>
                <option value="Sawtooth">Sawtooth</option>
                <option value="Triangle">Triangle</option>
                <option value="Square">Square</option>
              </select>,
              false 
            )}
            {renderParameterControl('frequency', 'Frequency (Hz)',
              <input type="number" name="frequency" value={data.frequency || 5.0} onChange={handleParameterChange} style={inputStyles} step="0.1" />
            )}
            {renderParameterControl('amplitude', 'Amplitude (Depth)',
              <input type="number" name="amplitude" value={data.amplitude || 1.0} onChange={handleParameterChange} style={inputStyles} step="0.01" min="0" />
            )}
          </>
        );

      case 'oscillator':
        return (
          <>
            {renderParameterControl('waveform', 'Waveform', 
              <select name="waveform" value={data.waveform || 'Sawtooth'} onChange={handleParameterChange} style={inputStyles}>
                <option value="Sawtooth">Sawtooth</option>
                <option value="Sine">Sine</option>
                <option value="Triangle">Triangle</option>
                <option value="Square">Square</option>
              </select>,
              false // Waveform type is not dynamically controllable as a float
            )}
            {renderParameterControl('frequency', 'Frequency (Hz)',
              <input type="number" name="frequency" value={data.frequency || 440} onChange={handleParameterChange} style={inputStyles} step="0.1" />
            )}
            {renderParameterControl('amplitude', 'Amplitude',
              <input type="number" name="amplitude" value={data.amplitude || 0.5} onChange={handleParameterChange} style={inputStyles} step="0.01" min="0" max="1" />
            )}
          </>
        );

      case 'filter':
        return (
          <>
            {renderParameterControl('type', 'Filter Type',
              <select name="type" value={data.type || 'Lowpass'} onChange={handleParameterChange} style={inputStyles}>
                <option value="Lowpass">Lowpass</option>
                <option value="Highpass">Highpass</option>
                <option value="Bandpass">Bandpass</option>
              </select>,
              false
            )}
            {renderParameterControl('cutoff', 'Cutoff (Hz)',
              <input type="number" name="cutoff" value={data.cutoff || 800} onChange={handleParameterChange} style={inputStyles} step="1" />
            )}
          </>
        );

      case 'noise':
        return (
          <>
            {renderParameterControl('type', 'Noise Type',
              <select name="type" value={data.type || 'White'} onChange={handleParameterChange} style={inputStyles}>
                <option value="White">White</option>
                <option value="Pink">Pink</option>
              </select>,
              false
            )}
             {renderParameterControl('amplitude', 'Amplitude',
              <input type="number" name="amplitude" value={data.amplitude || 1.0} onChange={handleParameterChange} style={inputStyles} step="0.01" min="0" max="1" />
            )}
          </>
        );

      case 'adsr':
        return (
          <>
            {['attack', 'decay', 'sustain', 'release'].map(param => 
              renderParameterControl(param, `${param.charAt(0).toUpperCase() + param.slice(1)} (s)`,
                <input type="number" name={param} value={data[param] || 0.1} onChange={handleParameterChange} style={inputStyles} step="0.01" min="0"/>
              )
            )}
          </>
        );
      
      case 'instrument':
          return (
              <>
                {renderParameterControl('name', 'Instrument Name', 
                    <input type="text" name="name" value={data.name || ''} onChange={handleParameterChange} style={inputStyles}/>,
                    false
                )}
              </>
          );

      default:
        return <p>This node has no configurable parameters.</p>;
    }
  };

  return (
    <div style={panelStyles}>
      <div style={headerStyles}>
        <h3>{selectedNode.data.label || selectedNode.type}</h3>
      </div>
      {renderParameters()}
    </div>
  );
};

export default ParameterPanel;
