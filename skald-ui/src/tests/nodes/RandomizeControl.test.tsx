// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { randomizeParams, RANDOMIZE_AMOUNTS } from '../../utils/randomize';

// Roadmap E11 — the "Randomize / Evolve" button. Written before the control
// existed in NodeParameterControls.tsx; every assertion here failed on a
// missing `data-testid` until the implementation matched.
//
// Vitest doesn't run @testing-library/react's auto-cleanup unless
// `globals: true` is set (same pattern as CustomSlider.test.tsx), and every
// test here renders into the shared `document.body` via `screen`.
afterEach(() => {
    cleanup();
});

const renderInstrument = (onChangeMany = vi.fn()) => {
    const data = {
        name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5,
        exposedParameters: [] as string[],
    };
    const onChange = vi.fn();
    const utils = render(
        <NodeParameterControls
            node={{ id: 'inst-1', type: 'instrument', position: { x: 0, y: 0 }, data }}
            onChange={onChange}
            onChangeMany={onChangeMany}
            renderControlWrapper={(paramKey, label, control) => (
                <section key={paramKey} aria-label={label}>{control}</section>
            )}
        />
    );
    return { ...utils, data, onChange, onChangeMany };
};

const seedInput = () => screen.getByTestId('randomize-seed') as HTMLInputElement;

describe('E11 Randomize control', () => {
    it('renders a seed field, Nudge/Evolve presets and an Apply button for a node with eligible parameters', () => {
        renderInstrument();
        expect(screen.getByTestId('randomize-seed')).toBeTruthy();
        expect(screen.getByTestId('randomize-amount-nudge')).toBeTruthy();
        expect(screen.getByTestId('randomize-amount-evolve')).toBeTruthy();
        expect(screen.getByTestId('randomize-apply')).toBeTruthy();
    });

    it('writes the delta through ONE onChangeMany call — the existing multi-field parameter-set path, so it is one undo step', () => {
        const { onChangeMany, onChange, data } = renderInstrument();
        fireEvent.change(seedInput(), { target: { value: '777' } });

        fireEvent.click(screen.getByTestId('randomize-apply'));

        expect(onChangeMany).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
        const expected = randomizeParams(data, 'Instrument', RANDOMIZE_AMOUNTS.nudge, 777);
        expect(onChangeMany).toHaveBeenCalledWith(expected);
    });

    it('same seed -> same result: clicking Apply twice with an unchanged seed writes an identical delta both times', () => {
        const { onChangeMany } = renderInstrument();
        fireEvent.change(seedInput(), { target: { value: '42' } });

        fireEvent.click(screen.getByTestId('randomize-apply'));
        fireEvent.click(screen.getByTestId('randomize-apply'));

        expect(onChangeMany).toHaveBeenCalledTimes(2);
        expect(onChangeMany.mock.calls[0][0]).toEqual(onChangeMany.mock.calls[1][0]);
    });

    it('never writes the excluded API-affecting parameters', () => {
        const { onChangeMany } = renderInstrument();
        fireEvent.change(seedInput(), { target: { value: '1' } });
        fireEvent.click(screen.getByTestId('randomize-amount-evolve'));
        fireEvent.click(screen.getByTestId('randomize-apply'));

        const delta = onChangeMany.mock.calls[0][0];
        expect(delta).not.toHaveProperty('voiceCount');
        expect(delta).not.toHaveProperty('name');
        expect(delta).not.toHaveProperty('exposedParameters');
        expect(delta).not.toHaveProperty('volume'); // no schema row — see randomize.test.ts
    });

    it('the Evolve preset moves values further than Nudge for the same seed', () => {
        const { onChangeMany, data } = renderInstrument();
        fireEvent.change(seedInput(), { target: { value: '9' } });

        fireEvent.click(screen.getByTestId('randomize-apply')); // default preset: nudge
        const nudged = onChangeMany.mock.calls[0][0];

        fireEvent.click(screen.getByTestId('randomize-amount-evolve'));
        fireEvent.click(screen.getByTestId('randomize-apply'));
        const evolved = onChangeMany.mock.calls[1][0];

        expect(Math.abs(evolved.glide - data.glide)).toBeGreaterThan(Math.abs(nudged.glide - data.glide));
    });

    it('Re-roll changes the displayed seed', () => {
        renderInstrument();
        const before = seedInput().value;
        fireEvent.click(screen.getByTestId('randomize-reroll'));
        expect(seedInput().value).not.toBe(before);
    });

    it('does not render at all without onChangeMany (the per-step P-lock editor\'s wrapper) — a multi-key write there would be several undo entries, not one', () => {
        render(
            <NodeParameterControls
                node={{ id: 'inst-1', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] } }}
                onChange={vi.fn()}
                renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
            />
        );
        expect(screen.queryByTestId('randomize-apply')).toBeNull();
    });

    it('does not render for a node type with nothing eligible to randomize (MIDI Input: device/useMpe are both non-numeric)', () => {
        render(
            <NodeParameterControls
                node={{ id: 'midi-1', type: 'midiInput', position: { x: 0, y: 0 }, data: { device: 'All', useMpe: false } }}
                onChange={vi.fn()}
                onChangeMany={vi.fn()}
                renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
            />
        );
        expect(screen.queryByTestId('randomize-apply')).toBeNull();
    });
});
