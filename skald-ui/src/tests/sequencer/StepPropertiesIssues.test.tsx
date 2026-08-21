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
        renderEditor(trackWith({ 'Osc:frequency': 220 }));
        expect(screen.queryByTestId('step-plock-issues')).toBeNull();
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
        renderEditor(trackWith({ 'Osc:frequency': 220 }));
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
