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

        expect(onToggleStep).toHaveBeenCalledWith('track-1', 2);
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
