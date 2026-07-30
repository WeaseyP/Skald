// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PianoRoll } from '../../components/Sequencer/PianoRoll';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';

const track: SequencerTrack = {
    id: 'bass-track',
    targetNodeId: 'bass-instrument',
    name: 'Bass',
    color: '#007acc',
    steps: 16,
    notes: [{ step: 3, note: 24, velocity: 1, duration: 2 }],
    isMuted: false,
    isSolo: false
};

const renderPianoRoll = (onToggleStep = vi.fn()) => {
    render(
        <ScaleProvider>
            <PianoRoll
                track={track}
                onUpdateNote={vi.fn()}
                onToggleStep={onToggleStep}
                currentStep={0}
                steps={16}
                onClose={vi.fn()}
            />
        </ScaleProvider>
    );

    return onToggleStep;
};

describe('PianoRoll bass register', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders the full A0-C6 range and existing bass notes', () => {
        renderPianoRoll();

        expect(screen.getByText('A0')).toBeTruthy();
        expect(screen.getByText('C6')).toBeTruthy();
        expect(screen.queryByText('G#0')).toBeNull();

        const c1Row = screen.getByTestId('piano-roll-note-24');
        const paintedNote = c1Row.querySelector(
            'div[style*="left: 91px"][style*="width: 58px"]'
        );
        expect(paintedNote).toBeTruthy();
    });

    it('paints the clicked low pitch at the correct step', () => {
        const onToggleStep = renderPianoRoll();
        const a0Row = screen.getByTestId('piano-roll-note-21');

        fireEvent.mouseDown(a0Row, {
            button: 0,
            clientX: 50 + (5 * 30) + 1
        });

        expect(onToggleStep).toHaveBeenCalledWith('bass-track', 5, 21);
    });

    it('keeps the initial viewport centred on middle C', () => {
        renderPianoRoll();

        expect(screen.getByTestId('piano-roll-scroll-container').scrollTop).toBe(480);
    });
});
