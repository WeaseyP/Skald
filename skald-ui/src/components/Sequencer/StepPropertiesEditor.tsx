import React, { useMemo } from 'react';
import { Node } from '@xyflow/react';
import { NumberInput } from '../common/NumberInput';
import { SequencerTrack, NoteEvent, NodeParams } from '../../definitions/types';
import { NodeParameterControls } from '../NodeParameterControls';
import {
    firstDeadTarget,
    isExportablePlockValue,
    paramDeadReason,
    plockTargetLabels,
    resolvePlockTargets,
} from '../../utils/plockTargets';

interface StepPropertiesEditorProps {
    trackId: string;
    step: number; // 0-indexed
    // SKB-025: WHICH note on the step is being edited. A step can hold a
    // chord, and this editor used to take `notes.find(n => n.step === step)` —
    // the first member in insertion order — so every pitch, velocity,
    // probability and P-lock edit landed on an arbitrary member regardless of
    // what the user thought they had selected.
    notePitch?: number;
    track?: SequencerTrack;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    // Switch to another member of the same chord.
    onSelectNote?: (trackId: string, step: number, notePitch: number) => void;
    instrumentNode?: Node<NodeParams> | null;
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
    issuePanel: {
        border: '1px solid #b2781a',
        backgroundColor: 'rgba(178, 120, 25, 0.12)',
        borderRadius: '4px',
        padding: '8px',
        fontSize: '0.75em',
        color: '#e8c07a',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    } as React.CSSProperties,
    issueRow: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        justifyContent: 'space-between',
    } as React.CSSProperties,
    removeButton: {
        flex: '0 0 auto',
        background: '#5a2d2d',
        color: '#fff',
        border: '1px solid #a04040',
        borderRadius: '3px',
        padding: '2px 6px',
        cursor: 'pointer',
        fontSize: '0.95em',
    } as React.CSSProperties,
    unavailableNote: {
        fontSize: '0.7em',
        color: '#8a939f',
        fontStyle: 'italic',
    } as React.CSSProperties,
};

// Lock Icon (Closed = Locked/Global, Open = Unlocked/Override)
const LockIcon: React.FC<{ isLocked: boolean }> = ({ isLocked }) => (
    <span style={{ fontSize: '1.2em', lineHeight: 1 }}>
        {isLocked ? '🔒' : '🔓'}
    </span>
);

export const StepPropertiesEditor: React.FC<StepPropertiesEditorProps> = ({ trackId, step, notePitch, track, onUpdateNote, onSelectNote, instrumentNode }) => {
    // All hooks must run before the conditional returns below (Rules of
    // Hooks): toggling between a step with and without a note would
    // otherwise change the hook count between renders and crash React.
    const internalNodes = useMemo(() => {
        if (instrumentNode && instrumentNode.type === 'instrument' && instrumentNode.data.subgraph) {
            return instrumentNode.data.subgraph.nodes as Node<NodeParams>[];
        }
        return [];
    }, [instrumentNode]);

    if (!track) return <div>Track not found</div>;

    // Every note on the step, lowest first — the chord, in a stable order.
    const stepNotes = track.notes.filter(n => n.step === step).slice().sort((a, b) => a.note - b.note);
    // An explicit pitch that is no longer at the step is reported, never
    // silently redirected to a neighbour: that redirection is SKB-025.
    const note = notePitch === undefined ? stepNotes[0] : stepNotes.find(n => n.note === notePitch);

    if (!note) {
        return (
            <div style={{ color: '#888', fontStyle: 'italic' }}>
                No note{notePitch === undefined ? '' : ` at pitch ${notePitch}`} on Step {step}.
            </div>
        );
    }

    // Overrides this step carries that the generator will refuse or discard.
    //
    // SKB-009: a key naming a node that has since been renamed or deleted is a
    // HARD codegen error (collect_plock_targets calls os.exit(1)), so one stale
    // override here stops the whole build — and the step that owns it is the
    // only place it can be deleted.
    // SKB-009 (B5-4-followup): collect_plock_targets' SECOND os.exit(1) — the
    // key resolves to a real node, but param_is_reachable says the parameter
    // is dead under the node's CURRENT configuration (bpmSync/fixedPitch).
    // Reachable when the P-lock was authored (that is the only time the
    // control offering it renders at all) does not mean reachable now: the
    // node's global config can change out from under a step override with no
    // warning anywhere else, and once dead the control that would let you
    // toggle the lock is gone too (NodeParameterControls stops rendering the
    // parameter), so this panel is the ONLY remaining way to see or remove it.
    // SKB-045: a non-numeric value is filtered out by projectSerializer,
    // because the generated per-step setter takes an f32. Correct, and
    // previously silent: the override vanished between preview and export.
    type BrokenOverride =
        | { key: string; value: unknown; kind: 'unresolvable' }
        | { key: string; value: unknown; kind: 'non-numeric' }
        | { key: string; value: unknown; kind: 'dead'; deadParam: string; deadReason: string };
    const brokenOverrides: BrokenOverride[] = [];
    for (const [key, value] of Object.entries(note.patchOverrides ?? {})) {
        // Precedence mirrors collectPlockIssues: unresolvable beats non-numeric
        // beats dead, because a non-numeric value never reaches
        // collect_plock_targets at all (projectSerializer strips it before
        // export), so it can never ALSO be the dead-parameter exit path.
        const resolved = resolvePlockTargets(internalNodes, key);
        if (resolved.length === 0) {
            brokenOverrides.push({ key, value, kind: 'unresolvable' });
        } else if (!isExportablePlockValue(value)) {
            brokenOverrides.push({ key, value, kind: 'non-numeric' });
        } else {
            const dead = firstDeadTarget(internalNodes, resolved);
            if (dead) {
                brokenOverrides.push({
                    key, value, kind: 'dead',
                    deadParam: dead.param,
                    deadReason: paramDeadReason(dead.node, dead.param),
                });
            }
        }
    }
    const validTargets = plockTargetLabels(internalNodes);

    const handleOverrideChange = (paramKey: string, newValue: any) => {
        // Auto-unlock (create override) on change
        onUpdateNote(trackId, step, {
            patchOverrides: { ...note.patchOverrides, [paramKey]: newValue }
        }, note.note);
    };

    const removeOverride = (paramKey: string) => {
        const next = { ...note.patchOverrides };
        delete next[paramKey];
        onUpdateNote(trackId, step, { patchOverrides: next }, note.note);
    };

    const toggleLock = (paramKey: string, currentGlobalValue: any) => {
        const isOverridden = note.patchOverrides && Object.prototype.hasOwnProperty.call(note.patchOverrides, paramKey);
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
        onUpdateNote(trackId, step, { patchOverrides: newOverrides }, note.note);
    };

    const renderNodeOverrides = (node: Node<NodeParams>) => {
        const { id, data } = node;
        const label = data.label || node.type;

        // The override key that ALREADY addresses (this node, paramName),
        // however it was spelled — `osc:frequency`, `Osc:frequency` — or
        // undefined when none does. Resolved through the generator's mirror so
        // the editor edits the key codegen will apply, not a lookalike.
        const existingKeyFor = (paramName: string): string | undefined =>
            Object.keys(note.patchOverrides ?? {}).find(k =>
                resolvePlockTargets([node], k).some(t => t.param === paramName));

        // Wrapper for NodeParameterControls
        const wrapper = (paramName: string, paramLabel: string, control: React.ReactNode) => {
            // Construct key as "Label:ParamName" to match previous logic.
            // Wait, previous logic was `${label}:${paramName}`.
            // ParameterPanel passes simple paramName to onChange.
            // We need to map simple paramName back to unique key!
            const paramKey = existingKeyFor(paramName) ?? `${label}:${paramName}`;

            // Check if overridden
            const isOverridden = note.patchOverrides && Object.prototype.hasOwnProperty.call(note.patchOverrides, paramKey);
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

            // SKB-045: a per-step override reaches the DSP through an
            // f32-only setter, so a parameter whose value is a string or a
            // boolean can never be P-locked. Offering the padlock anyway
            // minted an override that projectSerializer then dropped without a
            // word. The control still renders (it shows the node's value), but
            // the lock is replaced by the reason it is missing — an
            // editable-but-inert affordance is a lie.
            const canPlock = isExportablePlockValue(globalValue) || isOverridden;

            return (
                <div style={styles.inputGroup} key={paramKey}>
                    <div style={styles.labelContainer}>
                        <label style={styles.label}>{paramLabel}</label>
                        {canPlock ? (
                            <button
                                style={styles.iconButton}
                                data-testid={`plock-lock-${paramKey}`}
                                onClick={() => toggleLock(paramKey, globalValue)}
                                title={isLocked ? "Unlock (Create Override)" : "Lock (Reset to Global)"}
                            >
                                <LockIcon isLocked={isLocked} />
                            </button>
                        ) : (
                            <span
                                style={styles.unavailableNote}
                                data-testid={`plock-unavailable-${paramKey}`}
                                title="Per-step overrides are applied through a numeric (f32) setter in the generated code, so only numeric parameters can be automated per step."
                            >
                                not automatable per step
                            </span>
                        )}
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

        // B5-x1: demux through resolvePlockTargets, the generator's mirror,
        // instead of a case-sensitive split-on-every-colon compare. An
        // override authored as `osc:frequency` IS applied by codegen to the
        // node labelled `Osc`, so this panel must show it as applied — and
        // edit THAT key rather than minting a second `Osc:frequency` beside it.
        const nodeOverrides: Record<string, any> = {};
        for (const [key, val] of Object.entries(note.patchOverrides ?? {})) {
            for (const t of resolvePlockTargets([node], key)) nodeOverrides[t.param] = val;
        }

        const effectiveValues = { ...data, ...nodeOverrides };

        return (
            <NodeParameterControls
                node={node}
                values={effectiveValues}
                // B5-x4: a value the f32 setter cannot carry (a syncRate string,
                // the bpmSync boolean) never becomes an override. The serializer
                // already dropped such keys at export (B5-5); this stops them
                // being minted into the save file in the first place.
                onChange={(paramName, val) => handleOverrideChange(existingKeyFor(paramName) ?? `${label}:${paramName}`, val)}
                renderControlWrapper={wrapper}
            />
        );
    };


    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {brokenOverrides.length > 0 && (
                <div style={styles.issuePanel} data-testid="step-plock-issues">
                    <strong>
                        {brokenOverrides.length === 1
                            ? 'One step override on this note is broken'
                            : `${brokenOverrides.length} step overrides on this note are broken`}
                    </strong>
                    {brokenOverrides.map(issue => (
                        <div key={issue.key} style={styles.issueRow}>
                            <span>
                                <code>{issue.key}</code>{' '}
                                {issue.kind === 'unresolvable' ? (
                                    <>
                                        matches no node in this instrument — it was probably renamed or
                                        deleted. Code generation rejects overrides it cannot resolve, so
                                        this stops the whole build. Valid targets:{' '}
                                        {validTargets.length > 0 ? validTargets.join(', ') : 'none'}.
                                    </>
                                ) : issue.kind === 'dead' ? (
                                    <>
                                        targets a parameter that is dead right now — {issue.deadReason}.
                                        Code generation rejects a dead-parameter override, so this stops
                                        the whole build. {issue.deadParam === 'syncRate'
                                            ? 'No node configuration makes `syncRate` live, so the only fix is removing this override.'
                                            : 'Toggle BPM Sync / fixedPitch so the parameter is live again, or remove this override.'}
                                    </>
                                ) : (
                                    <>
                                        holds <code>{JSON.stringify(issue.value)}</code>, which the
                                        generated per-step setter cannot carry — it takes a number. This
                                        override is dropped in both the preview and the export.
                                    </>
                                )}
                            </span>
                            <button
                                style={styles.removeButton}
                                data-testid={`remove-plock-${issue.key}`}
                                onClick={() => removeOverride(issue.key)}
                                title={`Remove the override ${issue.key} from this step`}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {stepNotes.length > 1 && (
                <div
                    data-testid="chord-members"
                    style={{ fontSize: '0.75em', color: '#a0aec0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}
                >
                    <span>This step holds {stepNotes.length} notes — editing</span>
                    {stepNotes.map(member => (
                        <button
                            key={member.note}
                            data-testid={`select-note-${member.note}`}
                            onClick={() => onSelectNote && onSelectNote(trackId, step, member.note)}
                            style={{
                                background: member.note === note.note ? '#007acc' : '#333',
                                color: '#fff',
                                border: '1px solid #444',
                                borderRadius: '3px',
                                padding: '1px 5px',
                                cursor: 'pointer',
                                fontSize: '1em',
                            }}
                            title={`Edit the note at pitch ${member.note}`}
                        >
                            {member.note}
                        </button>
                    ))}
                </div>
            )}

            {/* Note Properties */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Note (MIDI)</label>
                    <NumberInput
                        value={note.note}
                        // The pitch IS the address (SKB-025), so retuning moves
                        // the note out from under the selection: the panel is
                        // driven by `selectedStep.notePitch`, which still names
                        // the OLD pitch after this write lands. Without the
                        // companion select, one keystroke in this box replaced
                        // the whole editor with "No note at pitch <old> on
                        // Step N" and the user had to go back to the grid to
                        // carry on editing the note they had just retuned.
                        // Following the pitch also keeps the selection on the
                        // survivor when a retune absorbs a sibling.
                        onChange={(val) => {
                            onUpdateNote(trackId, step, { note: val }, note.note);
                            if (onSelectNote && val !== note.note) onSelectNote(trackId, step, val);
                        }}
                        min={0} max={127}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Duration</label>
                    <NumberInput
                        value={note.duration || 1}
                        onChange={(val) => onUpdateNote(trackId, step, { duration: val }, note.note)}
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
                        data-testid="step-velocity"
                        onChange={(e) => onUpdateNote(trackId, step, { velocity: parseFloat(e.target.value) }, note.note)}
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.7em', color: '#888', display: 'block' }}>Prob ({Math.round((note.probability ?? 1) * 100)}%)</label>
                    <input
                        type="range"
                        min={0} max={1} step={0.01}
                        value={note.probability ?? 1}
                        data-testid="step-probability"
                        onChange={(e) => onUpdateNote(trackId, step, { probability: parseFloat(e.target.value) }, note.note)}
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
