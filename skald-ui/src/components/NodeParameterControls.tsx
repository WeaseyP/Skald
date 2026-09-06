import React from 'react';
import { Node } from '@xyflow/react';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';
import { NumberInput } from './common/NumberInput';
import { DEFAULT_SYNC_RATE, bpmSyncToggleChanges, formatSyncTime } from '../definitions/bpm';
import { macroTargetCandidates, paramDeadReason, paramIsReachable, plockNodeLabel } from '../utils/plockTargets';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { RandomizeAmount, RANDOMIZE_AMOUNTS, randomizableParamNames, randomizeParams } from '../utils/randomize';
import { lookupRange } from '../definitions/nodeSchema.generated';
import { NodeParams, NoteEvent, SequencerTrack } from '../definitions/types';

interface NodeParameterControlsProps {
    node: Node;
    values?: Record<string, any>; // If provided, overrides node.data
    onChange: (paramName: string, value: any) => void;
    // Write several parameters as ONE delta. Only callers that own node data
    // pass this (the sidebar). The step-properties editor deliberately does
    // not: there every onChange becomes a "<Label>:<param>" P-lock, and a
    // `syncRate` P-lock is a hard codegen error (nothing in any node
    // configuration ever makes syncRate live), so the BPM Sync toggle must
    // stay a single-key write there. See bpmSyncToggleChanges.
    onChangeMany?: (changes: Record<string, unknown>) => void;
    // `inertReason` (packet B2): set when the node's CURRENT configuration
    // means the generated DSP never reads this parameter — an Oscillator's
    // frequency with fixedPitch off, an LFO's frequency with bpmSync on. The
    // control is rendered greyed with this text as its tooltip instead of
    // being hidden, so the user can see the knob exists and what would make
    // it live. Wrappers that do not care (the step editor's) may ignore it.
    renderControlWrapper: (paramKey: string, label: string, control: React.ReactNode, isExposable?: boolean, inertReason?: string) => React.ReactNode;
    // Project tempo, for display only: BPM-synced controls annotate their
    // sync rate with the effective time at this tempo so the user can see
    // what the node actually follows. Optional — callers without a tempo
    // (e.g. isolated step editors) simply get no annotation.
    bpm?: number;
    // Roadmap E12 — live XY-pad macro routing. Writing a macro axis's target
    // means writing a parameter on ANOTHER node inside the instrument's own
    // subgraph, which `onChange`/`onChangeMany` cannot do: both are bound to
    // THIS render's node (or its subNodeId, via the closures ParameterPanel
    // built for it). Only the instrument's own panel render supplies this
    // (ParameterPanel.tsx's `renderNodeParameters`, `type === 'instrument'`
    // branch) — it is undefined everywhere else, including the step editor
    // and every internal-node render, and the section renders nothing
    // without it.
    macroRouting?: {
        internalNodes: Node<NodeParams>[];
        onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
        // Roadmap E12, the remaining half — gestural P-lock recording. Present
        // only when the caller also has a sequencer track and playback state
        // to record the gesture into (ParameterPanel.tsx supplies it in the
        // same `type === 'instrument'` branch that supplies the fields
        // above, for the same reason: only the Instrument's OWN panel render
        // has both). Undefined everywhere `macroRouting` itself is undefined,
        // and MacroPadSection renders no Record UI without it — an
        // Instrument panel rendered outside the app (a bare unit test) just
        // gets the live-routing pad from 44d2f51 with no Record toggle.
        recording?: MacroRecordingProps;
    };
}

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

const labelStyles: React.CSSProperties = {
    fontWeight: 'bold',
    color: '#CCCCCC',
    display: 'block',
    marginBottom: '5px'
}

// The Odin type name `lookupRange`'s node-type overrides are keyed on
// ("LFO", "FmOperator", ...), NOT React Flow's own type string ("lfo",
// "fmOperator"). Mirrors plockTargets.ts's private `nodeCodegenType` — same
// source (NODE_DEFINITIONS), same fallback to the raw type when a node type
// is missing from the manifest (a subgraph node whose type never made it in).
const codegenTypeOf = (node: Node): string => NODE_DEFINITIONS[node.type ?? '']?.codegenType ?? node.type ?? '';

const randomizeSectionStyles: React.CSSProperties = {
    marginTop: '20px',
    paddingTop: '15px',
    borderTop: '1px dashed #444',
};

const presetButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 8px',
    borderRadius: '4px',
    border: active ? '1px solid #3182CE' : '1px solid #555',
    background: active ? '#2c5282' : '#333',
    color: '#E0E0E0',
    cursor: 'pointer',
    fontSize: '0.85em',
});

const rerollButtonStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    cursor: 'pointer',
};

const applyButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: 'none',
    background: '#3182CE',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
};

/** A seed the user can note down and retype to reproduce a result exactly. */
const rollSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/**
 * Roadmap E11: "Evolve / Randomize". Mutates every eligible numeric parameter
 * of the node currently rendered by `NodeParameterControls` — instrument-level
 * fields (Volume, Glide, Unison, Detune) when the Instrument itself is
 * selected, or an internal node's own controls when one of those is selected
 * instead ("the instrument (or selected node) panel", per the brief).
 *
 * Only offered when the caller passed `onChangeMany` (the sidebar's
 * multi-field delta path — see the prop doc above): the per-step P-lock
 * editor's wrapper does not, because there every `onChange` becomes its own
 * P-lock write with its own `pushHistory` call (useSequencerState.ts
 * `updateNote`), so a multi-param randomize there would be N undo entries,
 * not one — breaking the "one undo step per click" exit criterion instead of
 * meeting it.
 */
const RandomizeSection: React.FC<{
    data: Record<string, unknown>;
    nodeType: string;
    onChangeMany: (changes: Record<string, unknown>) => void;
}> = ({ data, nodeType, onChangeMany }) => {
    const [amount, setAmount] = React.useState<RandomizeAmount>('nudge');
    const [seed, setSeed] = React.useState<number>(rollSeed);

    // Computed WITHOUT drawing from the RNG (randomizableParamNames does not
    // seed one), so merely rendering the control never consumes the sequence
    // a later click would produce — same seed still means same result.
    if (randomizableParamNames(data, nodeType).length === 0) return null;

    const handleApply = () => {
        const changes = randomizeParams(data, nodeType, RANDOMIZE_AMOUNTS[amount], seed);
        if (Object.keys(changes).length > 0) onChangeMany(changes);
    };

    return (
        <div style={randomizeSectionStyles}>
            <label style={labelStyles}>Randomize</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                    type="button"
                    data-testid="randomize-amount-nudge"
                    aria-pressed={amount === 'nudge'}
                    title="Nudge every eligible parameter by up to 5% of its authored range"
                    onClick={() => setAmount('nudge')}
                    style={presetButtonStyle(amount === 'nudge')}
                >
                    Nudge (±5%)
                </button>
                <button
                    type="button"
                    data-testid="randomize-amount-evolve"
                    aria-pressed={amount === 'evolve'}
                    title="Evolve every eligible parameter by up to 25% of its authored range"
                    onClick={() => setAmount('evolve')}
                    style={presetButtonStyle(amount === 'evolve')}
                >
                    Evolve (±25%)
                </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.8em', color: '#a0aec0' }}>Seed</label>
                <input
                    type="number"
                    data-testid="randomize-seed"
                    value={seed}
                    onChange={e => setSeed(Math.trunc(Number(e.target.value)) || 0)}
                    style={{ ...numberBoxStylesShared, width: '120px' }}
                />
                <button
                    type="button"
                    data-testid="randomize-reroll"
                    title="Roll a new random seed"
                    onClick={() => setSeed(rollSeed())}
                    style={rerollButtonStyle}
                >
                    🎲
                </button>
            </div>
            <button type="button" data-testid="randomize-apply" onClick={handleApply} style={applyButtonStyle}>
                Randomize
            </button>
        </div>
    );
};

// Hoisted out of the component body (which also declares a `numberBoxStyles`
// local) so RandomizeSection, defined at module scope, can share the look.
const numberBoxStylesShared: React.CSSProperties = {
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#1A202C',
    color: '#E0E0E0',
    fontSize: '0.85em',
};

/** One axis's assignment: a (node, param) target and the range the pad's 0..1 position maps into. */
interface MacroAxisTarget {
    nodeId: string;
    param: string;
    min: number;
    max: number;
}

const macroTargetKey = (nodeId: string, param: string): string => `${nodeId}::${param}`;

/**
 * What MacroPadSection needs to record the pad's gesture into per-step
 * P-locks (E12, the remaining half). `track` is the CURRENT instrument's own
 * sequencer track — `useInstrumentRegistry.ts` guarantees one exists per
 * Instrument node, but the type stays optional because a bare unit-test
 * render, or an instrument mid-deletion, may have none.
 *
 * `onUpdateNote` is `useSequencerState.ts`'s `updateNote`, unchanged from the
 * function ParameterPanel already threads to StepPropertiesEditor for
 * hand-authored P-locks — this is deliberate reuse of that one write path,
 * not a second one, per CLAUDE.md's "one reader" rule. The optional 5th
 * argument (added for this feature) is what lets every step this pass writes
 * share one undo entry; see its doc comment in useSequencerState.ts.
 */
interface MacroRecordingProps {
    instrumentId: string;
    track: SequencerTrack | undefined;
    currentStep: number;
    isPlaying: boolean;
    onUpdateNote: (
        trackId: string,
        step: number,
        changes: Partial<NoteEvent>,
        notePitch?: number,
        historyOverride?: { label: string; gesture: string },
    ) => void;
}

/**
 * Roadmap E12 (live routing half). Each axis of a normalised 0..1 XY pad maps
 * to zero or more (node, param) targets, chosen from `macroTargetCandidates`
 * — "the same target list the P-lock UI offers", per the brief — each with
 * its OWN authored-range-seeded min/max so one axis can drive a 20 Hz-20 kHz
 * cutoff and a 0-1 mix at once. Moving the pad writes every assigned target
 * through `onUpdateNode` (ultimately `updateNodeData`), exactly the path a
 * direct slider drag already uses, so undo already coalesces per (node,
 * field) gesture with no new history logic here — the existing Filter XY
 * pad already produces one `pushHistory` per axis per drag tick this same
 * way (`onChange('cutoff', x); onChange('resonance', y)` above).
 *
 * Assignment is SESSION-ONLY React state, not stored in node.data or the
 * save file. Persisting it would mean a new InstrumentParams field, a
 * saveMigrations.ts entry and serializer/schema test coverage for something
 * that is a live-performance rig setting, not a fact about how the patch
 * sounds — the smaller honest scope this roadmap item asks for when the
 * persistent version would be disproportionate. Keyed by the instrument's
 * own id at the call site so switching instruments starts with a clean
 * assignment instead of one still naming the PREVIOUS instrument's nodes.
 *
 * Recording (capturing the pad's position into per-step P-locks while the
 * sequencer plays) IS implemented below, gated on the optional `recording`
 * prop — see its own doc comment on `flushStep`.
 */
const MacroPadSection: React.FC<{
    internalNodes: Node<NodeParams>[];
    onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
    recording?: MacroRecordingProps;
}> = ({ internalNodes, onUpdateNode, recording }) => {
    // Pure computations, safe even when `internalNodes` is empty (an
    // instrument whose subgraph has nothing automatable yet) — kept ahead of
    // every hook below so nothing declared after them ever has to forward-
    // reference a value from a conditional early return (rules of hooks: the
    // component used to `return null` before any of ITS OWN hooks existed;
    // recording's extra hooks below need the same unconditional hook count on
    // every render, so the "nothing to show" case is now decided only in the
    // final JSX, not by returning early).
    const nodesById = new Map(internalNodes.map(n => [n.id, n] as const));
    const candidates = macroTargetCandidates(internalNodes);

    const [xTargets, setXTargets] = React.useState<MacroAxisTarget[]>([]);
    const [yTargets, setYTargets] = React.useState<MacroAxisTarget[]>([]);
    const [pad, setPad] = React.useState({ x: 0.5, y: 0.5 });
    // Whether a recording PASS (Record on -> Record off) is currently open.
    const [isRecording, setIsRecording] = React.useState(false);
    // The step believed to be under the playhead right now, for THIS pass —
    // null when no pass is open. See flushStep for why the step being LEFT,
    // not the one just entered, is what gets written.
    const prevStepRef = React.useRef<number | null>(null);
    // Whether the pad has been touched since prevStepRef became current.
    // Reset every flush, so a step nothing moved the pad during writes
    // nothing — the brief's "safer than overwriting a whole pattern".
    const touchedRef = React.useRef(false);
    // The last touched pad position, read at flush time (not React state:
    // flushStep runs from an effect whose own render may be a tick or two
    // behind the pointer, and this ref is always current).
    const padPositionRef = React.useRef({ x: 0.5, y: 0.5 });
    // Re-rolled every time Record turns on, so two back-to-back passes never
    // share a gesture key and coalesce with each other.
    const sessionCounterRef = React.useRef(0);
    const gestureRef = React.useRef<{ label: string; gesture: string } | null>(null);

    const addTarget = (axis: 'x' | 'y', key: string) => {
        const idx = key.indexOf('::');
        if (idx < 0) return;
        const nodeId = key.slice(0, idx);
        const param = key.slice(idx + 2);
        const targetNode = nodesById.get(nodeId);
        if (!targetNode) return;
        const setTargets = axis === 'x' ? setXTargets : setYTargets;
        setTargets(prev => {
            if (prev.some(t => t.nodeId === nodeId && t.param === param)) return prev;
            // Same source every other clamp in this file reads: schema/nodes.json,
            // via the generated lookupRange — a starting range, not a guess.
            // Case by case with codegenTypeOf below: the override table is keyed
            // on the BACKEND type name ("Filter" not "filter").
            const range = lookupRange(param, codegenTypeOf(targetNode));
            return [...prev, { nodeId, param, min: range.min, max: range.max }];
        });
    };

    const removeTarget = (axis: 'x' | 'y', nodeId: string, param: string) => {
        const setTargets = axis === 'x' ? setXTargets : setYTargets;
        setTargets(prev => prev.filter(t => !(t.nodeId === nodeId && t.param === param)));
    };

    const updateRange = (axis: 'x' | 'y', nodeId: string, param: string, field: 'min' | 'max', value: number) => {
        if (!Number.isFinite(value)) return;
        const setTargets = axis === 'x' ? setXTargets : setYTargets;
        setTargets(prev => prev.map(t => (t.nodeId === nodeId && t.param === param ? { ...t, [field]: value } : t)));
    };

    // Shared by the live write below and the recorded one in flushStep, so
    // "quantise to the target's schema range" means the exact same formula
    // in both places, not two that could drift.
    const mapAxisValues = (targets: MacroAxisTarget[], position: number): Array<{ nodeId: string; param: string; value: number }> =>
        targets.map(t => ({ nodeId: t.nodeId, param: t.param, value: t.min + position * (t.max - t.min) }));

    const writeAxis = (targets: MacroAxisTarget[], position: number) => {
        for (const { nodeId, param, value } of mapAxisValues(targets, position)) {
            onUpdateNode(nodeId, { [param]: value });
        }
    };

    /**
     * E12, the remaining half. Bakes the LAST touched pad position for the
     * step the playhead is now LEAVING into that step's notes — one merged
     * `patchOverrides` write per note at the step, through `onUpdateNote`,
     * the exact call StepPropertiesEditor's own padlock makes
     * (`onUpdateNote(trackId, step, { patchOverrides: {...} }, notePitch)`),
     * so a recorded lock previews and exports identically to a hand-authored
     * one. No backend change: `generate_sequencer_logic`
     * (skald-backend/core/codegen_project.odin) already emits a P-lock's
     * `<Asset>_set_param` call before that note's `_note_on` for whatever is
     * in `event.patch_overrides`, with no notion of where the value came
     * from.
     *
     * Written on the step being LEFT, not the one just entered: the touch
     * this flush consumes happened while `step` was `prevStepRef.current`
     * (between the previous transition and this one), so that dwell is what
     * it belongs to. The transport stopping (or Record turning off) flushes
     * whatever step is still open, because nothing else ever "leaves" it.
     *
     * Does nothing when: the pad was never touched during this step's dwell,
     * the track has no note at this step (nothing to attach a lock to — the
     * brief's "safer than overwriting a whole pattern"), or neither axis has
     * an assigned target.
     */
    const flushStep = (step: number | null) => {
        if (!recording || step === null || !touchedRef.current) return;
        const track = recording.track;
        const recorded = [
            ...mapAxisValues(xTargets, padPositionRef.current.x),
            ...mapAxisValues(yTargets, padPositionRef.current.y),
        ];
        // Consumed either way: a step this pass passed without a note or a
        // target still shouldn't leave a stale touch for the NEXT step to
        // (mis)claim.
        touchedRef.current = false;
        if (!track || recorded.length === 0) return;
        const notes = track.notes.filter(n => n.step === step);
        if (notes.length === 0) return;

        const historyOverride = gestureRef.current ?? undefined;
        for (const note of notes) {
            const overrides: Record<string, unknown> = { ...note.patchOverrides };
            for (const rt of recorded) {
                const targetNode = nodesById.get(rt.nodeId);
                if (!targetNode) continue;
                overrides[`${plockNodeLabel(targetNode)}:${rt.param}`] = rt.value;
            }
            recording.onUpdateNote(track.id, step, { patchOverrides: overrides }, note.note, historyOverride);
        }
    };

    // Fires whenever the playhead moves to a new step while a pass is open —
    // that transition is what "the step being LEFT" means for flushStep.
    // Also fires the instant Record turns on (isRecording flips), which is
    // harmless: prevStepRef already equals the current step from
    // handleRecordToggle, so the flush condition below is false and this
    // just confirms the baseline.
    React.useEffect(() => {
        if (!isRecording || !recording) return;
        const step = recording.currentStep;
        if (prevStepRef.current !== null && prevStepRef.current !== step) {
            flushStep(prevStepRef.current);
        }
        prevStepRef.current = step;
        // Deliberately narrow deps: `recording` is a fresh object every
        // render (ParameterPanel builds it inline), so depending on it whole
        // would refire this on every render instead of only on a real step
        // change. (No react-hooks lint rule is configured in this project to
        // flag the narrowing, but the reasoning still belongs here.)
    }, [isRecording, recording?.currentStep]);

    // The brief: "when the sequencer stops, recording stops." Flushes
    // whatever step was still open first, same as toggling Record off by
    // hand — a stop mid-gesture should not silently drop it.
    React.useEffect(() => {
        if (isRecording && recording && !recording.isPlaying) {
            flushStep(prevStepRef.current);
            prevStepRef.current = null;
            touchedRef.current = false;
            gestureRef.current = null;
            setIsRecording(false);
        }
    }, [recording?.isPlaying]);

    const handlePadChange = ({ x, y }: { x: number; y: number }) => {
        setPad({ x, y });
        writeAxis(xTargets, x);
        writeAxis(yTargets, y);
        if (isRecording && recording) {
            padPositionRef.current = { x, y };
            touchedRef.current = true;
        }
    };

    /**
     * One recording PASS — Record on to Record off — is ONE undo entry:
     * every step this pass writes shares the same gesture key (re-rolled per
     * pass via `sessionCounterRef` so back-to-back passes never coalesce
     * with each other), and `useEditorHistory`'s gesture coalescing
     * (`GESTURE_IDLE_MS`) is the mechanism that folds them — the same one
     * every other continuous-input gesture in this file already relies on
     * (a slider drag, the live pad above). Holds as long as consecutive
     * recorded steps land within that idle window of each other, true at any
     * tempo/subdivision this app currently supports.
     */
    const handleRecordToggle = () => {
        if (isRecording) {
            flushStep(prevStepRef.current);
            prevStepRef.current = null;
            touchedRef.current = false;
            gestureRef.current = null;
            setIsRecording(false);
            return;
        }
        if (!recording) return;
        sessionCounterRef.current += 1;
        gestureRef.current = {
            label: 'Record macro pad',
            gesture: `macroRecord:${recording.instrumentId}:${sessionCounterRef.current}`,
        };
        prevStepRef.current = recording.currentStep;
        touchedRef.current = false;
        setIsRecording(true);
    };

    const renderAxis = (axis: 'x' | 'y', targets: MacroAxisTarget[]) => {
        const assigned = new Set(targets.map(t => macroTargetKey(t.nodeId, t.param)));
        const available = candidates.filter(c => !assigned.has(macroTargetKey(c.nodeId, c.param)));
        return (
            <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.8em', color: '#a0aec0', display: 'block', marginBottom: '4px' }}>
                    {axis.toUpperCase()} axis
                </label>
                {targets.map(t => (
                    <div
                        key={macroTargetKey(t.nodeId, t.param)}
                        data-testid={`macro-target-${axis}-${t.nodeId}-${t.param}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}
                    >
                        <span style={{ fontSize: '0.8em', color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {plockNodeLabel(nodesById.get(t.nodeId) as Node<NodeParams>)}:{t.param}
                        </span>
                        <input
                            type="number"
                            data-testid={`macro-min-${axis}-${t.nodeId}-${t.param}`}
                            value={t.min}
                            onChange={e => updateRange(axis, t.nodeId, t.param, 'min', parseFloat(e.target.value))}
                            style={{ ...numberBoxStylesShared, width: '70px' }}
                        />
                        <span style={{ color: '#666' }}>..</span>
                        <input
                            type="number"
                            data-testid={`macro-max-${axis}-${t.nodeId}-${t.param}`}
                            value={t.max}
                            onChange={e => updateRange(axis, t.nodeId, t.param, 'max', parseFloat(e.target.value))}
                            style={{ ...numberBoxStylesShared, width: '70px' }}
                        />
                        <button
                            type="button"
                            data-testid={`macro-remove-${axis}-${t.nodeId}-${t.param}`}
                            title={`Remove ${t.param} from the ${axis.toUpperCase()} axis`}
                            onClick={() => removeTarget(axis, t.nodeId, t.param)}
                            style={{ ...rerollButtonStyle, padding: '2px 6px' }}
                        >
                            ✕
                        </button>
                    </div>
                ))}
                <select
                    data-testid={`macro-add-${axis}`}
                    value=""
                    onChange={e => { if (e.target.value) addTarget(axis, e.target.value); }}
                    style={{ ...inputStyles, padding: '4px', fontSize: '0.85em' }}
                >
                    <option value="">+ Add target…</option>
                    {available.map(c => (
                        <option key={macroTargetKey(c.nodeId, c.param)} value={macroTargetKey(c.nodeId, c.param)}>
                            {c.label}:{c.param}
                        </option>
                    ))}
                </select>
            </div>
        );
    };

    // Nothing to route or record without at least one internal node — moved
    // here (past every hook above) instead of an early `return null`, so the
    // hook count this component registers never depends on `internalNodes`.
    if (internalNodes.length === 0) return null;

    return (
        <div style={randomizeSectionStyles}>
            <label style={labelStyles}>Macro Pad</label>
            {recording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <button
                        type="button"
                        data-testid="macro-record-toggle"
                        aria-pressed={isRecording}
                        title={isRecording
                            ? 'Stop recording the pad into P-locks on this track'
                            : "Record the pad's movement into this instrument's track as P-locks while the sequencer plays"}
                        onClick={handleRecordToggle}
                        style={isRecording
                            ? { ...rerollButtonStyle, background: '#a04040', borderColor: '#c05050' }
                            : rerollButtonStyle}
                    >
                        {isRecording ? '⏺ Recording…' : '⏺ Record'}
                    </button>
                </div>
            )}
            {renderAxis('x', xTargets)}
            {renderAxis('y', yTargets)}
            <div data-testid="macro-xy-pad">
                <XYPad
                    xValue={pad.x} yValue={pad.y}
                    minX={0} maxX={1} minY={0} maxY={1}
                    onChange={handlePadChange}
                />
            </div>
        </div>
    );
};

export const NodeParameterControls: React.FC<NodeParameterControlsProps> = ({ node, values, onChange, onChangeMany, renderControlWrapper, bpm, macroRouting }) => {
    const { type, data: nodeData } = node;
    const data = values || nodeData;

    // Display-only annotation for BPM-synced controls: the concrete time the
    // selected division resolves to at the current project tempo (mirrors the
    // backend's runtime 60/bpm math — nothing here feeds the DSP).
    const syncTimeHint = (syncRate: string) =>
        Number.isFinite(bpm) && (bpm as number) > 0 ? (
            <div data-testid="sync-time-hint" style={{ color: '#8a939f', fontSize: '0.8em', marginTop: '4px' }}>
                {formatSyncTime(syncRate, bpm as number)}
            </div>
        ) : null;

    // `syncRate` is NEVER exposable (all three wrappers below pass `false`).
    // The stored value is a note division string ("1/8"), not a number: the
    // exposure path fell through to the unknown-parameter range
    // {-1e6, 1e6, 0.0, ""} and emitted a `set_syncRate` writing a struct field
    // the DSP never reads — dead public API minted in one click, persisted into
    // the save file. The backend-side guard is B2's job; this is the UI half.
    //
    // SKB-058: the fallback used to be a per-node-type literal passed in by
    // each caller below — "1/4" for LFO but "1/8" for Delay and SampleHold —
    // while the backend defaults every type to "1/4". A Delay with bpmSync on
    // and no stored rate therefore read as an eighth here and generated as a
    // quarter. There is one fallback now, and when it is in play the control
    // says so instead of passing an invented value off as the node's own.
    // Packet B2: grey out, don't hide. The mode-dependent controls used to
    // vanish when inert (`data.fixedPitch && ...`, the bpmSync ternaries), so
    // a user who exposed `frequency` and then turned Fixed Pitch off had no
    // way to see that the exposure — still in the save file, still warned
    // about by the generator — now pointed at nothing. Both readers of "is
    // this parameter live" are the plockTargets.ts mirror of the generator's
    // param_is_reachable, so the sidebar and the codegen agree by construction.
    const inert = (param: string): string | undefined =>
        paramIsReachable(node, param) ? undefined : paramDeadReason(node, param);
    // `syncRate` is never exposable, so it has no dead-reason in the
    // generator's table; its inertness is purely a display fact.
    const syncRateInert = (): string | undefined =>
        data.bpmSync ? undefined : 'BPM Sync is off, so the free-running rate is used instead';

    const syncRateControl = () => {
        const stored = typeof data.syncRate === 'string' ? data.syncRate : undefined;
        const rate = stored ?? DEFAULT_SYNC_RATE;
        return (
            <>
                <BpmSyncControl value={rate} onChange={val => onChange('syncRate', val)} />
                {syncTimeHint(rate)}
                {stored === undefined && (
                    <div
                        data-testid="sync-rate-implicit"
                        style={{ color: '#e0a030', fontSize: '0.8em', marginTop: '4px' }}
                    >
                        No rate stored on this node — {DEFAULT_SYNC_RATE} is the generator's
                        default. Pick a rate to author it explicitly.
                    </div>
                )}
            </>
        );
    };

    // BPM Sync cannot be written alone: see bpmSyncToggleChanges.
    //
    // B5-x4: routed through renderControlWrapper (never exposable — the flag is
    // read at codegen time, not through a struct field) so the step editor's
    // wrapper can mark it "not automatable per step" and render it inert. As a
    // raw div it bypassed that label, and a click minted a boolean P-lock the
    // serializer then dropped without a word.
    const bpmSyncToggle = () => renderControlWrapper(
        'bpmSync',
        'BPM Sync',
        <input
            type="checkbox"
            checked={data.bpmSync || false}
            onChange={e => {
                if (onChangeMany) onChangeMany(bpmSyncToggleChanges(e.target.checked, data));
                else onChange('bpmSync', e.target.checked);
            }}
        />,
        false,
    );

    const createSelect = (paramKey: string, options: string[]) => (
        <select name={paramKey} value={data[paramKey]} onChange={(e) => onChange(paramKey, e.target.value)} style={inputStyles}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    );

    const numberBoxStyles: React.CSSProperties = {
        width: '64px',
        padding: '4px 6px',
        borderRadius: '4px',
        border: '1px solid #555',
        background: '#1A202C',
        color: '#E0E0E0',
        fontSize: '0.85em',
    };

    // Helpers to cleanup common patterns. Every slider is paired with a
    // typed number box — dragging is for exploring, typing is for landing
    // on the exact value you meant.
    //
    // `exponent` bends the slider travel without touching the stored value:
    // value = min + (max - min) * (position ** exponent). 1 = linear (the
    // default, so every existing control is unchanged). >1 expands the bottom
    // of the range — used where the musically useful values sit in the first
    // few percent of a wide linear range (Mod Index). A true log scale can't
    // be used for those because their range includes 0.
    const slider = (param: string, min: number, max: number, def: number, scale?: 'log' | 'linear', step?: number, integer = false, exponent = 1) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <CustomSlider
                    min={min} max={max}
                    value={data[param] ?? def}
                    onChange={val => onChange(param, val)}
                    scale={scale}
                    step={step}
                    quantize={integer}
                    exponent={exponent}
                    defaultValue={def}
                />
            </div>
            <NumberInput
                min={min} max={max} step={step ?? 0.01}
                quantize={integer}
                value={data[param] ?? def}
                onChange={val => onChange(param, val)}
                style={numberBoxStyles}
            />
        </div>
    );

    const numberField = (param: string, def: number, opts: { min?: number; max?: number; step?: number } = {}) => (
        <NumberInput
            min={opts.min} max={opts.max} step={opts.step ?? 0.1}
            value={data[param] ?? def}
            onChange={val => onChange(param, val)}
            style={{ ...numberBoxStyles, width: '100px' }}
        />
    );

    // The switch used to BE the component's return value. It is now wrapped
    // so a Randomize section (E11) can be appended after whatever controls
    // the node type renders, without every `case` growing a duplicate tail.
    const controls = (() => { switch (type) {
        case 'adsr':
            return (<>
                <AdsrEnvelopeEditor
                    value={{
                        attack: data.attack, decay: data.decay, sustain: data.sustain, release: data.release,
                        // E8 (roadmap 9.4 item 2): `?? 0` — an ADSR node saved
                        // before this packet has no curve keys at all, and 0
                        // (linear) is both the schema default and the shape
                        // that patch has always played.
                        attackCurve: data.attackCurve ?? 0, decayCurve: data.decayCurve ?? 0, releaseCurve: data.releaseCurve ?? 0,
                    }}
                    onChange={(newAdsr) => {
                        onChange('attack', newAdsr.attack);
                        onChange('decay', newAdsr.decay);
                        onChange('sustain', newAdsr.sustain);
                        onChange('release', newAdsr.release);
                        onChange('attackCurve', newAdsr.attackCurve);
                        onChange('decayCurve', newAdsr.decayCurve);
                        onChange('releaseCurve', newAdsr.releaseCurve);
                    }}
                />
                {/* Keep the envelope graph for quick shaping, then provide
                    exact-value entry for landing on precise musical timings.
                    Each field stays inside the normal wrapper so parameter
                    exposure works exactly like it does for other controls. */}
                {renderControlWrapper('attack', 'Attack (s)', numberField('attack', 0.1, { min: 0, max: 10, step: 0.001 }))}
                {renderControlWrapper('decay', 'Decay (s)', numberField('decay', 0.2, { min: 0, max: 10, step: 0.001 }))}
                {renderControlWrapper('sustain', 'Sustain', numberField('sustain', 0.5, { min: 0, max: 1, step: 0.01 }))}
                {renderControlWrapper('release', 'Release (s)', numberField('release', 1, { min: 0, max: 10, step: 0.001 }))}
                {renderControlWrapper('depth', 'Depth', slider('depth', 0, 1, 1))}
                {renderControlWrapper('velocitySensitivity', 'Velocity Sens.', slider('velocitySensitivity', 0, 1, 0.5))}
                {/* E8: -1..1, 0 = linear (schema/nodes.json). Exact-value entry
                    to complement the envelope graph's draggable tension handles. */}
                {renderControlWrapper('attackCurve', 'Attack Curve', numberField('attackCurve', 0, { min: -1, max: 1, step: 0.01 }))}
                {renderControlWrapper('decayCurve', 'Decay Curve', numberField('decayCurve', 0, { min: -1, max: 1, step: 0.01 }))}
                {renderControlWrapper('releaseCurve', 'Release Curve', numberField('releaseCurve', 0, { min: -1, max: 1, step: 0.01 }))}
            </>);
        case 'filter':
            return (<>
                {renderControlWrapper('type', 'Filter Type', createSelect('type', ['Lowpass', 'Highpass', 'Bandpass', 'Notch']), false)}
                <XYPad
                    xValue={data.cutoff}
                    yValue={data.resonance}
                    minX={20} maxX={20000} minY={0.1} maxY={20}
                    onChange={({ x, y }) => {
                        onChange('cutoff', x);
                        onChange('resonance', y);
                    }}
                    xScale="log" yScale="log"
                />
                {/* The pad is for exploring by ear; these land exact values. */}
                {renderControlWrapper('cutoff', 'Cutoff (Hz)', numberField('cutoff', 800, { min: 20, max: 20000, step: 1 }))}
                {renderControlWrapper('resonance', 'Resonance', numberField('resonance', 1, { min: 0.1, max: 20, step: 0.1 }))}
            </>);
        case 'lfo':
            return (<>
                {renderControlWrapper('waveform', 'Waveform', createSelect('waveform', ['Sine', 'Sawtooth', 'Triangle', 'Square']), false)}
                {renderControlWrapper('syncRate', 'Sync Rate', syncRateControl(), false, syncRateInert())}
                {renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 0.1, 50, 5, 'log'), true, inert('frequency'))}
                {renderControlWrapper('amplitude', 'Amplitude (Depth)', slider('amplitude', 0, 1, 1))}
                {bpmSyncToggle()}
            </>);
        case 'delay':
            return (<>
                {renderControlWrapper('syncRate', 'Sync Rate', syncRateControl(), false, syncRateInert())}
                {renderControlWrapper('delayTime', 'Delay Time (s)', slider('delayTime', 0, 2, 0.5), true, inert('delayTime'))}
                {renderControlWrapper('feedback', 'Feedback', slider('feedback', 0, 1, 0.5))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
                {bpmSyncToggle()}
            </>);
        case 'sampleHold':
            return (<>
                {renderControlWrapper('syncRate', 'Sync Rate', syncRateControl(), false, syncRateInert())}
                {renderControlWrapper('rate', 'Rate (Hz)', slider('rate', 0.1, 50, 10, 'log'), true, inert('rate'))}
                {renderControlWrapper('amplitude', 'Amplitude (Depth)', slider('amplitude', 0, 1, 1))}
                {bpmSyncToggle()}
            </>);
        case 'fmOperator':
            return (<>
                {/* The backend treats `frequency` as a carrier ratio (× note
                    frequency), clamped to 0.01–32. The old label said
                    "Carrier Freq (Hz)" with a 20–20000 range — every value
                    above 32 silently clamped. */}
                {renderControlWrapper('frequency', 'Ratio (× note freq)', slider('frequency', 0.01, 32, 1, 'log'))}
                {/* Mod Index is radians of phase deviation over a 0–1000 range,
                    but everything musical lives under ~10 — the bottom 1% of a
                    linear fader. The cubic travel curve puts 0–10 in the bottom
                    ~21% and leaves the default (100) near centre. Stored values
                    are untouched: this is only how position maps to value. */}
                {renderControlWrapper('modIndex', 'Modulation Index', slider('modIndex', 0, 1000, 100, undefined, undefined, false, 3))}
                {/* C5 (F-A02-7): output level, default 1 = the full-scale
                    output the operator always had. Range mirrors the
                    FmOperator/amplitude override row in param_ranges.odin. */}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 1))}
            </>);
        case 'wavetable':
            return (<>
                {/* (Table dropdown removed: the generated code reads only
                    `position` — the morph IS the table selection, and a
                    dropdown that changes nothing is a lie.) */}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>Fixed Pitch (ignore note)</label>
                    <input type="checkbox" checked={data.fixedPitch || false} onChange={e => onChange('fixedPitch', e.target.checked)} />
                </div>
                {renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 20, 20000, 440, 'log'), true, inert('frequency'))}
                {renderControlWrapper('position', 'Table Position', slider('position', 0, 3, 0, undefined, 0.01))}
                {/* Default 1.0 — matches what the generated code plays for an
                    absent value (codegen.odin's Wavetable amplitude fallback).
                    The parameter existed in the engine and on the node card but
                    had no sidebar control and no entry in WavetableParams. */}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 1))}
                {/* C5 (F-A01-7/8): the square end's duty cycle and a start
                    offset — the Oscillator's two controls this node lacked. */}
                {renderControlWrapper('pulseWidth', 'Pulse Width', slider('pulseWidth', 0.01, 0.99, 0.5))}
                {renderControlWrapper('phase', 'Phase', slider('phase', 0, 360, 0))}
            </>);
        case 'oscillator':
            return (<>
                {renderControlWrapper('waveform', 'Waveform', createSelect('waveform', ['Sawtooth', 'Sine', 'Triangle', 'Square']), false)}
                {/* Pitch follows the played note unless Fixed Pitch is on —
                    only then does the frequency slider do anything. */}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>Fixed Pitch (ignore note)</label>
                    <input type="checkbox" checked={data.fixedPitch || false} onChange={e => onChange('fixedPitch', e.target.checked)} />
                </div>
                {renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 20, 20000, 440, 'log'), true, inert('frequency'))}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 0.5))}
                {renderControlWrapper('pulseWidth', 'Pulse Width', slider('pulseWidth', 0.01, 0.99, 0.5), true, inert('pulseWidth'))}
                {renderControlWrapper('phase', 'Phase', slider('phase', 0, 360, 0))}
            </>);
        case 'noise':
            return (<>
                {renderControlWrapper('type', 'Noise Type', createSelect('type', ['White', 'Pink']), false)}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 1))}
            </>);
        case 'reverb':
            return (<>
                {renderControlWrapper('decay', 'Decay (s)', slider('decay', 0.1, 10, 3))}
                {renderControlWrapper('preDelay', 'Pre-Delay (s)', slider('preDelay', 0, 0.25, 0.02))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
                {/* C5 (F-A07-7): 0 = the undamped comb every older patch has. */}
                {renderControlWrapper('damping', 'Damping', slider('damping', 0, 1, 0))}
            </>);
        case 'distortion':
            return (<>
                {renderControlWrapper('drive', 'Drive', slider('drive', 1, 100, 20))}
                {renderControlWrapper('shape', 'Shape', createSelect('shape', ['classic', 'soft', 'hard', 'asymmetric']), false)}
                {renderControlWrapper('tone', 'Tone (Hz)', slider('tone', 100, 20000, 4000, 'log'))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
            </>);
        case 'mapper':
            // Exposable (B11): the pre-B11 inline bypass in ParameterPanel
            // already offered the toggle here (its `wrapper` calls default to
            // `isExposable = true`), and the backend resolves an exposed
            // `inMin`/`inMax`/`outMin`/`outMax` through the ordinary generic
            // `exposed_resolutions` path (`param_utils.odin`'s `get_f32_param`)
            // exactly like any other f32 param — there is no backend gap here
            // the way there is for `syncRate` below. Passing `false` (as this
            // case did before B11) would have been unreachable dead code —
            // the bypass returned first — and deleting that bypass without
            // flipping this would have silently regressed exposability, the
            // same trap SKB-043 hit for mixer levels.
            return (<>
                {renderControlWrapper('inMin', 'Input Min', numberField('inMin', 0), true)}
                {renderControlWrapper('inMax', 'Input Max', numberField('inMax', 1), true)}
                {renderControlWrapper('outMin', 'Output Min', numberField('outMin', 0), true)}
                {renderControlWrapper('outMax', 'Output Max', numberField('outMax', 1), true)}
            </>);
        case 'mixer': {
            const inputCount = Math.min(Math.max(Number(data.inputCount) || 4, 1), 32);
            const mixerLevels: Array<{ id: number; level: number; pan: number }> =
                Array.isArray(data.levels) ? data.levels : [];
            const channelOf = (ch: number) => {
                const existing = mixerLevels.find(l => l?.id === ch);
                return { id: ch, level: typeof existing?.level === 'number' ? existing.level : 0.75, pan: existing?.pan ?? 0 };
            };
            const withLevel = (ch: number, level: number) =>
                Array.from({ length: inputCount }, (_, i) =>
                    i + 1 === ch ? { ...channelOf(i + 1), level } : channelOf(i + 1));
            return (<>
                {renderControlWrapper('inputCount', 'Inputs', (
                    <NumberInput min={1} max={32} step={1}
                        value={inputCount}
                        onChange={val => {
                            const count = Math.min(Math.max(Math.round(val), 1), 32);
                            onChange('inputCount', count);
                            onChange('levels', Array.from({ length: count }, (_, i) => channelOf(i + 1)));
                        }}
                        style={numberBoxStyles}
                    />
                ), false)}
                {/* Channel levels ARE exposable. The backend resolves `level<n>`
                    through the nested `levels` array (exposed_param_default →
                    mixer_channel_level) so exposing a fader preserves the mix
                    instead of resetting it to 0; that fix shipped and was
                    golden-tested, and this hardcoded `false` was the only thing
                    keeping it unreachable from the editor. */}
                {Array.from({ length: inputCount }, (_, i) => i + 1).map(ch =>
                    renderControlWrapper(`level${ch}`, `Level ${ch}`, (
                        <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <CustomSlider min={0} max={2} step={0.05}
                                    value={channelOf(ch).level}
                                    onChange={val => onChange('levels', withLevel(ch, val))}
                                    defaultValue={0.75}
                                />
                            </div>
                            <NumberInput min={0} max={2} step={0.05}
                                value={channelOf(ch).level}
                                onChange={val => onChange('levels', withLevel(ch, val))}
                                style={numberBoxStyles}
                            />
                        </div>
                    ), true)
                )}
            </>);
        }
        case 'midiInput':
            // Restored here (B11): the pre-B11 inline bypass in ParameterPanel
            // rendered this locally and returned before this switch was ever
            // reached, so this case never existed — deleting that bypass
            // without adding this would have dropped both controls from the
            // sidebar entirely, not just their exposability. Kept identical to
            // the old bypass: `device` mirrors its custom option labels
            // ("Device A (Mock)" etc., not just the raw value) and is not
            // exposable; `useMpe` stays an unwrapped checkbox with no expose
            // affordance, exactly as before.
            return (<>
                {renderControlWrapper('device', 'MIDI Device', (
                    <select name="device" value={data.device ?? 'All'} onChange={(e) => onChange('device', e.target.value)} style={inputStyles}>
                        <option value="All">All Devices</option>
                        <option value="Device A">Device A (Mock)</option>
                        <option value="Device B">Device B (Mock)</option>
                    </select>
                ), false)}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>Enable MPE</label>
                    <input type="checkbox" checked={data.useMpe ?? false} onChange={e => onChange('useMpe', e.target.checked)} />
                </div>
            </>);
        case 'panner':
            return (<>
                {renderControlWrapper('pan', 'Pan', slider('pan', -1, 1, 0))}
            </>);
        case 'gain':
        case 'VisualGainNode':
            return (<>
                {renderControlWrapper('gain', 'Gain', slider('gain', 0, 4, 0.75))}
            </>);
        // Complex types (mixer, instrument, group) are handled by Parent usually, 
        // but simple Instrument params (non-subgraph) can go here
        case 'instrument':
            return (<>
                {renderControlWrapper('name', 'Name', (
                    <input
                        type="text"
                        value={data.name ?? ''}
                        onChange={e => onChange('name', e.target.value)}
                        style={inputStyles}
                    />
                ), false)}
                {renderControlWrapper('volume', 'Volume', slider('volume', 0, 1, 1))}
                {renderControlWrapper('voiceCount', 'Voice Count', slider('voiceCount', 1, 32, 8, undefined, 1, true))}
                {/* 0–5 s, matching `param_ranges.odin`'s glide entry. The UI
                    capped at 2 s with no backend basis; widening the UI is the
                    only direction that cannot clamp an already-saved value. */}
                {renderControlWrapper('glide', 'Glide (s)', slider('glide', 0, 5, 0.05))}
                {renderControlWrapper('unison', 'Unison Voices', slider('unison', 1, 16, 1, undefined, 1, true))}
                {renderControlWrapper('detune', 'Detune (cents)', slider('detune', 0, 100, 5))}
                {/* G5 (roadmap 9.18, KI-018): stealMode/pitchJitter/velocityJitter
                    are read at generation time only (like Voice Count/Glide/
                    Unison above), not runtime-exposed — see KI-019 on why an
                    Instrument's own numeric fields don't runtime-expose — so
                    `false` here for the same reason those three pass it. */}
                {renderControlWrapper('stealMode', 'Voice Stealing', (
                    <select
                        value={data.stealMode ?? 'release-first'}
                        onChange={e => onChange('stealMode', e.target.value)}
                        style={inputStyles}
                    >
                        <option value="release-first">Release-first, then oldest</option>
                        <option value="oldest">Oldest</option>
                        <option value="quietest">Quietest</option>
                    </select>
                ), false)}
                {renderControlWrapper('pitchJitter', 'Pitch Jitter (cents)', slider('pitchJitter', 0, 100, 0), false)}
                {renderControlWrapper('velocityJitter', 'Velocity Jitter', slider('velocityJitter', 0, 1, 0), false)}
            </>);
        default:
            return <div><small style={{ color: '#666' }}>No standard controls for {type}</small></div>;
    } })();

    return (<>
        {controls}
        {/* See RandomizeSection's doc comment for why `onChangeMany` gates this. */}
        {onChangeMany && (
            <RandomizeSection data={data} nodeType={codegenTypeOf(node)} onChangeMany={onChangeMany} />
        )}
        {/* See MacroPadSection's doc comment for why `macroRouting` gates this,
            and for the session-only assignment state. `key={node.id}` forces a
            fresh MacroPadSection (and so a fresh, empty assignment) when the
            selected instrument changes — ParameterPanel does not unmount this
            tree on that change, so without the key a macro pad would keep
            offering targets on nodes that belong to the PREVIOUS instrument. */}
        {macroRouting && (
            <MacroPadSection
                key={node.id}
                internalNodes={macroRouting.internalNodes}
                onUpdateNode={macroRouting.onUpdateNode}
                recording={macroRouting.recording}
            />
        )}
    </>);
};
