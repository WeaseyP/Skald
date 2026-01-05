import React, { useMemo } from 'react';
import { Node } from 'reactflow';
import { NumberInput } from '../common/NumberInput';
import { SequencerTrack, NoteEvent } from '../../definitions/types';
import { NodeParameterControls } from '../NodeParameterControls';

interface StepPropertiesEditorProps {
    trackId: string;
    step: number; // 0-indexed
    track?: SequencerTrack;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>) => void;
    instrumentNode?: Node | null;
    onExport?: () => void;
}

const styles = {
    labelContainer: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '5px',
    } as React.CSSProperties,
    label: {
        fontWeight: 'bold',
        color: '#CCCCCC'
    } as React.CSSProperties,
    iconButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    } as React.CSSProperties,
    subHeader: {
        borderBottom: '1px solid #444',
        paddingBottom: '5px',
        marginBottom: '10px',
        marginTop: '20px',
        fontSize: '0.9em',
        color: '#a0aec0'
    } as React.CSSProperties,
    inputGroup: {
        marginBottom: '15px',
    } as React.CSSProperties,
};

// Lock Icon (Closed = Locked/Global, Open = Unlocked/Override)
const LockIcon: React.FC<{ isLocked: boolean }> = ({ isLocked }) => (
    <span style={{ fontSize: '1.2em', lineHeight: 1 }}>
        {isLocked ? '🔒' : '🔓'}
    </span>
);

export const StepPropertiesEditor: React.FC<StepPropertiesEditorProps> = ({ trackId, step, track, onUpdateNote, instrumentNode }) => {
    if (!track) return <div>Track not found</div>;

    const note = track.notes.find(n => n.step === step);

    if (!note) {
        return (
            <div style={{ color: '#888', fontStyle: 'italic' }}>
                No note at Step {step}.
            </div>
        );
    }

    // Iterate through instrument subgraph nodes
    const internalNodes = useMemo(() => {
        if (instrumentNode && instrumentNode.type === 'instrument' && instrumentNode.data.subgraph) {
            return instrumentNode.data.subgraph.nodes as Node[];
        }
        return [];
    }, [instrumentNode]);


    const handleOverrideChange = (paramKey: string, newValue: any) => {
        // Auto-unlock (create override) on change
        onUpdateNote(trackId, step, {
            patchOverrides: { ...note.patchOverrides, [paramKey]: newValue }
        });
    };

    const toggleLock = (paramKey: string, currentGlobalValue: any) => {
        const isOverridden = note.patchOverrides && note.patchOverrides.hasOwnProperty(paramKey);
        const newOverrides = { ...note.patchOverrides };

        if (isOverridden) {
            // Lock (Remove Override)
            delete newOverrides[paramKey];
        } else {
            // Unlock (Create Override with current global)
            // We need to know the current gloval value!
            // Passing currentGlobalValue here allows us to "start" the override at the current value
            newOverrides[paramKey] = currentGlobalValue; // Use passed global value
        }
        onUpdateNote(trackId, step, { patchOverrides: newOverrides });
    };

    const renderNodeOverrides = (node: Node) => {
        const { id, data } = node;
        const label = data.label || node.type;

        // Wrapper for NodeParameterControls
        const wrapper = (paramName: string, paramLabel: string, control: React.ReactNode) => {
            // Construct key as "Label:ParamName" to match previous logic.
            // Wait, previous logic was `${label}:${paramName}`.
            // ParameterPanel passes simple paramName to onChange.
            // We need to map simple paramName back to unique key!
            const paramKey = `${label}:${paramName}`;

            // Check if overridden
            const isOverridden = note.patchOverrides && note.patchOverrides.hasOwnProperty(paramKey);
            const isLocked = !isOverridden;

            // If locked, we want to show global value.
            // But NodeParameterControls uses `values` prop.
            // If we pass `values={merged_data}`, it renders correctly.

            // For the TOGGLE, we need global value.
            // `data` from `node` IS the global data.
            const globalValue = data[paramName];

            // If Locked, control might be disabled or just act as "Auto-Unlocker".
            // User requested: "Changing one parameter unlocks that parameter".
            // So control is always enabled.

            return (
                <div style={styles.inputGroup} key={paramKey}>
                    <div style={styles.labelContainer}>
                        <label style={styles.label}>{paramLabel}</label>
                        <button
                            style={styles.iconButton}
                            onClick={() => toggleLock(paramKey, globalValue)}
                            title={isLocked ? "Unlock (Create Override)" : "Lock (Reset to Global)"}
                        >
                            <LockIcon isLocked={isLocked} />
                        </button>
                    </div>
                    {/* 
                       We wrap control in a div that captures interactions?? 
                       No, NodeParameterControls passes onChange. 
                       We just render the control.
                       But wait, if we want visuals to look "Locked", maybe opacity?
                    */}
                    <div style={{ opacity: isLocked ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                        {control}
                    </div>
                </div>
            );
        };

        // We construct a "values" object that mimics node.data but has overrides applied
        // BUT `NodeParameterControls` expects `values` to have simple keys (frequency, etc).
        // `note.patchOverrides` uses keys like "Osc:frequency".
        // So we must "demux" the overrides for this SPECIFIC node.

        const nodeOverrides: Record<string, any> = {};
        if (note.patchOverrides) {
            Object.entries(note.patchOverrides).forEach(([key, val]) => {
                const [targetLabel, targetParam] = key.split(':');
                if (targetLabel === label) {
                    nodeOverrides[targetParam] = val;
                }
            });
        }

        const effectiveValues = { ...data, ...nodeOverrides };

        return (
            <NodeParameterControls
                node={node}
                values={effectiveValues}
                onChange={(paramName, val) => handleOverrideChange(`${label}:${paramName}`, val)}
                renderControlWrapper={wrapper}
            />
        );
    };


    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Note Properties */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Note (MIDI)</label>
                    <NumberInput
                        value={note.note}
                        onChange={(val) => onUpdateNote(trackId, step, { note: val })}
                        min={0} max={127}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Duration</label>
                    <NumberInput
                        value={note.duration || 1}
                        onChange={(val) => onUpdateNote(trackId, step, { duration: val })}
                        min={1} max={16}
                    />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Vel ({Math.round(note.velocity * 100)}%)</label>
                    <input
                        type="range"
                        min={0} max={1} step={0.01}
                        value={note.velocity}
                        onChange={(e) => onUpdateNote(trackId, step, { velocity: parseFloat(e.target.value) })}
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Prob ({Math.round((note.probability ?? 1) * 100)}%)</label>
                    <input
                        type="range"
                        min={0} max={1} step={0.01}
                        value={note.probability ?? 1}
                        onChange={(e) => onUpdateNote(trackId, step, { probability: parseFloat(e.target.value) })}
                        style={{ width: '100%' }}
                    />
                </div>
            </div>


            {/* Instrument Parameters Section */}
            <div style={{ borderTop: '1px solid #444', paddingTop: '10px', marginTop: '5px' }}>
                <label style={{ fontSize: '0.8em', color: '#ccc', fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>Instrument Parameters</label>

                {internalNodes.length === 0 && (
                    <div style={{ fontSize: '0.75em', color: '#666', fontStyle: 'italic' }}>
                        No automatable parameters found.
                    </div>
                )}

                {internalNodes.map(node => (
                    <div key={node.id}>
                        <h4 style={styles.subHeader}>{node.data.label || node.type}</h4>
                        {renderNodeOverrides(node)}
                    </div>
                ))}

            </div>
        </div>
    );
};
