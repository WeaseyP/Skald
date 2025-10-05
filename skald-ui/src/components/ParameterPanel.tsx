import React from 'react';
import { Node, Edge } from 'reactflow';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';
import { AdsrParams, BpmSynchronizable, FilterParams, LfoParams, MixerParams, NodeParams, OscillatorParams, SampleHoldParams, WavetableParams } from '../../definitions/types';

// --- STYLES (existing styles remain unchanged) ---
const panelStyles: React.CSSProperties = { /* ... */ };
const headerStyles: React.CSSProperties = { /* ... */ };
const subHeaderStyles: React.CSSProperties = { /* ... */ };
const inputGroupStyles: React.CSSProperties = { /* ... */ };
const labelContainerStyles: React.CSSProperties = { /* ... */ };
const labelStyles: React.CSSProperties = { /* ... */ };
const inputStyles: React.CSSProperties = { /* ... */ };
const iconButtonStyles: React.CSSProperties = { /* ... */ };

// --- ICONS (existing icon remains unchanged) ---
const LinkIcon: React.FC<{ isExposed: boolean }> = ({ isExposed }) => ( <svg>...</svg> );


// --- PROPS INTERFACE ---

interface ParameterPanelProps {
    selectedNode: Node<NodeParams> | null;
    onUpdateNode: (nodeId: string, data: Partial<NodeParams>, subNodeId?: string) => void;
    allNodes: Node<NodeParams>[];
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
        const dataToUpdate: Partial<NodeParams> = typeof value === 'object' && !Array.isArray(value)
            ? value
            : { [paramName]: value } as Partial<NodeParams>;

        onUpdateNode(selectedNode!.id, dataToUpdate, subNodeId);
    };
    
    const handleMixerLevelChange = (channelId: number, newLevel: number, subNodeId?: string) => {
        const nodeToUpdate = subNodeId ? allNodes.find(n => n.id === subNodeId) : selectedNode;
        if (!nodeToUpdate || nodeToUpdate.type !== 'mixer') return;

        const currentData = nodeToUpdate.data as MixerParams;
        const newLevels = currentData.levels.map(ch => 
            ch.id === channelId ? { ...ch, level: newLevel } : ch
        );
        
        onUpdateNode(selectedNode!.id, { levels: newLevels }, subNodeId);
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
        const nodeIdToUpdate = subNodeId || selectedNode!.id;
        const nodeToUpdate = allNodes.find(n => n.id === nodeIdToUpdate);
        if (!nodeToUpdate) return;

        const currentExposed = nodeToUpdate.data.exposedParameters || [];
        const isExposed = currentExposed.includes(paramKey);
        
        const newExposed = isExposed
            ? currentExposed.filter(p => p !== paramKey)
            : [...currentExposed, paramKey];

        onUpdateNode(selectedNode!.id, { exposedParameters: newExposed }, subNodeId);
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
        // ... (implementation remains the same)
    };

    const renderBpmSyncToggle = (node: Node<BpmSynchronizable>, subNodeId?: string) => {
        // ... (implementation remains the same, but benefits from typed `node` prop)
    };

    const renderNodeParameters = (node: Node<NodeParams>, subNodeId?: string) => {
        const { type, data } = node;
        
        const createControl = (paramKey: string, label: string, children: React.ReactNode, isExposable: boolean = true) => {
            const isExposed = data.exposedParameters?.includes(paramKey) || false;
            return renderParameterControl(paramKey, label, children, isExposable, isExposed, () => toggleParameterExposure(paramKey, subNodeId || node.id));
        };
        
        const createSelect = (paramKey: keyof NodeParams, options: string[]) => (
            <select name={paramKey} value={(data as any)[paramKey]} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={inputStyles}>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        );

        switch (type) {
            case 'adsr': {
                const adsrData = data as AdsrParams;
                return ( <>
                    <AdsrEnvelopeEditor 
                        value={{ attack: adsrData.attack, decay: adsrData.decay, sustain: adsrData.sustain, release: adsrData.release }}
                        onChange={(newAdsr) => handleParameterChange('adsr', newAdsr, subNodeId || node.id)}
                    />
                    {createControl('depth', 'Depth', 
                        <CustomSlider min={0} max={1} value={adsrData.depth} onChange={val => handleParameterChange('depth', val, subNodeId || node.id)} />
                    )}
                    {createControl('velocitySensitivity', 'Velocity Sens.', 
                        <CustomSlider min={0} max={1} value={adsrData.velocitySensitivity} onChange={val => handleParameterChange('velocitySensitivity', val, subNodeId || node.id)} />
                    )}
                </> );
            }
            case 'filter': {
                const filterData = data as FilterParams;
                return ( <>
                    {createControl('type', 'Filter Type', createSelect('type', ['Lowpass', 'Highpass', 'Bandpass', 'Notch']), false )}
                    <XYPad
                        xValue={filterData.cutoff}
                        yValue={filterData.resonance}
                        minX={20} maxX={20000} minY={0.1} maxY={30}
                        onChange={({x, y}) => handleParameterChange('filter', { cutoff: x, resonance: y }, subNodeId || node.id)}
                        xScale="log" yScale="log"
                    />
                    <div>Cutoff: {filterData.cutoff.toFixed(2)} Hz</div>
                    <div>Resonance: {filterData.resonance.toFixed(2)}</div>
                </> );
            }
            case 'lfo': {
                const lfoData = data as LfoParams;
                return ( <>
                    {createControl('waveform', 'Waveform', createSelect('waveform', ['Sine', 'Sawtooth', 'Triangle', 'Square']), false )}
                    {lfoData.bpmSync 
                        ? createControl('syncRate', 'Sync Rate', <BpmSyncControl value={lfoData.syncRate!} onChange={val => handleParameterChange('syncRate', val, subNodeId || node.id)} />)
                        : createControl('frequency', 'Frequency (Hz)', <CustomSlider min={0.1} max={50} value={lfoData.frequency} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />)
                    }
                    {createControl('amplitude', 'Amplitude (Depth)', <CustomSlider min={0} max={1} value={lfoData.amplitude} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />)}
                    {renderBpmSyncToggle(node as Node<BpmSynchronizable>, subNodeId)}
                </> );
            }
            case 'mixer': {
                const mixerData = data as MixerParams;
                return (
                    <>
                        {mixerData.levels.map(channel =>
                            createControl(`level${channel.id}`, `Input ${channel.id} Level`,
                                <CustomSlider min={0} max={1} value={channel.level} onChange={val => handleMixerLevelChange(channel.id, val, subNodeId || node.id)} />
                            , true)
                        )}
                    </>
                );
            }
            case 'oscillator': {
                const oscData = data as OscillatorParams;
                 return ( <>
                    {createControl('waveform', 'Waveform', createSelect('waveform', ['Sawtooth', 'Sine', 'Triangle', 'Square']), false )}
                    {createControl('frequency', 'Frequency (Hz)', <CustomSlider min={20} max={20000} value={oscData.frequency} onChange={val => handleParameterChange('frequency', val, subNodeId || node.id)} scale="log" />)}
                    {createControl('amplitude', 'Amplitude', <CustomSlider min={0} max={1} value={oscData.amplitude} onChange={val => handleParameterChange('amplitude', val, subNodeId || node.id)} />)}
                    {oscData.waveform === 'Square' && createControl('pulseWidth', 'Pulse Width', <CustomSlider min={0.01} max={0.99} value={oscData.pulseWidth} onChange={val => handleParameterChange('pulseWidth', val, subNodeId || node.id)} /> )}
                    {createControl('phase', 'Phase', <CustomSlider min={0} max={360} value={oscData.phase} onChange={val => handleParameterChange('phase', val, subNodeId || node.id)} />)}
                </> );
            }
            // ... (other cases would be similarly refactored with type assertions)
            
            default:
                // Fallback for nodes that haven't been explicitly typed yet
                return <p>Parameters for node type '{type}' are not yet configured in the new panel.</p>;
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
