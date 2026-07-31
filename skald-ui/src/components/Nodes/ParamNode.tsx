/*
================================================================================
| FILE: skald-ui/src/components/Nodes/ParamNode.tsx                            |
|                                                                              |
| Spec-driven node builder: every node built from makeParamNode gets the SAME  |
| visual language as ADSR/Filter — dark card, accent-colored header/border     |
| (one fixed color per node type), labeled input rows on the left, editable    |
| inline controls in the body, output rows on the right. Handle ids are taken |
| verbatim from the spec, so existing saves and the codegen port contract are  |
| untouched.                                                                   |
================================================================================
*/
import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { NodeParams } from '../../definitions/types';
import { NumberInput } from '../common/NumberInput';
import {
    nodeShellStyles, nodeHeaderStylesFor, handleContainerStyles, labelStyles,
    inputGroupStyles, numberInputStyles, selectStyles, NodeTheme, accentFor,
} from './NodeStyles';
import { useGraphActions } from '../../contexts/GraphActionsContext';

export interface PortRow {
    id: string;      // handle id — MUST match the codegen port contract
    label: string;   // what the user sees next to the dot
}

export interface ParamField {
    key: string;
    label: string;
    kind?: 'number' | 'select' | 'toggle';
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    // Value to render when the node's data has no entry for `key` — which is
    // what every patch saved before the parameter existed looks like. Without
    // it the card showed 0 while the generated code played the codegen
    // fallback (Wavetable amplitude: card said "Amp 0", engine played 1.0).
    // Set it to the codegen fallback, NOT to a value written back into the
    // node: this is a read-time default, not a backfill (roadmap §4
    // constraint 4 gates schema-touching writes behind C1's version field).
    default?: number;
    // Hide fields that only mean something in a certain mode (e.g. the
    // frequency box only when fixedPitch is on — an editable-but-inert
    // control is a lie).
    showIf?: (data: Record<string, any>) => boolean;
}

export interface ParamNodeConfig {
    type: string;    // React Flow type — selects the fixed accent color
    title: string;
    inputs?: PortRow[];
    outputs?: PortRow[];
    fields?: ParamField[];
}

// Shared write-through updater: on-canvas edits must land in useGraphState
// (the store the audio engine, save and codegen read) — writing to React
// Flow's internal store was never heard and snapped back visually.
export const useNodeParamUpdater = (id: string) => {
    const graphActions = useGraphActions();
    const { setNodes } = useReactFlow();
    return (changes: Record<string, unknown>) => {
        if (graphActions) {
            graphActions.updateNodeData(id, changes);
            return;
        }
        // Fallback for isolated rendering (tests) without the app provider.
        setNodes((nds) => nds.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...changes } } : node
        ));
    };
};

const FieldControl: React.FC<{
    field: ParamField;
    data: Record<string, any>;
    update: (changes: Record<string, unknown>) => void;
}> = ({ field, data, update }) => {
    const value = data[field.key];
    if (field.kind === 'select') {
        return (
            <select
                className="nodrag"
                style={selectStyles}
                value={String(value ?? field.options?.[0] ?? '')}
                onChange={(e) => update({ [field.key]: e.target.value })}
            >
                {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }
    if (field.kind === 'toggle') {
        return (
            <input
                type="checkbox"
                className="nodrag"
                checked={!!value}
                onChange={(e) => update({ [field.key]: e.target.checked })}
            />
        );
    }
    return (
        <NumberInput
            className="nodrag"
            style={numberInputStyles}
            min={field.min}
            max={field.max}
            step={field.step ?? 0.1}
            value={typeof value === 'number' ? value : Number(value ?? field.default ?? 0)}
            onChange={(val) => update({ [field.key]: val })}
        />
    );
};

// A spec-driven node card, with its spec still readable off the component.
// `paramSpec` is what lets the card/sidebar parity test assert that a card's
// `fields` covers every parameter the sidebar offers for that node type —
// the cheap stand-in for C2's generated node schema.
export type ParamNodeComponent =
    React.MemoExoticComponent<React.FC<NodeProps<Node<NodeParams>>>> & { paramSpec: ParamNodeConfig };

export const makeParamNode = (cfg: ParamNodeConfig): ParamNodeComponent => {
    const accent = accentFor(cfg.type);
    const Component: React.FC<NodeProps<Node<NodeParams>>> = ({ id, data }) => {
        const update = useNodeParamUpdater(id);
        const visibleFields = (cfg.fields ?? []).filter(f => !f.showIf || f.showIf(data));
        return (
            <div style={nodeShellStyles(accent)}>
                <div style={nodeHeaderStylesFor(accent)}>
                    {data.label || cfg.title}
                </div>

                {(cfg.inputs ?? []).map((port) => (
                    <div key={port.id} style={handleContainerStyles}>
                        <Handle type="target" position={Position.Left} id={port.id}
                            style={{ background: NodeTheme.colors.handleIn }} />
                        <span style={{ marginLeft: '12px', ...labelStyles }}>{port.label}</span>
                    </div>
                ))}

                {visibleFields.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '10px 0' }}>
                        {visibleFields.map((field) => (
                            <div key={field.key} style={inputGroupStyles}>
                                <label style={{ color: NodeTheme.colors.textMuted, marginRight: '8px' }}>{field.label}</label>
                                <FieldControl field={field} data={data} update={update} />
                            </div>
                        ))}
                    </div>
                )}

                {(cfg.outputs ?? []).map((port) => (
                    <div key={port.id} style={{ ...handleContainerStyles, justifyContent: 'flex-end' }}>
                        <span style={{ marginRight: '12px', ...labelStyles }}>{port.label}</span>
                        <Handle type="source" position={Position.Right} id={port.id}
                            style={{ background: NodeTheme.colors.handleOut }} />
                    </div>
                ))}
            </div>
        );
    };
    Component.displayName = `ParamNode(${cfg.title})`;
    const wrapped = memo(Component) as ParamNodeComponent;
    wrapped.paramSpec = cfg;
    return wrapped;
};
