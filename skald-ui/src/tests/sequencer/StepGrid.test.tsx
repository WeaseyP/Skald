// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { SequencerTrack } from '../../definitions/types';

describe('StepGrid', () => {
    // Vitest doesn't run @testing-library/react's auto-cleanup unless
    // `globals: true` is set. Without it, each render appends to the same
    // document.body — every testid then appears twice in the second test
    // and getByTestId throws "multiple elements found". Explicit cleanup
    // restores per-test isolation.
    afterEach(() => {
        cleanup();
    });
    const mockTrack: SequencerTrack = {
        id: 'track-1',
        targetNodeId: 'node-1',
        name: 'Test Track',
        color: '#ff0000',
        steps: 16,
        notes: [],
        isMuted: false,
        isSolo: false
    };

    it('should render correct number of steps', () => {
        render(
            <StepGrid
                tracks={[mockTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        // Each step has a title attribute "Step X" or similar
        // Let's find by title for step 0 and step 15
        expect(screen.getByTitle(/^Step 0/)).toBeTruthy();
        expect(screen.getByTitle(/^Step 15/)).toBeTruthy();
    });

    it('should call onToggleStep when a cell is clicked — BUG-STEPGRID-DUP-TESTID regression', () => {
        // Previously skipped: (a) the assertion called fireEvent.click but
        // the component listens on onMouseDown, and (b) duplicate
        // data-testid was reported. With one track of 16 steps, all 16
        // testids must be unique.
        const onToggleStep = vi.fn();
        render(
            <StepGrid
                tracks={[mockTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={onToggleStep}
                bpm={120}
            />
        );

        // Count cells per step and dump duplicates so the failure mode is
        // legible if this regresses.
        const allCells = document.querySelectorAll('[data-testid^="step-track-1-"]');
        const counts = new Map<string, number>();
        allCells.forEach(el => {
            const id = el.getAttribute('data-testid')!;
            counts.set(id, (counts.get(id) || 0) + 1);
        });
        const dups: string[] = [];
        counts.forEach((c, id) => { if (c > 1) dups.push(`${id} x${c}`); });
        expect(dups, `unexpected duplicate testids: ${dups.join(', ')}`).toEqual([]);

        // Component uses onMouseDown for paint/select; left button = paint.
        const cell = screen.getByTestId('step-track-1-2');
        fireEvent.mouseDown(cell, { button: 0 });

        // SKB-025: the pitch is no longer implicit. A cell click names the
        // pitch it is about to create (middle C) rather than leaving
        // toggleStep to default it, so that every gesture in this grid says
        // which note it means.
        expect(onToggleStep).toHaveBeenCalledWith('track-1', 2, 60);
    });

    it('should render active notes', () => {
        const trackWithNote = {
            ...mockTrack,
            notes: [{ step: 4, note: 60, velocity: 1.0, duration: 1 }]
        };

        render(
            <StepGrid
                tracks={[trackWithNote]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );

        // Active note renders a div inside the cell.
        // The cell title changes to Include Duration info: "Step 4: Dur 1..."
        expect(screen.getByTitle(/Step 4: Dur 1/)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// B5-x2 — a note stranded past the playable range can be deleted in place.
// ---------------------------------------------------------------------------
describe('StepGrid — out-of-range notes (B5-x2)', () => {
    afterEach(() => { cleanup(); });

    const strandedTrack: SequencerTrack = {
        id: 'track-1', targetNodeId: 'node-1', name: 'Short', color: '#ff0000',
        steps: 4, notes: [{ step: 6, note: 60, velocity: 1, duration: 1 }], isMuted: false, isSolo: false,
    };

    it('right-click on a greyed cell clears the stranded note; left-click still creates nothing', () => {
        const onToggleStep = vi.fn();
        const onClearStep = vi.fn();
        render(<StepGrid tracks={[strandedTrack]} currentStep={0} steps={8} onToggleStep={onToggleStep} onClearStep={onClearStep} bpm={120} />);
        const cell = screen.getByTestId('step-track-1-6');
        expect(cell.getAttribute('aria-disabled')).toBe('true');

        fireEvent.mouseDown(cell, { button: 0 });
        expect(onToggleStep).not.toHaveBeenCalled();

        // Before B5-x2 every handler was gated on !isDisabled, so this did nothing.
        fireEvent.mouseDown(cell, { button: 2 });
        expect(onClearStep).toHaveBeenCalledWith('track-1', 6);
    });

    it('right-click on the stranded note block itself deletes that note', () => {
        const onToggleStep = vi.fn();
        render(<StepGrid tracks={[strandedTrack]} currentStep={0} steps={8} onToggleStep={onToggleStep} bpm={120} />);
        fireEvent.mouseDown(screen.getByTestId('step-note-track-1-6-60'), { button: 2 });
        expect(onToggleStep).toHaveBeenCalledWith('track-1', 6, 60);
    });

    it('the notice tells the user how to delete a stranded note', () => {
        render(<StepGrid tracks={[strandedTrack]} currentStep={0} steps={8} onToggleStep={vi.fn()} bpm={120} />);
        expect(screen.getByTestId('out-of-range-notice').textContent).toMatch(/right-click a greyed note to delete it/);
    });
});
