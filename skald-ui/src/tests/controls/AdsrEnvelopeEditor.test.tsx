// @vitest-environment jsdom
//
// Roadmap E8 (9.4 item 2) — ADSR per-stage curve tension. warpT/
// invertWarpAtHalf mirror skald_adsr_warp (skald-backend/core/
// codegen_project.odin::emit_adsr_warp_proc) verbatim — see the comment on
// warpT in the component itself for why this must stay an exact copy, not
// an approximation. The drag tests below prove the handle a user actually
// touches reads back the curve it just wrote, and that dragging one stage's
// handle never disturbs another stage's timing/level.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdsrEnvelopeEditor, invertWarpAtHalf, warpT } from '../../components/controls/AdsrEnvelopeEditor';

afterEach(() => {
    cleanup();
});

describe('warpT — mirrors skald_adsr_warp exactly', () => {
    it('is the identity at c=0 for every t, not merely close to it', () => {
        for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
            expect(warpT(t, 0)).toBe(t);
        }
    });

    it('lands well away from the linear midpoint at the curve extremes', () => {
        expect(warpT(0.5, 1)).toBeGreaterThan(0.9);
        expect(warpT(0.5, -1)).toBeLessThan(0.1);
    });

    it('always starts at 0 and ends at 1 regardless of curve', () => {
        for (const c of [-1, -0.4, 0.4, 1]) {
            expect(warpT(0, c)).toBeCloseTo(0, 3);
            expect(warpT(1, c)).toBeCloseTo(1, 3);
        }
    });
});

describe('invertWarpAtHalf — round-trips warpT(0.5, c)', () => {
    it('recovers c for a spread of values, including the extremes', () => {
        for (const c of [-1, -0.6, -0.2, 0, 0.2, 0.6, 1]) {
            const target = warpT(0.5, c);
            expect(invertWarpAtHalf(target)).toBeCloseTo(c, 2);
        }
    });
});

const BASE_VALUE = {
    attack: 1.0, decay: 0.5, sustain: 0.5, release: 1.0,
    attackCurve: 0, decayCurve: 0, releaseCurve: 0,
};

// width=300 height=150 maxTime=4 (component defaults) — every coordinate
// below is computed from those, not guessed, so a future default change
// fails this test loudly instead of silently drifting.
const mockSvgRect = () => {
    const svg = document.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) throw new Error('Missing <svg>');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 150, width: 300, height: 150, toJSON: () => ({}),
    } as DOMRect);
};

describe('AdsrEnvelopeEditor tension handles', () => {
    it('sit at the linear midpoint (scaleY(0.5)) when every curve is 0', () => {
        render(<AdsrEnvelopeEditor value={BASE_VALUE} onChange={vi.fn()} />);
        // scaleY(0.5) = (150 - 2*10) * (1 - 0.5) + 10 = 75.
        expect(screen.getByTestId('curve-handle-attackCurve').getAttribute('cy')).toBe('75');
    });

    it('dragging the attack handle upward (higher target level) writes a POSITIVE attackCurve and touches nothing else', () => {
        const onChange = vi.fn();
        render(<AdsrEnvelopeEditor value={BASE_VALUE} onChange={onChange} />);
        mockSvgRect();

        fireEvent.mouseDown(screen.getByTestId('curve-handle-attackCurve'));
        // clientY=20 -> levelAtY(20) = 1 - (20-10)/130 = 0.923.
        fireEvent.mouseMove(window, { clientX: 37, clientY: 20 });

        expect(onChange).toHaveBeenCalled();
        const written = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(written.attackCurve).toBeCloseTo(invertWarpAtHalf(1 - (20 - 10) / 130), 2);
        expect(written.attackCurve).toBeGreaterThan(0);
        // The one thing this drag must NOT do: move a timing/level value
        // that belongs to a DIFFERENT handle.
        expect(written.attack).toBe(BASE_VALUE.attack);
        expect(written.decay).toBe(BASE_VALUE.decay);
        expect(written.sustain).toBe(BASE_VALUE.sustain);
        expect(written.release).toBe(BASE_VALUE.release);
        expect(written.decayCurve).toBe(0);
        expect(written.releaseCurve).toBe(0);
    });

    it('dragging the attack handle downward (lower target level) writes a NEGATIVE attackCurve', () => {
        const onChange = vi.fn();
        render(<AdsrEnvelopeEditor value={BASE_VALUE} onChange={onChange} />);
        mockSvgRect();

        fireEvent.mouseDown(screen.getByTestId('curve-handle-attackCurve'));
        fireEvent.mouseMove(window, { clientX: 37, clientY: 130 });

        const written = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(written.attackCurve).toBeLessThan(0);
    });

    it('dragging the decay handle writes decayCurve and leaves attackCurve/releaseCurve alone', () => {
        const onChange = vi.fn();
        render(<AdsrEnvelopeEditor value={BASE_VALUE} onChange={onChange} />);
        mockSvgRect();

        fireEvent.mouseDown(screen.getByTestId('curve-handle-decayCurve'));
        fireEvent.mouseMove(window, { clientX: 100, clientY: 20 });

        const written = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(written.decayCurve).not.toBe(0);
        expect(written.attackCurve).toBe(0);
        expect(written.releaseCurve).toBe(0);
    });

    it('a sustain of exactly 1 collapses the decay stage — dragging its handle is a guarded no-op, not a crash', () => {
        const flatSustain = { ...BASE_VALUE, sustain: 1 };
        const onChange = vi.fn();
        render(<AdsrEnvelopeEditor value={flatSustain} onChange={onChange} />);
        mockSvgRect();

        fireEvent.mouseDown(screen.getByTestId('curve-handle-decayCurve'));
        expect(() => fireEvent.mouseMove(window, { clientX: 100, clientY: 20 })).not.toThrow();

        const written = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(written.decayCurve).toBe(0); // unchanged — nothing to invert against
    });

    it('a sustain of exactly 0 collapses the release stage — dragging its handle is a guarded no-op, not a crash', () => {
        const zeroSustain = { ...BASE_VALUE, sustain: 0 };
        const onChange = vi.fn();
        render(<AdsrEnvelopeEditor value={zeroSustain} onChange={onChange} />);
        mockSvgRect();

        fireEvent.mouseDown(screen.getByTestId('curve-handle-releaseCurve'));
        expect(() => fireEvent.mouseMove(window, { clientX: 250, clientY: 20 })).not.toThrow();

        const written = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(written.releaseCurve).toBe(0);
    });
});
