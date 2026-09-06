// @vitest-environment jsdom
//
// Roadmap packet B2 — exposure honesty, the editor half. The sidebar used to
// HIDE a mode-dependent control when the node's configuration made it inert
// (`data.fixedPitch && ...`, the bpmSync ternaries). So a user who exposed an
// Oscillator's frequency and then turned Fixed Pitch off saw the control
// vanish while the exposure stayed in the save file — the generator warned
// about it on every build, and the panel that created it showed nothing.
// Now the control stays, greyed, with the generator's own dead-reason as the
// tooltip and the expose button disabled. Both readers of "is it live" are
// the plockTargets.ts mirror of param_is_reachable.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import ParameterPanel from '../../components/ParameterPanel';
import { NodeParams } from '../../definitions/types';

// No vitest globals here, so RTL's automatic unmount never runs: without
// this every later test also sees the previous test's panel.
afterEach(cleanup);

const renderPanel = (type: string, data: Record<string, unknown>) => {
    const node = { id: 'n1', type, position: { x: 0, y: 0 }, data: { exposedParameters: [], ...data } } as unknown as Node<NodeParams>;
    render(<ParameterPanel selectedNode={node} onUpdateNode={vi.fn()} allNodes={[node]} allEdges={[]} bpm={120} />);
};

const exposeButtonFor = (label: string): HTMLButtonElement => {
    const group = screen.getByText(label).parentElement!.parentElement!;
    return group.querySelector('button') as HTMLButtonElement;
};

describe('Oscillator frequency with Fixed Pitch off', () => {
    it('is shown greyed with the dead reason, not hidden', () => {
        renderPanel('oscillator', { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5, fixedPitch: false });
        // Before B2 this threw: the control was not rendered at all.
        expect(screen.getByText('Frequency (Hz)')).toBeTruthy();
        const button = exposeButtonFor('Frequency (Hz)');
        expect(button.disabled).toBe(true);
        expect(button.title).toMatch(/fixedPitch is off, so the played note drives pitch instead/);
    });

    it('is live and exposable once Fixed Pitch is on', () => {
        renderPanel('oscillator', { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5, fixedPitch: true });
        const button = exposeButtonFor('Frequency (Hz)');
        expect(button.disabled).toBe(false);
        expect(button.title).toBe('Expose "Frequency (Hz)" to public API');
    });
});

describe('LFO with BPM Sync on', () => {
    it('shows frequency greyed with the bpmSync reason and Sync Rate live', () => {
        renderPanel('lfo', { label: 'LFO', waveform: 'Sine', frequency: 5, amplitude: 1, bpmSync: true, syncRate: '1/4' });
        expect(screen.getByText('Frequency (Hz)')).toBeTruthy();
        const freq = exposeButtonFor('Frequency (Hz)');
        expect(freq.disabled).toBe(true);
        expect(freq.title).toMatch(/bpmSync is on, so its time base comes from syncRate instead/);
        // Sync Rate is live in this configuration, so no inert marker.
        const syncGroup = screen.getByText('Sync Rate').parentElement!.parentElement!;
        expect(syncGroup.getAttribute('data-inert')).toBeNull();
    });

    it('with BPM Sync off shows Sync Rate greyed and frequency live', () => {
        renderPanel('lfo', { label: 'LFO', waveform: 'Sine', frequency: 5, amplitude: 1, bpmSync: false });
        const syncGroup = screen.getByText('Sync Rate').parentElement!.parentElement!;
        expect(syncGroup.getAttribute('data-inert')).toBe('true');
        expect(exposeButtonFor('Frequency (Hz)').disabled).toBe(false);
    });
});

describe('a parameter that is always live', () => {
    it('keeps the plain expose affordance', () => {
        renderPanel('lfo', { label: 'LFO', waveform: 'Sine', frequency: 5, amplitude: 1, bpmSync: true });
        const amp = exposeButtonFor('Amplitude (Depth)');
        expect(amp.disabled).toBe(false);
        expect(amp.title).toBe('Expose "Amplitude (Depth)" to public API');
    });
});

describe('Oscillator pulse width on a non-Square waveform', () => {
    it('is shown greyed with the waveform reason, not hidden', () => {
        renderPanel('oscillator', { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5, fixedPitch: true, pulseWidth: 0.5 });
        // Before B2 this control was rendered only when waveform === 'Square'.
        expect(screen.getByText('Pulse Width')).toBeTruthy();
        const pw = exposeButtonFor('Pulse Width');
        expect(pw.disabled).toBe(true);
        expect(pw.title).toMatch(/waveform is not Square/);
    });

    it('is live on a Square waveform', () => {
        renderPanel('oscillator', { label: 'Osc', waveform: 'Square', frequency: 440, amplitude: 0.5, fixedPitch: true, pulseWidth: 0.5 });
        expect(exposeButtonFor('Pulse Width').disabled).toBe(false);
    });
});
