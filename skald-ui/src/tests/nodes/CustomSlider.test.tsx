// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSlider } from '../../components/controls/CustomSlider';
import { NumberInput } from '../../components/common/NumberInput';

afterEach(cleanup);

// Regression coverage for BUG-INTEGER-CONTROLS-EMIT-FLOATS. The slider drives an
// internal 0..100 position; a Voice Count control (1..32, step 1) at position
// 52.1% used to commit 1 + 31 * 0.521 = 17.151 — a fractional value the Odin
// backend cannot unmarshal into an `int`. Commits must now quantize to `step`.

const rangeOf = (c: HTMLElement) => c.querySelector('input[type="range"]') as HTMLInputElement;
const textOf = (c: HTMLElement) => c.querySelector('input[type="text"]') as HTMLInputElement;

describe('CustomSlider — integer control (step 1) commits whole values', () => {
    it('pointer drag to 52.1% commits 17, not 17.151', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CustomSlider min={1} max={32} step={1} value={8} onChange={onChange} />
        );
        // 1 + 31 * 0.521 = 17.151 pre-quantization.
        fireEvent.change(rangeOf(container), { target: { value: '52.1' } });
        expect(onChange).toHaveBeenLastCalledWith(17);
        expect(onChange.mock.calls.every(([v]) => Number.isInteger(v))).toBe(true);
    });

    it('typed value 17.151 committed on blur snaps to a whole number', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CustomSlider min={1} max={32} step={1} value={8} onChange={onChange} />
        );
        const text = textOf(container);
        fireEvent.change(text, { target: { value: '17.151' } });
        fireEvent.blur(text);
        expect(onChange).toHaveBeenLastCalledWith(17);
    });

    it('typed value out of range clamps AND quantizes', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CustomSlider min={1} max={32} step={1} value={8} onChange={onChange} />
        );
        const text = textOf(container);
        fireEvent.change(text, { target: { value: '99.9' } });
        fireEvent.blur(text);
        expect(onChange).toHaveBeenLastCalledWith(32);
    });

    it('arrow keys move by whole step and stay on the integer grid', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CustomSlider min={1} max={32} step={1} value={8} onChange={onChange} />
        );
        fireEvent.keyDown(textOf(container), { key: 'ArrowUp' });
        expect(onChange).toHaveBeenLastCalledWith(9);
    });
});

describe('CustomSlider — fractional control snaps to its step, not to integers', () => {
    it('a step-0.01 control keeps two-decimal precision on drag', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CustomSlider min={0} max={1} step={0.01} value={0.5} onChange={onChange} />
        );
        // position 52.3% -> 0.523 -> snaps to 0.52 (its own step), not 1 or 0.
        fireEvent.change(rangeOf(container), { target: { value: '52.3' } });
        expect(onChange).toHaveBeenLastCalledWith(0.52);
    });
});

describe('NumberInput — quantize opt-in', () => {
    it('quantizes a typed fractional value to the integer step on blur', () => {
        const onChange = vi.fn();
        const { container } = render(
            <NumberInput min={1} max={32} step={1} quantize value={8} onChange={onChange} />
        );
        const input = container.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '17.151' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenLastCalledWith(17);
    });

    it('preserves precise typed input when quantize is off (fractional fields)', () => {
        const onChange = vi.fn();
        const { container } = render(
            <NumberInput min={0} max={100} step={0.01} value={5} onChange={onChange} />
        );
        const input = container.querySelector('input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '30.024' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenLastCalledWith(30.024);
    });
});
