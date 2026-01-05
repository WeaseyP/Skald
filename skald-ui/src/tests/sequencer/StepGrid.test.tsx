// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { SequencerTrack } from '../../definitions/types';

describe('StepGrid', () => {
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

    it.skip('should call onToggleStep when a cell is clicked', () => {
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

        const cell = screen.getByTestId('step-track-1-2');
        fireEvent.click(cell);

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
