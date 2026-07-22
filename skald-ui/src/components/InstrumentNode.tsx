import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NumberInput } from './common/NumberInput';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    inputGroupStyles, numberInputStyles, NodeTheme, accentFor,
} from './Nodes/NodeStyles';
import { useNodeParamUpdater } from './Nodes/ParamNode';

const accent = accentFor('instrument');

const InstrumentNode = ({ id, data }: NodeProps) => {
    const update = useNodeParamUpdater(id);
    const inputs: string[] = data.inputs || [];
    const outputs: string[] = data.outputs || [];

    // Double-click the title to rename. The name flows into the generated
    // asset prefix (TestSynth_trigger etc.) on the next Generate — it was
    // only settable once, in the creation modal.
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const startEditing = () => {
        setDraft(data.name || 'Instrument');
        setEditing(true);
    };
    const commit = () => {
        const name = draft.trim();
        if (name) update({ name });
        setEditing(false);
    };

    return (
        <div style={{ ...nodeShellStyles(accent), minWidth: '180px' }}>
            {editing ? (
                <input
                    className="nodrag"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                    style={{
                        ...numberInputStyles,
                        width: '100%',
                        textAlign: 'center',
                        marginBottom: '10px',
                        fontWeight: 600,
                    }}
                />
            ) : (
                <div
                    style={{ ...nodeHeaderStylesFor(accent), cursor: 'text' }}
                    onDoubleClick={startEditing}
                    title="Double-click to rename"
                >
                    {data.name || 'Instrument'}
                </div>
            )}

            {inputs.length > 0 ? (
                inputs.map((portName: string) => (
                    <div key={`in-${portName}`} style={handleContainerStyles}>
                        <Handle type="target" position={Position.Left} id={portName}
                            style={{ background: NodeTheme.colors.handleIn }} />
                        <span style={{ marginLeft: '12px', ...labelStyles }}>{portName}</span>
                    </div>
                ))
            ) : (
                <div style={handleContainerStyles}>
                    <Handle type="target" position={Position.Left} id="input"
                        style={{ background: NodeTheme.colors.handleIn }} />
                    <span style={{ marginLeft: '12px', ...labelStyles }}>In</span>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '10px 0' }}>
                <div style={inputGroupStyles}>
                    <label style={{ color: NodeTheme.colors.textMuted, marginRight: '8px' }}>Volume</label>
                    <NumberInput className="nodrag" style={numberInputStyles}
                        min={0} max={1} step={0.05}
                        value={typeof data.volume === 'number' ? data.volume : 1.0}
                        onChange={(val) => update({ volume: val })} />
                </div>
            </div>

            {outputs.length > 0 ? (
                outputs.map((portName: string) => (
                    <div key={`out-${portName}`} style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                        <span style={{ marginRight: '12px', ...labelStyles }}>{portName}</span>
                        <Handle type="source" position={Position.Right} id={portName}
                            style={{ background: NodeTheme.colors.handleOut }} />
                    </div>
                ))
            ) : (
                <div style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                    <span style={{ marginRight: '12px', ...labelStyles }}>Out</span>
                    <Handle type="source" position={Position.Right} id="output"
                        style={{ background: NodeTheme.colors.handleOut }} />
                </div>
            )}
        </div>
    );
};

export default memo(InstrumentNode);
