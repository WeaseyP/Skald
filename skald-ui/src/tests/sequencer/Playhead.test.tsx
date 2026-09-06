// @vitest-environment jsdom
//
// Roadmap F1 item 5 — StepGrid drew its playhead as a private inline
// component (one overlay spanning every track row, animating `left` between
// steps). Extracted so a third reader (roadmap F1's drum roll, which is
// StepGrid-shaped — one row per kit piece rather than one row per pitch) can
// reuse it instead of copying the div. PianoRoll's own playhead stays inline
// deliberately: it draws one highlight PER PITCH ROW inside a scrolling
// matrix, not one overlay spanning the whole grid, and unifying that shape
// safely would need a repositioned container with no test in this file (or
// PianoRoll.test.tsx) to catch a geometry regression against. See the
// component's own file comment.
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { Playhead } from '../../components/Sequencer/Playhead';

describe('Playhead', () => {
    afterEach(() => cleanup());

    it('positions itself at step * stepWidth, one step wide', () => {
        const { container } = render(<Playhead step={4} bpm={120} stepWidth={40} />);
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.left).toBe('160px');
        expect(el.style.width).toBe('40px');
    });

    it('never intercepts pointer events (an overlay must not steal clicks from the grid underneath)', () => {
        const { container } = render(<Playhead step={0} bpm={120} stepWidth={40} />);
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.pointerEvents).toBe('none');
    });

    it('animates its position over one 16th note at the given bpm', () => {
        // 60 / 120 / 4 = 0.125s - a 16th note at 120 BPM.
        const { container } = render(<Playhead step={0} bpm={120} stepWidth={40} />);
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.transition).toBe('left 0.125s linear');
    });

    it('recomputes the transition duration when bpm changes', () => {
        const { container, rerender } = render(<Playhead step={0} bpm={120} stepWidth={40} />);
        rerender(<Playhead step={0} bpm={60} stepWidth={40} />);
        const el = container.firstElementChild as HTMLElement;
        // 60 / 60 / 4 = 0.25s
        expect(el.style.transition).toBe('left 0.25s linear');
    });
});
