import React from 'react';
import { Node } from '@xyflow/react';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';
import { NumberInput } from './common/NumberInput';
import { DEFAULT_SYNC_RATE, bpmSyncToggleChanges, formatSyncTime } from '../definitions/bpm';
import { paramDeadReason, paramIsReachable } from '../utils/plockTargets';

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

export const NodeParameterControls: React.FC<NodeParameterControlsProps> = ({ node, values, onChange, onChangeMany, renderControlWrapper, bpm }) => {
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

    switch (type) {
        case 'adsr':
            return (<>
                <AdsrEnvelopeEditor
                    value={{ attack: data.attack, decay: data.decay, sustain: data.sustain, release: data.release }}
                    onChange={(newAdsr) => {
                        onChange('attack', newAdsr.attack);
                        onChange('decay', newAdsr.decay);
                        onChange('sustain', newAdsr.sustain);
                        onChange('release', newAdsr.release);
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
            </>);
        default:
            return <div><small style={{ color: '#666' }}>No standard controls for {type}</small></div>;
    }
};
