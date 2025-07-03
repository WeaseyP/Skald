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
  boxSizing: 'border-box',
  overflowY: 'auto',
};

const headerStyles: React.CSSProperties = {
    borderBottom: '1px solid #444',
    paddingBottom: '10px',
    marginBottom: '15px',
}

const subHeaderStyles: React.CSSProperties = {
    borderBottom: '1px solid #444',
    paddingBottom: '5px',
    marginBottom: '10px',
    marginTop: '20px',
    fontSize: '0.9em',
    color: '#a0aec0'
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
  onUpdateNode: (nodeId: string, data: object, subNodeId?: string) => void;
}


// --- MAIN COMPONENT ---

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode }) => {

  if (!selectedNode) {
    return <div style={panelStyles}><p>Select a node to edit its parameters.</p></div>;
  }

  // --- EVENT HANDLERS ---

  const handleParameterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, subNodeId?: string) => {
    const { name, value, type } = e.target;
    let parsedValue: string | number = value;

    if (type === 'number' || type === 'range') {
        parsedValue = parseFloat(value);
    }
    
    if (subNodeId) {
        const subNode = selectedNode.data.subgraph.nodes.find(n => n.id === subNodeId);
        const newData = { ...subNode.data, [name]: parsedValue };
        onUpdateNode(selectedNode.id, newData, subNodeId);
        return;
    }

    const newData = {
      ...selectedNode.data,
      [name]: parsedValue,
    };
    onUpdateNode(selectedNode.id, newData);
  };

  const toggleParameterExposure = (paramKey: string, subNodeId?: string) => {
    if (subNodeId) {
        const subNode = selectedNode.data.subgraph.nodes.find(n => n.id === subNodeId);
        const currentExposed = subNode.data.exposedParameters || [];
        const newExposed = currentExposed.includes(paramKey)
            ? currentExposed.filter(p => p !== paramKey)
            : [...currentExposed, paramKey];
        const newData = { ...subNode.data, exposedParameters: newExposed };
        onUpdateNode(selectedNode.id, newData, subNodeId);
        return;
    }

    const currentExposed: string[] = selectedNode.data.exposedParameters || [];
    const isExposed = currentExposed.includes(paramKey);
    
    let newExposed: string[];
    if (isExposed) {
      newExposed = currentExposed.filter(p => p !== paramKey);
    } else {
      newExposed = [...currentExposed, paramKey];
    }

    const newData = {
      ...selectedNode.data,
      exposedParameters: newExposed,
    };
    onUpdateNode(selectedNode.id, newData);
  };


  // --- RENDER HELPERS ---

  const renderParameterControl = (
    paramKey: string, 
    label: string, 
    children: React.ReactNode, 
    isExposable: boolean = true,
    isExposed: boolean = false,
    onToggle: () => void
  ) => {
    return (
      <div style={inputGroupStyles} key={paramKey}>
        <div style={labelContainerStyles}>
            <label style={labelStyles}>{label}</label>
            {isExposable && (
                 <button 
                    style={iconButtonStyles} 
                    onClick={onToggle}
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

  const renderNodeParameters = (node: Node, subNodeId?: string) => {
    const { type, data } = node;
    
    const createControl = (paramKey: string, label: string, children: React.ReactNode, isExposable: boolean = true) => {
        const isExposed = data.exposedParameters?.includes(paramKey) || false;
        return renderParameterControl(paramKey, label, children, isExposable, isExposed, () => toggleParameterExposure(paramKey, subNodeId));
    };

    const createInput = (paramKey: string, inputType: string, step?: number, min?: number, max?: number) => (
        <input 
            type={inputType} 
            name={paramKey} 
            value={data[paramKey] || ''} 
            onChange={(e) => handleParameterChange(e, subNodeId)} 
            style={inputStyles} 
            step={step} 
            min={min} 
            max={max} 
        />
    );

    switch (type) {
        case 'lfo':
            return ( <>
                {createControl('waveform', 'Waveform', 
                  <select name="waveform" value={data.waveform || 'Sine'} onChange={(e) => handleParameterChange(e, subNodeId)} style={inputStyles}>
                    <option value="Sine">Sine</option>
                    <option value="Sawtooth">Sawtooth</option>
                    <option value="Triangle">Triangle</option>
                    <option value="Square">Square</option>
                  </select>, false )}
                {createControl('frequency', 'Frequency (Hz)', createInput('frequency', 'number', 0.1))}
                {createControl('amplitude', 'Amplitude (Depth)', createInput('amplitude', 'number', 0.01, 0))}
            </> );
        case 'sampleHold':
            return ( <>
                {createControl('rate', 'Rate (Hz)', createInput('rate', 'number', 0.1, 0))}
                {createControl('amplitude', 'Amplitude (Depth)', createInput('amplitude', 'number', 0.01, 0))}
            </> );
        case 'oscillator':
            return ( <>
                {createControl('waveform', 'Waveform', 
                  <select name="waveform" value={data.waveform || 'Sawtooth'} onChange={(e) => handleParameterChange(e, subNodeId)} style={inputStyles}>
                    <option value="Sawtooth">Sawtooth</option>
                    <option value="Sine">Sine</option>
                    <option value="Triangle">Triangle</option>
                    <option value="Square">Square</option>
                  </select>, false )}
                {createControl('frequency', 'Frequency (Hz)', createInput('frequency', 'number', 0.1))}
                {createControl('amplitude', 'Amplitude', createInput('amplitude', 'number', 0.01, 0, 1))}
            </> );
        case 'filter':
            return ( <>
                {createControl('type', 'Filter Type',
                  <select name="type" value={data.type || 'Lowpass'} onChange={(e) => handleParameterChange(e, subNodeId)} style={inputStyles}>
                    <option value="Lowpass">Lowpass</option>
                    <option value="Highpass">Highpass</option>
                    <option value="Bandpass">Bandpass</option>
                  </select>, false )}
                {createControl('cutoff', 'Cutoff (Hz)', createInput('cutoff', 'number', 1))}
            </> );
        case 'noise':
            return ( <>
                {createControl('type', 'Noise Type',
                  <select name="type" value={data.type || 'White'} onChange={(e) => handleParameterChange(e, subNodeId)} style={inputStyles}>
                    <option value="White">White</option>
                    <option value="Pink">Pink</option>
                  </select>, false )}
                 {createControl('amplitude', 'Amplitude', createInput('amplitude', 'number', 0.01, 0, 1))}
            </> );
        case 'adsr':
            return ( <>
                {['attack', 'decay', 'sustain', 'release'].map(param => 
                  createControl(param, `${param.charAt(0).toUpperCase() + param.slice(1)} (s)`,
                    createInput(param, 'number', 0.01, 0)
                  )
                )}
            </> );
        case 'delay':
            return ( <>
                {createControl('delayTime', 'Delay Time (s)', createInput('delayTime', 'number', 0.01, 0))}
                {createControl('feedback', 'Feedback', createInput('feedback', 'number', 0.05, 0, 1))}
                {createControl('mix', 'Mix', createInput('mix', 'number', 0.05, 0, 1))}
            </> );
        case 'reverb':
            return ( <>
                {createControl('decay', 'Decay (s)', createInput('decay', 'number', 0.1, 0))}
                {createControl('preDelay', 'Pre-Delay (s)', createInput('preDelay', 'number', 0.01, 0))}
                {createControl('mix', 'Mix', createInput('mix', 'number', 0.05, 0, 1))}
            </> );
        case 'distortion':
            return ( <>
                {createControl('drive', 'Drive', createInput('drive', 'number', 1, 1))}
                {createControl('tone', 'Tone (Hz)', createInput('tone', 'number', 100, 100))}
                {createControl('mix', 'Mix', createInput('mix', 'number', 0.05, 0, 1))}
            </> );
        case 'mixer':
            const inputCount = data.inputCount || 4;
            const mixerControls = [];
            for (let i = 1; i <= inputCount; i++) {
                const paramKey = `level${i}`;
                mixerControls.push(
                    createControl(paramKey, `Input ${i} Level`,
                        createInput(paramKey, 'range', 0.01, 0, 1)
                    )
                );
            }
            return <>{mixerControls}</>;
        case 'panner':
            return ( <>
                {createControl('pan', 'Pan', createInput('pan', 'range', 0.01, -1, 1))}
            </> );
        case 'instrument':
            return ( <>
                {createControl('name', 'Instrument Name', createInput('name', 'text'), false)}
            </> );
        case 'group':
             return (
                <>
                    {createControl('label', 'Group Name', createInput('label', 'text'), false)}
                    {data.subgraph?.nodes.map((subNode: Node) => (
                        <div key={subNode.id}>
                            <h4 style={subHeaderStyles}>{subNode.data.label || subNode.type}</h4>
                            {renderNodeParameters(subNode, subNode.id)}
                        </div>
                    ))}
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
      {renderNodeParameters(selectedNode)}
    </div>
  );
};

export default ParameterPanel;
