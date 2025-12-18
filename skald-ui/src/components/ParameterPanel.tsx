import React from 'react';
import { Node, Edge } from 'reactflow';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';
import { GainParams } from '../../definitions/types';

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
    allNodes: Node[];
    allEdges: Edge[];
    bpm: number;
}


// --- MAIN COMPONENT ---

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode, allNodes, bpm }) => {

    if (!selectedNode) {
        return <div style={panelStyles}><p>Select a node to edit its parameters.</p></div>;
    }

    // --- EVENT HANDLERS ---

    const handleParameterChange = (paramName: string, value: any, subNodeId?: string) => {
        const dataToUpdate = typeof value === 'object' && !Array.isArray(value) 
            ? value 
            : { [paramName]: value };
        
        if (subNodeId) {
            const subNode = allNodes.find(n => n.id === subNodeId) || selectedNode.data.subgraph?.nodes.find(n => n.id === subNodeId);
            if (!subNode) return;
            const newData = { ...subNode.data, ...dataToUpdate };
            onUpdateNode(selectedNode.id, newData, subNodeId);
            return;
        }

        const newData = { ...selectedNode.data, ...dataToUpdate };
        onUpdateNode(selectedNode.id, newData);
    };

    const handleMixerChange = (channelId: number, newLevel: number, subNodeId?: string) => {
        const nodeToUpdate = subNodeId 
            ? (allNodes.find(n => n.id === subNodeId) || selectedNode.data.subgraph?.nodes.find(n => n.id === subNodeId))
            : selectedNode;

        if (!nodeToUpdate || nodeToUpdate.type !== 'mixer') return;

        const currentLevels = nodeToUpdate.data.levels || [];
        const newLevels = currentLevels.map(ch => 
            ch.id === channelId ? { ...ch, level: newLevel } : ch
        );
        
        handleParameterChange('levels', newLevels, subNodeId);
    };

    const handleGenericChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, subNodeId?: string) => {
        const { name, value, type } = e.target;
        let parsedValue: string | number | boolean = value;

        if (type === 'checkbox') {
            parsedValue = (e.target as HTMLInputElement).checked;
        } else if (type === 'number' || type === 'range') {
            parsedValue = parseFloat(value);
        }
        handleParameterChange(name, parsedValue, subNodeId);
    };

    const toggleParameterExposure = (paramKey: string, subNodeId?: string) => {
        const nodeIdToUpdate = subNodeId || selectedNode.id;
        const nodeToUpdate = allNodes.find(n => n.id === nodeIdToUpdate) || selectedNode.data.subgraph?.nodes.find(n => n.id === nodeIdToUpdate);
        if(!nodeToUpdate) return;

        const currentExposed: string[] = nodeToUpdate.data.exposedParameters || [];
        const isExposed = currentExposed.includes(paramKey);
        
        const newExposed = isExposed
            ? currentExposed.filter(p => p !== paramKey)
            : [...currentExposed, paramKey];

        const newData = { ...nodeToUpdate.data, exposedParameters: newExposed };
        onUpdateNode(selectedNode.id, newData, subNodeId);
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

    const renderBpmSyncToggle = (node: Node, subNodeId?: string) => {
        const { data } = node;
        const isBpmSyncExposed = data.exposedParameters?.includes('bpmSync') || false;
        const uniqueId = `bpmSyncCheckbox-${subNodeId || node.id}`;

        return (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <label htmlFor={uniqueId} style={{...labelStyles, cursor: 'pointer'}}>
                    BPM Sync
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                        id={uniqueId}
                        type="checkbox"
                        name="bpmSync"
                        checked={data.bpmSync || false}
                        onChange={(e) => handleGenericChange(e, subNodeId || node.id)}
                        style={{ height: '18px', width: '18px', cursor: 'pointer' }}
                    />
                    <button
                        style={iconButtonStyles}
                        onClick={() => toggleParameterExposure('bpmSync', subNodeId || node.id)}
                        title={isBpmSyncExposed ? 'Un-expose "BPM Sync"' : 'Expose "BPM Sync" to public API'}
                    >
                        <LinkIcon isExposed={isBpmSyncExposed} />
                    </button>
                </div>
            </div>
        );
    };

    const renderNodeParameters = (node: Node, subNodeId?: string) => {
        const { type, data } = node;
        
        const createControl = (paramKey: string, label: string, children: React.ReactNode, isExposable: boolean = true) => {
            const isExposed = data.exposedParameters?.includes(paramKey) || false;
            return renderParameterControl(paramKey, label, children, isExposable, isExposed, () => toggleParameterExposure(paramKey, subNodeId || node.id));
        };
        
        const createSelect = (paramKey: string, options: string[]) => (
            <select name={paramKey} value={data[paramKey]} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={inputStyles}>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        );

        switch (type) {
            case 'adsr':
                return ( <>
                    <AdsrEnvelopeEditor 
                        value={{ attack: data.attack, decay: data.decay, sustain: data.sustain, release: data.release }}
                        onChange={(newAdsr) => handleParameterChange('adsr', newAdsr, subNodeId || node.id)}
                    />
                    {createControl('depth', 'Depth', 
                        <CustomSlider min={0} max={1} value={data.depth ?? 1} onChange={val => handleParameterChange('depth', val, subNodeId || node.id)} />
                    )}
                    {createControl('velocitySensitivity', 'Velocity Sens.', 
                        <CustomSlider min={0} max={1} value={data.velocitySensitivity ?? 0.5} onChange={val => handleParameterChange('velocitySensitivity', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'filter':
                return ( <>
                    {createControl('type', 'Filter Type', createSelect('type', ['Lowpass', 'Highpass', 'Bandpass', 'Notch']), false )}
                    <XYPad
                        xValue={data.cutoff}
                        yValue={data.resonance}
                        minX={20}
                        maxX={20000}
                        minY={0.1}
                        maxY={30}
                        onChange={({x, y}) => handleParameterChange('filter', { cutoff: x, resonance: y }, subNodeId || node.id)}
                        xScale="log"
                        yScale="log"
                    />
                    <div>Cutoff: {(data.cutoff ?? 1000).toFixed(2)} Hz</div>
                    <div>Resonance: {(data.resonance ?? 1).toFixed(2)}</div>
                </> );
            case 'lfo':
                return ( <>
                    {createControl('waveform', 'Waveform', createSelect('waveform', ['Sine', 'Sawtooth', 'Triangle', 'Square']), false )}
                    
                    {data.bpmSync 
                        ? createControl('syncRate', 'Sync Rate', 
                            <BpmSyncControl value={data.syncRate ?? '1/4'} onChange={val => handleParameterChange('syncRate', val, subNodeId || node.id)} />
                          )
                        : createControl('frequency', 'Frequency (Hz)', 
                            <CustomSlider min={0.1} max={50} value={data.frequency ?? 5} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />
                          )
                    }

                    {createControl('amplitude', 'Amplitude (Depth)', 
                        <CustomSlider min={0} max={1} value={data.amplitude ?? 1} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />
                    )}
                    {renderBpmSyncToggle(node, subNodeId)}
                </> );
            case 'delay':
                return ( <>
                    {data.bpmSync 
                        ? createControl('syncRate', 'Sync Rate', 
                            <BpmSyncControl value={data.syncRate ?? '1/8'} onChange={val => handleParameterChange('syncRate', val, subNodeId || node.id)} />
                          )
                        : createControl('delayTime', 'Delay Time (s)', 
                            <CustomSlider min={0.001} max={5} value={data.delayTime ?? 0.5} onChange={val => handleParameterChange('delayTime', val, subNodeId || node.id)} />
                          )
                    }

                    {createControl('feedback', 'Feedback', 
                        <CustomSlider min={0} max={1} value={data.feedback ?? 0.5} onChange={val => handleParameterChange('feedback', val, subNodeId || node.id)} />
                    )}
                    {createControl('mix', 'Wet/Dry Mix', 
                        <CustomSlider min={0} max={1} value={data.mix ?? 0.5} onChange={val => handleParameterChange('mix', val, subNodeId || node.id)} />
                    )}
                    {renderBpmSyncToggle(node, subNodeId)}
                </> );
            case 'sampleHold':
                 return ( <>
                    {data.bpmSync 
                        ? createControl('syncRate', 'Sync Rate', 
                            <BpmSyncControl value={data.syncRate ?? '1/8'} onChange={val => handleParameterChange('syncRate', val, subNodeId || node.id)} />
                          )
                        : createControl('rate', 'Rate (Hz)', 
                            <CustomSlider min={0.1} max={50} value={data.rate ?? 10} onChange={val => handleParameterChange('rate', val, subNodeId || node.id)} scale="log" />
                          )
                    }
                    {createControl('amplitude', 'Amplitude (Depth)', 
                        <CustomSlider min={0} max={1} value={data.amplitude ?? 1} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />
                    )}
                    {renderBpmSyncToggle(node, subNodeId)}
                </> );
            case 'fmOperator':
                return ( <>
                    {createControl('frequency', 'Carrier Freq (Hz)', 
                        <CustomSlider min={20} max={20000} value={data.frequency ?? 440} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />
                    )}
                    {createControl('modIndex', 'Modulation Index', 
                        <CustomSlider min={0} max={1000} value={data.modIndex ?? 100} onChange={val => handleParameterChange('modIndex', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'wavetable':
                return ( <>
                    {createControl('tableName', 'Table', createSelect('tableName', ['Sine', 'Triangle', 'Sawtooth', 'Square']), false )}
                    {createControl('frequency', 'Frequency (Hz)', 
                        <CustomSlider min={20} max={20000} value={data.frequency ?? 440} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />
                    )}
                    {createControl('position', 'Table Position', 
                        <CustomSlider min={0} max={3} value={data.position ?? 0} onChange={val => handleParameterChange('position', val, subNodeId || node.id)} step={0.01} />
                    )}
                </> );
            case 'oscillator':
                return ( <>
                    {createControl('waveform', 'Waveform', createSelect('waveform', ['Sawtooth', 'Sine', 'Triangle', 'Square']), false )}
                    {createControl('frequency', 'Frequency (Hz)', 
                        <CustomSlider min={20} max={20000} value={data.frequency ?? 440} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />
                    )}
                    {createControl('amplitude', 'Amplitude', 
                        <CustomSlider min={0} max={1} value={data.amplitude ?? 0.5} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />
                    )}
                    {data.waveform === 'Square' && createControl('pulseWidth', 'Pulse Width', 
                        <CustomSlider min={0.01} max={0.99} value={data.pulseWidth ?? 0.5} onChange={val => handleParameterChange('pulseWidth', val, subNodeId || node.id)} />
                    )}
                    {createControl('phase', 'Phase', 
                        <CustomSlider min={0} max={360} value={data.phase ?? 0} onChange={val => handleParameterChange('phase', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'noise':
                return ( <>
                    {createControl('type', 'Noise Type', createSelect('type', ['White', 'Pink']), false )}
                    {createControl('amplitude', 'Amplitude', 
                        <CustomSlider min={0} max={1} value={data.amplitude ?? 1} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'reverb':
                return ( <>
                    {createControl('decay', 'Decay (s)', 
                        <CustomSlider min={0.1} max={10} value={data.decay ?? 3} onChange={val => handleParameterChange('decay', val, subNodeId || node.id)} />
                    )}
                    {createControl('preDelay', 'Pre-Delay (s)', 
                        <CustomSlider min={0} max={1} value={data.preDelay ?? 0.01} onChange={val => handleParameterChange('preDelay', val, subNodeId || node.id)} />
                    )}
                    {createControl('mix', 'Wet/Dry Mix', 
                        <CustomSlider min={0} max={1} value={data.mix ?? 0.5} onChange={val => handleParameterChange('mix', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'distortion':
                return ( <>
                    {createControl('drive', 'Drive', 
                        <CustomSlider min={1} max={100} value={data.drive ?? 20} onChange={val => handleParameterChange('drive', val, subNodeId || node.id)} />
                    )}
                    {createControl('tone', 'Tone (Hz)', 
                        <CustomSlider min={100} max={10000} value={data.tone ?? 4000} onChange={val => handleParameterChange('tone', val, subNodeId || node.id)} scale="log" />
                    )}
                    {createControl('mix', 'Wet/Dry Mix', 
                        <CustomSlider min={0} max={1} value={data.mix ?? 0.5} onChange={val => handleParameterChange('mix', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'mixer':
                return (
                    <>
                        {(data.levels || []).map(channel =>
                            createControl(`level${channel.id}`, `Input ${channel.id} Level`,
                                <CustomSlider min={0} max={1} value={channel.level} onChange={val => handleMixerChange(channel.id, val, subNodeId || node.id)} />
                            , true)
                        )}
                    </>
                );
            case 'panner':
                return ( <>
                    {createControl('pan', 'Pan', 
                        <CustomSlider min={-1} max={1} value={data.pan ?? 0} onChange={val => handleParameterChange('pan', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'gain':
                return ( <>
                    {createControl('gain', 'Gain', 
                        <CustomSlider min={0} max={1} value={data.gain ?? 0.75} onChange={val => handleParameterChange('gain', val, subNodeId || node.id)} />
                    )}
                </> );
            case 'instrument':
                return ( <>
                    {createControl('name', 'Instrument Name', 
                         <input type="text" name="name" value={data.name} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={inputStyles} />, false
                    )}
                    <h4 style={subHeaderStyles}>Polyphony</h4>
                    {createControl('voiceCount', 'Voice Count', 
                        <CustomSlider min={1} max={32} step={1} value={data.voiceCount ?? 8} onChange={val => handleParameterChange('voiceCount', val, subNodeId || node.id)} />
                    )}
                    {createControl('glide', 'Glide (s)', 
                        <CustomSlider min={0} max={2} value={data.glide ?? 0.05} onChange={val => handleParameterChange('glide', val, subNodeId || node.id)} />
                    )}
                    <h4 style={subHeaderStyles}>Unison</h4>
                    {createControl('unison', 'Unison Voices', 
                        <CustomSlider min={1} max={16} step={1} value={data.unison ?? 1} onChange={val => handleParameterChange('unison', val, subNodeId || node.id)} />
                    )}
                    {createControl('detune', 'Detune (cents)', 
                        <CustomSlider min={0} max={100} value={data.detune ?? 5} onChange={val => handleParameterChange('detune', val, subNodeId || node.id)} />
                    )}
                    <h4 style={subHeaderStyles}>Internal Nodes</h4>
                    {data.subgraph?.nodes.map((subNode: Node) => (
                        <div key={subNode.id}>
                            <h4 style={subHeaderStyles}>{subNode.data.label || subNode.type}</h4>
                            {renderNodeParameters(subNode, subNode.id)}
                        </div>
                    ))}
                </> );
            case 'group':
                 const childNodes = allNodes.filter(n => n.parentNode === node.id);
                 return (
                     <>
                         {createControl('label', 'Group Name', 
                            <input type="text" name="label" value={data.label} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={inputStyles} />, false
                         )}
                         {childNodes.map((subNode: Node) => (
                             <div key={subNode.id}>
                                 <h4 style={subHeaderStyles}>{subNode.data.label || subNode.type}</h4>
                                 {renderNodeParameters(subNode, subNode.id)}
                             </div>
                         ))}
                     </>
                 );
            case 'InstrumentInput':
                return <p>Instrument input port.</p>;
            case 'InstrumentOutput':
                return <p>Instrument output port.</p>;
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