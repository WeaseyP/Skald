// @vitest-environment jsdom
/*
================================================================================
| SKB-009 (a) and SKB-045 — the step editor shows the overrides that are broken |
| or that will be thrown away, at the step that owns them.                      |
|                                                                              |
| Before this the step editor rendered a lock icon per parameter and nothing     |
| else. An override whose target node had been renamed was invisible there — it  |
| surfaced only as `os.exit(1)` inside codegen, i.e. as "Generate failed" — and  |
| a non-numeric override was invisible everywhere, being filtered out of the     |
| export by projectSerializer without a word.                                   |
|                                                                              |
| The step that owns a bad override is the only place it can be deleted, so this |
| is where it has to be shown.                                                  |
================================================================================
*/
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import { StepPropertiesEditor } from '../../components/Sequencer/StepPropertiesEditor';
import { NodeParams, SequencerTrack } from '../../definitions/types';

afterEach(cleanup);

const instrumentNode = {
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Bass',
        name: 'Bass',
        subgraph: {
            nodes: [
                { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', frequency: 440, amplitude: 0.5, waveform: 'Sawtooth' } },
            ],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>;

const trackWith = (overrides: Record<string, unknown>): SequencerTrack => ({
    id: 't1',
    targetNodeId: 'inst-1',
    name: 'Bass',
    color: '#007acc',
    steps: 16,
    notes: [{
        step: 3,
        note: 60,
        velocity: 1,
        duration: 1,
        patchOverrides: overrides as Record<string, number>,
    }],
    isMuted: false,
    isSolo: false,
});

const renderEditor = (track: SequencerTrack, onUpdateNote = vi.fn()) => {
    render(
        <StepPropertiesEditor
            trackId="t1"
            step={3}
            track={track}
            onUpdateNote={onUpdateNote}
            instrumentNode={instrumentNode}
        />
    );
    return onUpdateNote;
};

describe('SKB-009 — an unresolvable override is visible at its step', () => {
    it('names the key and what it no longer matches', () => {
        renderEditor(trackWith({ 'OldOsc:frequency': 220 }));
        const panel = screen.getByTestId('step-plock-issues');
        expect(panel.textContent).toContain('OldOsc:frequency');
        // The surviving labels, same as the backend's "Valid targets:" list.
        expect(panel.textContent).toContain('Osc');
    });

    it('deletes only the offending key when removed', () => {
        const onUpdateNote = renderEditor(
            trackWith({ 'OldOsc:frequency': 220, 'Osc:amplitude': 0.25 })
        );
        fireEvent.click(screen.getByTestId('remove-plock-OldOsc:frequency'));
        expect(onUpdateNote).toHaveBeenCalledWith(
            't1', 3, { patchOverrides: { 'Osc:amplitude': 0.25 } }, 60
        );
    });

    it('says nothing when every key still resolves', () => {
        // `amplitude`, unlike `frequency`, is reachable on an Oscillator
        // regardless of fixedPitch — see the B5-4-followup describe block
        // below for the frequency/fixedPitch interaction specifically.
        renderEditor(trackWith({ 'Osc:amplitude': 0.25 }));
        expect(screen.queryByTestId('step-plock-issues')).toBeNull();
    });
});

describe('B5-4-followup — a dead-parameter override is visible at its step', () => {
    // instrumentNode's Osc has no `fixedPitch` at all, so it defaults off
    // (get_bool_param's default), which is exactly the state
    // param_is_reachable calls dead for Oscillator.frequency.
    it('names the reason and the toggle responsible', () => {
        renderEditor(trackWith({ 'Osc:frequency': 220 }));
        const panel = screen.getByTestId('step-plock-issues');
        expect(panel.textContent).toContain('Osc:frequency');
        expect(panel.textContent).toContain('fixedPitch is off');
        expect(panel.textContent).toContain('Toggle BPM Sync / fixedPitch');
    });

    it('offers to remove a dead override, same as an unresolvable one', () => {
        const onUpdateNote = renderEditor(trackWith({ 'Osc:frequency': 220 }));
        fireEvent.click(screen.getByTestId('remove-plock-Osc:frequency'));
        expect(onUpdateNote).toHaveBeenCalledWith('t1', 3, { patchOverrides: {} }, 60);
    });

    it('says nothing once fixedPitch makes the parameter live again', () => {
        const fixedPitchNode = {
            ...instrumentNode,
            data: {
                ...instrumentNode.data,
                subgraph: {
                    ...instrumentNode.data.subgraph,
                    nodes: [
                        { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', frequency: 440, fixedPitch: true, amplitude: 0.5, waveform: 'Sawtooth' } },
                    ],
                },
            },
        } as unknown as Node<NodeParams>;
        render(
            <StepPropertiesEditor
                trackId="t1"
                step={3}
                track={trackWith({ 'Osc:frequency': 220 })}
                onUpdateNote={vi.fn()}
                instrumentNode={fixedPitchNode}
            />
        );
        expect(screen.queryByTestId('step-plock-issues')).toBeNull();
    });

    it('gives syncRate only the delete fix, since no toggle makes it live', () => {
        const delayNode = {
            id: 'inst-1',
            type: 'instrument',
            position: { x: 0, y: 0 },
            data: {
                label: 'Bass',
                name: 'Bass',
                subgraph: {
                    nodes: [
                        { id: 'dly-1', type: 'delay', position: { x: 0, y: 0 }, data: { label: 'Dly', delayTime: 0.3, feedback: 0.2, mix: 0.5, syncRate: '1/4' } },
                    ],
                    connections: [],
                },
            },
        } as unknown as Node<NodeParams>;
        render(
            <StepPropertiesEditor
                trackId="t1"
                step={3}
                track={trackWith({ 'Dly:syncRate': 1 })}
                onUpdateNote={vi.fn()}
                instrumentNode={delayNode}
            />
        );
        const panel = screen.getByTestId('step-plock-issues');
        expect(panel.textContent).toContain('Dly:syncRate');
        expect(panel.textContent).toContain('No node configuration makes `syncRate` live');
        expect(panel.textContent).not.toContain('Toggle BPM Sync');
    });
});

describe('SKB-045 — a non-numeric override is visible instead of silently dropped', () => {
    it('flags a string override the f32-only setter cannot carry', () => {
        renderEditor(trackWith({ 'Osc:waveform': 'Square' }));
        const panel = screen.getByTestId('step-plock-issues');
        expect(panel.textContent).toContain('Osc:waveform');
        expect(panel.textContent).toContain('Square');
    });

    it('flags a boolean override too', () => {
        renderEditor(trackWith({ 'Osc:fixedPitch': true }));
        expect(screen.getByTestId('step-plock-issues').textContent).toContain('Osc:fixedPitch');
    });

    it('offers to remove it', () => {
        const onUpdateNote = renderEditor(trackWith({ 'Osc:waveform': 'Square' }));
        fireEvent.click(screen.getByTestId('remove-plock-Osc:waveform'));
        expect(onUpdateNote).toHaveBeenCalledWith('t1', 3, { patchOverrides: {} }, 60);
    });

    it('leaves a numeric override alone', () => {
        // `amplitude` is reachable regardless of fixedPitch; see the
        // B5-4-followup block for `frequency`'s fixedPitch-gated case.
        renderEditor(trackWith({ 'Osc:amplitude': 0.25 }));
        expect(screen.queryByTestId('step-plock-issues')).toBeNull();
    });
});

describe('SKB-045 — the editor stops offering locks it cannot export', () => {
    it('gives a non-numeric parameter no lock button', () => {
        renderEditor(trackWith({}));
        // `waveform` is a select over a string: a per-step override of it can
        // never reach the generated code, so offering the padlock was an
        // editable-but-inert control. (`frequency` is not asserted here: the
        // shared controls already hide it for an oscillator without fixedPitch,
        // because the played note drives pitch instead.)
        expect(screen.queryByTestId('plock-lock-Osc:waveform')).toBeNull();
        expect(screen.getByTestId('plock-lock-Osc:amplitude')).toBeTruthy();
    });

    it('explains why, rather than just omitting the control', () => {
        renderEditor(trackWith({}));
        expect(screen.getByTestId('plock-unavailable-Osc:waveform')).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// B5-x1 — the step editor reads overrides through the generator's resolver.
// ---------------------------------------------------------------------------
describe('B5-x1 — an override spelled with a different case is the same override', () => {
    it('shows `osc:amplitude` as the Osc node\'s amplitude override (unlocked), not as absent', () => {
        renderEditor(trackWith({ 'osc:amplitude': 0.9 }));
        // Before B5-x1 the demux compared `osc` === `Osc` and the control read
        // as locked at the global value — while codegen applied the override.
        // The lock's testid carries the key the editor will EDIT — the existing
        // spelling, not a freshly minted canonical one.
        expect(screen.getByTestId('plock-lock-osc:amplitude').title).toBe('Lock (Reset to Global)');
    });

    it('edits the existing `osc:amplitude` key instead of minting a second `Osc:amplitude`', () => {
        const onUpdateNote = renderEditor(trackWith({ 'osc:amplitude': 0.9 }));
        const group = screen.getByText('Amplitude').parentElement!.parentElement!;
        const input = group.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '0.3' } });
        fireEvent.blur(input);
        expect(onUpdateNote).toHaveBeenCalled();
        const overrides = onUpdateNote.mock.calls.at(-1)![2].patchOverrides as Record<string, number>;
        expect(overrides['osc:amplitude']).toBe(0.3);
        expect(overrides).not.toHaveProperty('Osc:amplitude');
    });
});

// ---------------------------------------------------------------------------
// B5-x4 — controls that cannot be automated per step are inert here.
// ---------------------------------------------------------------------------
const lfoInstrument = {
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Bass', name: 'Bass',
        subgraph: {
            nodes: [
                { id: 'lfo-1', type: 'lfo', position: { x: 0, y: 0 }, data: { label: 'Wobble', frequency: 5, amplitude: 1, bpmSync: false, waveform: 'Sine' } },
            ],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>;

describe('B5-x4 — BPM Sync and Sync Rate cannot mint step overrides', () => {
    const renderLfoEditor = () => {
        const onUpdateNote = vi.fn();
        render(<StepPropertiesEditor trackId="t1" step={3} track={trackWith({})} onUpdateNote={onUpdateNote} instrumentNode={lfoInstrument} />);
        return onUpdateNote;
    };

    it('labels BPM Sync "not automatable per step" and renders it inert', () => {
        renderLfoEditor();
        expect(screen.getByTestId('plock-unavailable-Wobble:bpmSync')).toBeTruthy();
        expect(screen.getByTestId('plock-inert-Wobble:bpmSync')).toBeTruthy();
    });

    it('does not create a boolean or string override even if the control fires', () => {
        const onUpdateNote = renderLfoEditor();
        const inert = screen.getByTestId('plock-inert-Wobble:bpmSync');
        const checkbox = inert.querySelector('input[type="checkbox"]') as HTMLInputElement;
        // pointer-events:none stops a real click; a synthetic change event is
        // the pessimistic case, and the onChange guard must still refuse it.
        fireEvent.click(checkbox);
        expect(onUpdateNote).not.toHaveBeenCalled();
    });
});
