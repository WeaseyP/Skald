// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSlider } from '../../components/controls/CustomSlider';

// Vitest doesn't run @testing-library/react's auto-cleanup unless
// `globals: true` is set (same pattern as StepGrid.test.tsx / NumberInput.test.tsx).
afterEach(() => {
    cleanup();
});

// BUG-PARAM-DISPLAY-PRECISION: the slider's paired text box was rendering
// `value.toString()` verbatim, so a param driven by log-scale math or
// automation showed readouts like `30.02413252345235`. This is display-only
// coverage — it does not touch step/clamp/commit behavior, which is owned
// by BUG-INTEGER-CONTROLS-EMIT-FLOATS.
describe('CustomSlider display precision', () => {
    // CustomSlider doesn't forward arbitrary DOM attributes (no aria-label
    // passthrough), so the paired text box is located structurally instead.
    const getTextBox = (container: HTMLElement) =>
        container.querySelector('input[type="text"]') as HTMLInputElement;

    it('rounds a noisy floating-point value to at most two decimal places in the text box', () => {
        const { container } = render(
            <CustomSlider min={0} max={100} value={30.02413252345235} onChange={vi.fn()} />
        );
        expect(getTextBox(container).value).toBe('30.02');
    });

    it('preserves precise typed input in stored state even though the display rounds it back', () => {
        // A tiny controlled harness stands in for the real store round-trip:
        // CustomSlider's onChange writes into node data, which flows back
        // down as the `value` prop, same as in NodeParameterControls.
        let stored = 1;
        const onChange = vi.fn((v: number) => { stored = v; });
        const Harness: React.FC = () => {
            const [value, setValue] = React.useState(stored);
            return (
                <CustomSlider
                    min={0} max={100} value={value}
                    onChange={(v) => { onChange(v); setValue(v); }}
                />
            );
        };

        const { container } = render(<Harness />);
        const input = getTextBox(container);

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '30.02413252345235' } });
        fireEvent.blur(input);

        // Stored/emitted value keeps the full precision the user typed —
        // formatting never quantized it.
        expect(onChange).toHaveBeenCalledWith(30.02413252345235);

        // Display rounds the same underlying value to at most 2dp.
        expect(input.value).toBe('30.02');
    });
});
