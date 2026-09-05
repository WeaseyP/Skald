// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';

const renderControls = (type: string, data: Record<string, unknown>) => {
    const onChange = vi.fn();
    // Mirrors ParameterPanel's own default: a wrapper that is not told
    // otherwise offers the expose affordance.
    const exposability: Record<string, boolean> = {};
    const result = render(
        <NodeParameterControls
            node={{ id: `${type}-1`, type, position: { x: 0, y: 0 }, data }}
            onChange={onChange}
            renderControlWrapper={(paramKey, label, control, isExposable = true) => {
                exposability[paramKey] = isExposable;
                return <section key={paramKey} data-param={paramKey} aria-label={label}>{control}</section>;
            }}
        />
    );
    return { ...result, onChange, exposability };
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
            // Roadmap E8 (9.4 item 2): per-stage curve tension.
            'attackCurve',
            'decayCurve',
            'releaseCurve',
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

    it('widens Instrument Glide entry to the backend clamp of 5 s', () => {
        // A7 item 12: the UI capped at 2 s while `param_ranges.odin`'s glide
        // entry says 0-5. Two languages, two answers; the UI moves.
        const { container, onChange } = renderControls('instrument', {
            name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5,
        });
        const glide = textInputFor(container, 'glide');

        fireEvent.focus(glide);
        fireEvent.change(glide, { target: { value: '4' } });
        fireEvent.blur(glide);
        expect(onChange).toHaveBeenLastCalledWith('glide', 4);

        fireEvent.focus(glide);
        fireEvent.change(glide, { target: { value: '9' } });
        fireEvent.blur(glide);
        expect(onChange).toHaveBeenLastCalledWith('glide', 5);
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

// ---------------------------------------------------------------------------
// Packet A7 (cheap-win batch) — exposure honesty and missing controls.
// ---------------------------------------------------------------------------

describe('A7-5 syncRate is not exposable', () => {
    // Exposing `syncRate` minted a `set_syncRate` for a note-division STRING:
    // it fell through to the unknown-parameter range {-1e6, 1e6, 0.0, ""} and
    // wrote a struct field the DSP never reads, persisting into the save file.
    it.each([
        { type: 'lfo', data: { waveform: 'Sine', bpmSync: true, syncRate: '1/4', amplitude: 1 } },
        { type: 'delay', data: { bpmSync: true, syncRate: '1/8', feedback: 0.5, mix: 0.5 } },
        { type: 'sampleHold', data: { bpmSync: true, syncRate: '1/8', amplitude: 1 } },
    ])('$type offers no expose affordance for syncRate', ({ type, data }) => {
        const { exposability } = renderControls(type, data);
        expect(exposability).toHaveProperty('syncRate');
        expect(exposability.syncRate).toBe(false);
    });

    it('still exposes the free-run field the sync rate shadows', () => {
        // The fix must not over-reach: with bpmSync off, the numeric field IS
        // live and IS exposable.
        expect(renderControls('lfo', { waveform: 'Sine', bpmSync: false, frequency: 5, amplitude: 1 })
            .exposability.frequency).toBe(true);
        expect(renderControls('delay', { bpmSync: false, delayTime: 0.5, feedback: 0.5, mix: 0.5 })
            .exposability.delayTime).toBe(true);
        expect(renderControls('sampleHold', { bpmSync: false, rate: 10, amplitude: 1 })
            .exposability.rate).toBe(true);
    });
});

describe('A7-6 mixer channel levels are exposable from the editor', () => {
    const mixerData = {
        inputCount: 3,
        levels: [
            { id: 1, level: 0.75, pan: 0 },
            { id: 2, level: 0.4, pan: 0 },
            { id: 3, level: 1.5, pan: 0 },
        ],
    };

    it('offers the expose affordance on every level<n>', () => {
        const { exposability } = renderControls('mixer', mixerData);
        expect(exposability.level1).toBe(true);
        expect(exposability.level2).toBe(true);
        expect(exposability.level3).toBe(true);
        // inputCount is a compile-time structural value, not a live param.
        expect(exposability.inputCount).toBe(false);
    });
});

describe('A7-8 Wavetable amplitude has a sidebar control', () => {
    it('renders an Amplitude control and writes to `amplitude`', () => {
        const { container, onChange, exposability } = renderControls('wavetable', {
            tableName: 'Sine', frequency: 440, position: 0, amplitude: 1,
        });
        expect(exposability.amplitude).toBe(true);

        const amp = textInputFor(container, 'amplitude');
        fireEvent.focus(amp);
        fireEvent.change(amp, { target: { value: '0.25' } });
        fireEvent.blur(amp);
        expect(onChange).toHaveBeenLastCalledWith('amplitude', 0.25);
    });

    it('reads an ABSENT amplitude as 1.0 — what the engine actually plays', () => {
        // Patches saved before the field existed carry no `amplitude`. The old
        // card rendered 0 while the generated code played the codegen fallback
        // of 1.0. No value is written back (no migration — that is C1's).
        const { container, onChange } = renderControls('wavetable', {
            tableName: 'Sine', frequency: 440, position: 0,
        });
        expect(textInputFor(container, 'amplitude').value).toBe('1');
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('A7-11 Mod Index slider travel is tapered, not linear', () => {
    const positionFor = (modIndex: number) => {
        const { container } = renderControls('fmOperator', { frequency: 1, modIndex });
        const range = container.querySelector('[data-param="modIndex"] input[type="range"]');
        if (!(range instanceof HTMLInputElement)) throw new Error('Missing modIndex range input');
        return parseFloat(range.value);
    };

    it('puts the musically useful 0-10 band well above the bottom 1% of travel', () => {
        // Linear: modIndex 10 of 1000 sat at 1% of the fader. The whole
        // musical range was inside one pixel.
        const at10 = positionFor(10);
        expect(at10).toBeGreaterThan(15);
        expect(at10).toBeLessThan(30);
    });

    it('keeps the stops and the default where they were', () => {
        // Endpoints are fixed points of the mapping, so stored values at the
        // extremes still land on the extremes of the travel.
        expect(positionFor(0)).toBe(0);
        expect(positionFor(1000)).toBeCloseTo(100, 6);
        // Default 100 sits near mid-travel rather than at 10%.
        expect(positionFor(100)).toBeGreaterThan(40);
        expect(positionFor(100)).toBeLessThan(55);
    });

    it('is monotonic and round-trips a dragged position back to the same value', () => {
        const { container, onChange } = renderControls('fmOperator', { frequency: 1, modIndex: 100 });
        const range = container.querySelector('[data-param="modIndex"] input[type="range"]');
        if (!(range instanceof HTMLInputElement)) throw new Error('Missing modIndex range input');

        fireEvent.change(range, { target: { value: '21.544' } });
        const dragged = onChange.mock.calls.at(-1)?.[1] as number;
        // 21.544% of travel cubed x 1000 = 10.0 — the top of the musical band.
        expect(dragged).toBeCloseTo(10, 1);
        expect(positionFor(dragged)).toBeCloseTo(21.544, 1);
    });
});

// ---------------------------------------------------------------------------
// Packet B11 — deleting ParameterPanel's inline mixer/mapper/midiInput bypass
// branches makes this component the ONE path those node types render through.
// Both traps below existed only because the bypass reached the user first:
// mapper's exposability and midiInput's controls entirely.
// ---------------------------------------------------------------------------

describe('B11 mapper inMin/inMax/outMin/outMax are exposable', () => {
    it('offers the expose affordance on every mapper field', () => {
        // Before B11, ParameterPanel's inline mapper bypass returned before
        // this switch was reached and already offered the toggle (its
        // `wrapper` defaults to `isExposable = true`). This case said `false`,
        // which was unreachable dead code — exactly the shape of trap SKB-043
        // hit for mixer levels. Deleting the bypass without flipping this
        // would have silently regressed a working feature.
        const { exposability } = renderControls('mapper', { inMin: 0, inMax: 1, outMin: 0, outMax: 1 });
        expect(exposability.inMin).toBe(true);
        expect(exposability.inMax).toBe(true);
        expect(exposability.outMin).toBe(true);
        expect(exposability.outMax).toBe(true);
    });
});

describe('B11 midiInput controls are reachable through NodeParameterControls', () => {
    it('renders the MIDI device select and writes to `device`', () => {
        // Before B11, ParameterPanel's inline midiInput bypass rendered these
        // controls locally and returned before this switch was ever reached —
        // there was no `midiInput` case here at all. Deleting the bypass
        // without adding one would have dropped the controls from the sidebar
        // entirely (falling through to "No standard controls for midiInput"),
        // not just their exposability.
        const { container, onChange, exposability } = renderControls('midiInput', { device: 'All', useMpe: false });

        const select = container.querySelector('[data-param="device"] select');
        if (!(select instanceof HTMLSelectElement)) throw new Error('Missing MIDI device select');
        expect(exposability.device).toBe(false);

        fireEvent.change(select, { target: { value: 'Device B' } });
        expect(onChange).toHaveBeenCalledWith('device', 'Device B');
    });

    it('renders the Enable MPE checkbox and writes to `useMpe`', () => {
        const { container, onChange } = renderControls('midiInput', { device: 'All', useMpe: false });

        const checkbox = container.querySelector('input[type="checkbox"]');
        if (!(checkbox instanceof HTMLInputElement)) throw new Error('Missing Enable MPE checkbox');

        fireEvent.click(checkbox);
        expect(onChange).toHaveBeenCalledWith('useMpe', true);
    });
});
