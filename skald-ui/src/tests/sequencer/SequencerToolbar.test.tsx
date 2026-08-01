// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequencerToolbar } from '../../components/Sequencer/SequencerToolbar';
import { ScaleProvider } from '../../contexts/ScaleContext';

// Roadmap A7 item 3 (second half): rebuilds are fast now (-o:none), so a
// slow SUCCESSFUL one is indistinguishable from nothing happening at all
// unless something visibly says "building". This is the status pip that
// says so — reusing useWasmAudioEngine's isBuilding, not a second channel.

const baseProps = {
    isPlaying: false,
    bpm: 120,
    isLooping: false,
    onPlay: vi.fn(),
    onStop: vi.fn(),
    onBpmChange: vi.fn(),
    patternSteps: 16,
    onPatternStepsChange: vi.fn(),
    onLoopToggle: vi.fn(),
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
};

const renderToolbar = (isBuilding: boolean) =>
    render(
        <ScaleProvider>
            <SequencerToolbar {...baseProps} isBuilding={isBuilding} />
        </ScaleProvider>
    );

describe('SequencerToolbar — build status pip', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows the pip while a preview build is in flight', () => {
        renderToolbar(true);
        expect(screen.getByTestId('build-status-pip')).toBeTruthy();
    });

    it('shows no pip when nothing is building', () => {
        renderToolbar(false);
        expect(screen.queryByTestId('build-status-pip')).toBeNull();
    });
});
