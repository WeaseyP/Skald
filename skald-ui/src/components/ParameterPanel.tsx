import React from 'react';
import { Node, Edge } from 'reactflow';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';
import { GainParams } from '../definitions/types';
import { StepPropertiesEditor } from './Sequencer/StepPropertiesEditor';
import { SequencerTrack, NoteEvent } from '../definitions/types';
import { NodeParameterControls } from './NodeParameterControls';

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
    // Step Editing
    selectedStep?: { trackId: string, step: number } | null;
    tracks?: SequencerTrack[];
    onUpdateNote?: (trackId: string, step: number, changes: Partial<NoteEvent>) => void;
    onExportStep?: (trackId: string, step: number) => void;
}


// --- MAIN COMPONENT ---

const ParameterPanel: React.FC<ParameterPanelProps> = ({ selectedNode, onUpdateNode, allNodes, bpm, selectedStep, tracks, onUpdateNote, onExportStep }) => {

    if (selectedStep && tracks && onUpdateNote) {
        const track = tracks.find(t => t.id === selectedStep.trackId);
        const instrumentNode = track ? allNodes.find(n => n.id === track.targetNodeId) : null;

        return (
            <div style={panelStyles}>
                <div style={headerStyles}>
                    <h3>Edit Step {selectedStep.step}</h3>
                    <div style={{ fontSize: '0.8em', color: '#888' }}>{track?.name || 'Unknown Track'}</div>
                    {onExportStep && (
                        <button
                            onClick={() => onExportStep(selectedStep.trackId, selectedStep.step)}
                            style={{
                                marginTop: '10px',
                                padding: '6px 12px',
                                background: '#e8590c',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.9em'
                            }}
                        >
                            Export Step to Instrument
                        </button>
                    )}
                </div>
                <StepPropertiesEditor
                    trackId={selectedStep.trackId}
                    step={selectedStep.step}
                    track={track}
                    onUpdateNote={onUpdateNote}
                    instrumentNode={instrumentNode}
                />
            </div>
        );
    }

    if (!selectedNode) {
        return <div style={panelStyles}><p>Select a node or sequencer step to edit parameters.</p></div>;
    }

    // --- EVENT HANDLERS ---

    const handleParameterChange = (paramName: string, value: any, subNodeId?: string) => {
        const dataToUpdate = typeof value === 'object' && !Array.isArray(value)
            ? value
            : { [paramName]: value };

        if (subNodeId) {
            const subNode = allNodes.find((n: Node) => n.id === subNodeId) || selectedNode.data.subgraph?.nodes.find((n: Node) => n.id === subNodeId);
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
            ? (allNodes.find((n: Node) => n.id === subNodeId) || selectedNode.data.subgraph?.nodes.find((n: Node) => n.id === subNodeId))
            : selectedNode;

        if (!nodeToUpdate || nodeToUpdate.type !== 'mixer') return;

        const currentLevels = nodeToUpdate.data.levels || [];
        const newLevels = currentLevels.map((ch: any) =>
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
        const nodeToUpdate = allNodes.find((n: Node) => n.id === nodeIdToUpdate) || selectedNode.data.subgraph?.nodes.find((n: Node) => n.id === nodeIdToUpdate);
        if (!nodeToUpdate) return;

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
                <label htmlFor={uniqueId} style={{ ...labelStyles, cursor: 'pointer' }}>
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

        const handleControlChange = (paramKey: string, value: any) => {
            handleParameterChange(paramKey, value, subNodeId || node.id);
        };

        const wrapper = (paramKey: string, label: string, children: React.ReactNode, isExposable: boolean = true) => {
            const isExposed = data.exposedParameters?.includes(paramKey) || false;
            return renderParameterControl(
                paramKey,
                label,
                children,
                isExposable,
                isExposed,
                () => toggleParameterExposure(paramKey, subNodeId || node.id)
            );
        };

        // Special handling for container types that iterate children
        if (type === 'instrument' || type === 'group') {
            const childNodes = type === 'instrument'
                ? data.subgraph?.nodes
                : allNodes.filter(n => n.parentNode === node.id);

            return (
                <>
                    {/* Render generic controls (name, polyphony etc) via shared component */}
                    <NodeParameterControls
                        node={node}
                        onChange={handleControlChange}
                        renderControlWrapper={wrapper}
                    />

                    {/* Sub-Node Rendering (Specific to Panel) */}
                    {type === 'instrument' && <h4 style={subHeaderStyles}>Internal Nodes</h4>}
                    {childNodes?.map((subNode: Node) => (
                        <div key={subNode.id}>
                            <h4 style={subHeaderStyles}>{subNode.data.label || subNode.type}</h4>
                            {renderNodeParameters(subNode, subNode.id)}
                        </div>
                    ))}
                </>
            );
        }

        // Special handling for Output/Input/Mixer/Mapper/MIDI (Not yet extracted or complex)
        // Ideally extract these too, but for now fallback or implement
        if (type === 'output' || type === 'InstrumentOutput') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p>{type === 'output' ? 'Main Audio Output' : 'Instrument Output Port'}</p>
                    <button
                        onClick={() => handleParameterChange('lastTrigger', Date.now(), subNodeId || node.id)}
                        style={{ ...inputStyles, cursor: 'pointer' }}
                    >
                        Test Audio
                    </button>
                </div>
            );
        }
        if (type === 'InstrumentInput') return <p>Instrument input port.</p>;

        if (type === 'mixer') {
            return (
                <>
                    {(data.levels || []).map((channel: any) =>
                        wrapper(`level${channel.id}`, `Input ${channel.id} Level`,
                            <CustomSlider min={0} max={1} value={channel.level} onChange={val => handleMixerChange(channel.id, val, subNodeId || node.id)} />
                            , true)
                    )}
                </>
            );
        }
        if (type === 'mapper') {
            return (
                <>
                    {wrapper('inMin', 'Input Min', <CustomSlider min={-100} max={100} value={data.inMin ?? 0} onChange={val => handleControlChange('inMin', val)} />)}
                    {wrapper('inMax', 'Input Max', <CustomSlider min={-100} max={100} value={data.inMax ?? 1} onChange={val => handleControlChange('inMax', val)} />)}
                    {wrapper('outMin', 'Output Min', <CustomSlider min={-10000} max={10000} value={data.outMin ?? 0} onChange={val => handleControlChange('outMin', val)} />)}
                    {wrapper('outMax', 'Output Max', <CustomSlider min={-10000} max={10000} value={data.outMax ?? 1} onChange={val => handleControlChange('outMax', val)} />)}
                </>
            );
        }
        if (type === 'midiInput') {
            // ... handle midi input locally for now as it uses local select logic
            return (
                <>
                    {wrapper('device', 'MIDI Device',
                        <select name="device" value={data.device ?? 'All'} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={inputStyles}>
                            <option value="All">All Devices</option>
                            <option value="Device A">Device A (Mock)</option>
                            <option value="Device B">Device B (Mock)</option>
                        </select>,
                        false
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <label style={labelStyles}>Enable MPE</label>
                        <input type="checkbox" name="useMpe" checked={data.useMpe ?? false} onChange={(e) => handleGenericChange(e, subNodeId || node.id)} style={{ height: '18px', width: '18px', cursor: 'pointer' }} />
                    </div>
                </>
            );
        }


        // Default: Use Shared Component
        return (
            <NodeParameterControls
                node={node}
                onChange={handleControlChange}
                renderControlWrapper={wrapper}
            />
        );
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