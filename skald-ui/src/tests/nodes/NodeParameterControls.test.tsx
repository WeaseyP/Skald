// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';

const renderControls = (type: string, data: Record<string, unknown>) => {
    const onChange = vi.fn();
    const result = render(
        <NodeParameterControls
            node={{ id: `${type}-1`, type, position: { x: 0, y: 0 }, data }}
            onChange={onChange}
            renderControlWrapper={(paramKey, label, control) => (
                <section key={paramKey} data-param={paramKey} aria-label={label}>{control}</section>
            )}
        />
    );
    return { ...result, onChange };
};

const textInputFor = (container: HTMLElement, param: string): HTMLInputElement => {
    const input = container.querySelector(`[data-param="${param}"] input[type="text"]`);
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing text input for ${param}`);
    return input;
};

describe('NodeParameterControls ADSR manual controls', () => {
    it('renders wrapped A/D/S/R number inputs and writes exact values', () => {
        const onChange = vi.fn();
        const wrappedKeys: string[] = [];

        render(
            <NodeParameterControls
                node={{
                    id: 'adsr-1',
                    type: 'adsr',
                    position: { x: 0, y: 0 },
                    data: {
                        attack: 0.1,
                        decay: 0.2,
                        sustain: 0.5,
                        release: 1,
                        depth: 1,
                        velocitySensitivity: 0.5,
                    },
                }}
                onChange={onChange}
                renderControlWrapper={(paramKey, label, control) => {
                    wrappedKeys.push(paramKey);
                    return <label key={paramKey}>{label}{control}</label>;
                }}
            />
        );

        expect(wrappedKeys).toEqual([
            'attack',
            'decay',
            'sustain',
            'release',
            'depth',
            'velocitySensitivity',
        ]);

        fireEvent.change(screen.getByLabelText('Attack (s)'), { target: { value: '0.008' } });
        fireEvent.change(screen.getByLabelText('Decay (s)'), { target: { value: '0.125' } });
        fireEvent.change(screen.getByLabelText('Sustain'), { target: { value: '0.85' } });
        fireEvent.change(screen.getByLabelText('Release (s)'), { target: { value: '0.18' } });

        expect(onChange).toHaveBeenCalledWith('attack', 0.008);
        expect(onChange).toHaveBeenCalledWith('decay', 0.125);
        expect(onChange).toHaveBeenCalledWith('sustain', 0.85);
        expect(onChange).toHaveBeenCalledWith('release', 0.18);
    });
});

describe('NodeParameterControls P2 range contracts', () => {
    it.each([
        { type: 'gain', data: { gain: 0.75 }, param: 'gain', typed: '99', expected: 4 },
        { type: 'distortion', data: { drive: 20, shape: 'classic', tone: 4000, mix: 0.5 }, param: 'tone', typed: '50000', expected: 20000 },
        { type: 'delay', data: { bpmSync: false, delayTime: 0.5, feedback: 0.5, mix: 0.5 }, param: 'delayTime', typed: '5', expected: 2 },
        { type: 'delay', data: { bpmSync: false, delayTime: 0.5, feedback: 0.5, mix: 0.5 }, param: 'delayTime', typed: '-1', expected: 0 },
    ])('$type clamps committed $param values to $expected', ({ type, data, param, typed, expected }) => {
        const { container, onChange } = renderControls(type, data);
        const input = textInputFor(container, param);

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: typed } });
        fireEvent.blur(input);

        expect(onChange).toHaveBeenLastCalledWith(param, expected);
    });

    it('caps both Filter resonance entry and the XY pad at 20', () => {
        const { container, onChange } = renderControls('filter', {
            type: 'Lowpass', cutoff: 800, resonance: 1,
        });
        const resonance = container.querySelector('[data-param="resonance"] input[type="number"]');
        if (!(resonance instanceof HTMLInputElement)) throw new Error('Missing resonance input');

        fireEvent.focus(resonance);
        fireEvent.change(resonance, { target: { value: '30' } });
        fireEvent.blur(resonance);
        expect(onChange).toHaveBeenLastCalledWith('resonance', 20);

        const pad = container.querySelector('svg')?.parentElement;
        if (!(pad instanceof HTMLDivElement)) throw new Error('Missing filter XY pad');
        vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 250, bottom: 200,
            width: 250, height: 200, toJSON: () => ({}),
        });
        fireEvent.mouseDown(pad, { clientX: 125, clientY: 0 });

        const lastCall = onChange.mock.calls.at(-1);
        expect(lastCall?.[0]).toBe('resonance');
        expect(lastCall?.[1]).toBeCloseTo(20, 6);
    });
});
