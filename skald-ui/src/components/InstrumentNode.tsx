import React, { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, Node, useNodes } from '@xyflow/react';
import { InstrumentParams, NodeParams } from '../definitions/types';
import { NumberInput } from './common/NumberInput';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    inputGroupStyles, numberInputStyles, NodeTheme, accentFor,
} from './Nodes/NodeStyles';
import { useNodeParamUpdater } from './Nodes/ParamNode';
import { deriveExportId, hasUsableIdentifierChars, sanitizeName } from '../utils/assetIdentity';
import { orderedInstrumentNodes } from '../utils/projectSerializer';

const accent = accentFor('instrument');

const InstrumentNode = ({ id, data }: NodeProps<Node<InstrumentParams>>) => {
    const update = useNodeParamUpdater(id);
    const inputs: string[] = data.inputs || [];
    const outputs: string[] = data.outputs || [];

    // Double-click the title to rename. Since C3 the name is a display label
    // only — the generated asset prefix comes from the Export ID below — so
    // renaming here no longer renames <Foo>_trigger in the game's build.
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

    // C3 (F-B05-4, F-C3-10): the identity the game compiles against, shown on
    // the card. Before C3 nothing on the canvas told the author which symbol
    // an instrument produced, nor which of two same-named instruments had
    // silently become `Keys_2`. The field is committed sanitized exactly as
    // the generator will read it (instrument_export_prefix), an empty field
    // clears the pin (the prefix then derives from the display name), and the
    // resulting `<prefix>_trigger` is printed so there is no guessing.
    const [exportDraft, setExportDraft] = useState(data.exportId ?? '');
    useEffect(() => { setExportDraft(data.exportId ?? ''); }, [data.exportId]);
    const derivedPrefix = deriveExportId(data.name, id);
    const commitExportId = () => {
        const typed = exportDraft.trim();
        if (typed.length === 0) {
            update({ exportId: undefined });
            return;
        }
        const sanitized = sanitizeName(typed);
        if (!hasUsableIdentifierChars(sanitized)) {
            // "---" cannot name a proc; the generator would fall back to the
            // display name, so show that truth rather than keep a dead pin.
            setExportDraft('');
            update({ exportId: undefined });
            return;
        }
        setExportDraft(sanitized);
        update({ exportId: sanitized });
    };
    const effectivePrefix = (() => {
        if (typeof data.exportId === 'string' && data.exportId.length > 0) {
            const s = sanitizeName(data.exportId);
            if (hasUsableIdentifierChars(s)) return s;
        }
        return derivedPrefix;
    })();

    // The asset's index in the emitted project — the wasm shim's integer
    // `asset` argument and the order the processors appear in the file. It
    // is sorted by sanitized node id (orderedInstrumentNodes), which nothing
    // on the canvas showed before (F-C3-10 point 1). Hidden when this node is
    // rendered outside a graph (tests, previews).
    const allNodes = useNodes() as Node<NodeParams>[];
    const assetIndex = orderedInstrumentNodes(allNodes).findIndex(n => n.id === id);

    return (
        <div style={{ ...nodeShellStyles(accent), minWidth: '200px' }}>
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
                    title="Double-click to rename (display name only — the generated symbols come from the Export ID)"
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

                <div style={inputGroupStyles}>
                    <label style={{ color: NodeTheme.colors.textMuted, marginRight: '8px' }}
                        title="The prefix of every generated proc for this asset. Pin it so renaming the instrument never breaks the game's build.">
                        Export ID
                    </label>
                    <input
                        className="nodrag"
                        data-testid="instrument-export-id"
                        value={exportDraft}
                        placeholder={derivedPrefix}
                        onChange={(e) => setExportDraft(e.target.value)}
                        onBlur={commitExportId}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitExportId();
                            if (e.key === 'Escape') setExportDraft(data.exportId ?? '');
                        }}
                        style={{ ...numberInputStyles, width: '110px', textAlign: 'left' }}
                    />
                </div>
                <div
                    data-testid="instrument-export-prefix"
                    style={{ color: NodeTheme.colors.textMuted, fontSize: '10px', fontFamily: 'monospace', textAlign: 'right' }}
                    title="Generated: <Export ID>_trigger, _note_on, _note_off, _process, _set_<param>…"
                >
                    {effectivePrefix}_trigger{assetIndex >= 0 ? `  · asset #${assetIndex}` : ''}
                </div>

                <div style={inputGroupStyles}>
                    <label style={{ color: NodeTheme.colors.textMuted, marginRight: '8px' }}
                        title="One-shot SFX: fired by the game. Music layer: plays its own sequencer track. Auto: decided from the track at Generate time (the pre-C3 rule).">
                        Type
                    </label>
                    <select
                        className="nodrag"
                        data-testid="instrument-asset-type"
                        value={data.assetType === 'sfx' || data.assetType === 'music' ? data.assetType : ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            update({ assetType: v === 'sfx' || v === 'music' ? v : undefined });
                        }}
                        style={{ ...numberInputStyles, width: '110px' }}
                    >
                        <option value="">Auto (from track)</option>
                        <option value="sfx">One-shot SFX</option>
                        <option value="music">Music layer</option>
                    </select>
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
