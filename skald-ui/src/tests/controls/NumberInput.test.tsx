// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput } from '../../components/common/NumberInput';

// Vitest doesn't run @testing-library/react's auto-cleanup unless
// `globals: true` is set, so each render would otherwise pile onto the
// same document and break getByLabelText. Explicit cleanup keeps each
// test isolated (same pattern as StepGrid.test.tsx).
afterEach(() => {
    cleanup();
});

// BUG-PARAM-DISPLAY-PRECISION: NumberInput backs every on-canvas node field
// and every slider's paired number box, so its display formatting covers
// the general case (graph/slider readouts round to 2dp by default, typed
// precision survives to stored state).
describe('NumberInput display precision', () => {
    it('rounds a noisy floating-point value to at most two decimal places while not focused', () => {
        render(<NumberInput aria-label="param" value={30.02413252345235} onChange={vi.fn()} />);
        const input = screen.getByLabelText('param') as HTMLInputElement;
        expect(input.value).toBe('30.02');
    });

    it('shows "0" rather than noisy near-zero float garbage', () => {
        render(<NumberInput aria-label="param" value={0.0000000000001} onChange={vi.fn()} />);
        const input = screen.getByLabelText('param') as HTMLInputElement;
        expect(input.value).toBe('0');
    });

    it('lets a user type more precision than the display shows, and preserves it in onChange on commit', () => {
        const onChange = vi.fn();
        render(<NumberInput aria-label="param" value={0.1} onChange={onChange} />);
        const input = screen.getByLabelText('param') as HTMLInputElement;

        // Resting display is rounded.
        expect(input.value).toBe('0.1');

        // User deliberately types a precise value.
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '30.02413252345235' } });
        fireEvent.blur(input);

        // The exact typed value is what gets stored/emitted — not rounded.
        expect(onChange).toHaveBeenCalledWith(30.02413252345235);
    });

    it('round-trips precise input through re-rendered stored state: display rounds, value does not', () => {
        const onChange = vi.fn();
        const { rerender } = render(<NumberInput aria-label="param" value={1} onChange={onChange} />);
        const input = screen.getByLabelText('param') as HTMLInputElement;

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '30.02413252345235' } });
        fireEvent.blur(input);

        expect(onChange).toHaveBeenCalledWith(30.02413252345235);

        // Simulate the store round-tripping the exact committed value back
        // in as the new `value` prop (as node data / project state would).
        rerender(<NumberInput aria-label="param" value={30.02413252345235} onChange={onChange} />);

        // Display is rounded for readability...
        expect(input.value).toBe('30.02');

        // ...but re-focusing reveals the full precision was preserved, not
        // silently quantized to what was displayed.
        fireEvent.focus(input);
        expect(input.value).toBe('30.02413252345235');
    });

    it('does not re-quantize the stored value when a field is merely focused and blurred without edits', () => {
        const onChange = vi.fn();
        render(<NumberInput aria-label="param" value={30.02413252345235} onChange={onChange} />);
        const input = screen.getByLabelText('param') as HTMLInputElement;

        fireEvent.focus(input);
        fireEvent.blur(input);

        expect(onChange).toHaveBeenCalledWith(30.02413252345235);
    });
});
