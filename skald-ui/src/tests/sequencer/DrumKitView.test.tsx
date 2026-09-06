// @vitest-environment jsdom
/*
================================================================================
| Roadmap F3 (0.2 §9.2 item 2) — the kit workspace.                            |
|                                                                              |
| The thing that must never happen here is a write landing on the wrong track. |
| Rows LOOK like one instrument's lanes and are not: each is a separate        |
| SequencerTrack keyed 1:1 to an Instrument in the backend model               |
| (codegen_analysis.odin::active_sequencer_tracks filters on target_node_id),  |
| so a row that painted into its neighbour would be silent corruption of a     |
| different asset's export. Hence the per-row isolation tests below, and the   |
| test that a melodic track is not offered a row at all.                       |
================================================================================
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import { DrumKitView } from '../../components/Sequencer/DrumKitView';
import { percussiveTracks } from '../../components/Sequencer/trackViewMode';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';
import { SequencerDock } from '../../components/Sequencer/SequencerDock';
import { ScaleProvider } from '../../contexts/ScaleContext';

const instrument = (id: string, label: string, fixedPitch: boolean) => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label,
        subgraph: {
            nodes: [{ id: `${id}-osc`, type: 'oscillator', position: { x: 0, y: 0 }, data: { fixedPitch } }],
            connections: [],
        },
    },
}) as unknown as Node<NodeParams>;

const track = (id: string, targetNodeId: string, name: string, notes: SequencerTrack['notes']): SequencerTrack => ({
    id, targetNodeId, name, color: '#d95', steps: 16, notes, isMuted: false, isSolo: false,
});

const nodes = [
    instrument('inst-kick', 'Kick', true),
    instrument('inst-snare', 'Snare', true),
    instrument('inst-hat', 'Hat', true),
    instrument('inst-bass', 'Bass', false),
];

const tracks: SequencerTrack[] = [
    track('t-kick', 'inst-kick', 'Kick', [{ step: 0, note: 36, velocity: 1, duration: 1 }]),
    track('t-snare', 'inst-snare', 'Snare', [{ step: 4, note: 38, velocity: 1, duration: 1 }]),
    track('t-hat', 'inst-hat', 'Hat', [{ step: 2, note: 42, velocity: 0.6, duration: 1 }]),
    track('t-bass', 'inst-bass', 'Bass', [
        { step: 0, note: 40, velocity: 1, duration: 1 },
        { step: 8, note: 47, velocity: 1, duration: 1 },
    ]),
];

describe('percussiveTracks', () => {
    it('selects only the tracks that resolve percussive, in track order', () => {
        expect(percussiveTracks(tracks, nodes).map(t => t.id)).toEqual(['t-kick', 't-snare', 't-hat']);
    });

    it('honours an explicit override in both directions', () => {
        const overridden = [
            { ...tracks[0], viewMode: 'melodic' as const },
            tracks[3] && { ...tracks[3], viewMode: 'percussive' as const },
        ].filter(Boolean) as SequencerTrack[];
        expect(percussiveTracks(overridden, nodes).map(t => t.id)).toEqual(['t-bass']);
    });
});

describe('DrumKitView', () => {
    afterEach(cleanup);

    const renderKit = (overrides: Partial<React.ComponentProps<typeof DrumKitView>> = {}) => {
        const spies = {
            onToggleStep: vi.fn(),
            onClearStep: vi.fn(),
            onUpdateNote: vi.fn(),
            onSelectNote: vi.fn(),
            onSetDefaultNote: vi.fn(),
            onMuteToggle: vi.fn(),
            onSoloToggle: vi.fn(),
            onClose: vi.fn(),
        };
        render(
            <DrumKitView
                tracks={tracks.slice(0, 3)}
                currentStep={0}
                patternSteps={16}
                bpm={120}
                {...spies}
                {...overrides}
            />,
        );
        return spies;
    };

    it('renders one row per percussive track', () => {
        renderKit();
        expect(screen.getAllByTestId(/^drum-kit-row-/)).toHaveLength(3);
        expect(screen.getByTestId('drum-kit-row-t-kick').textContent).toContain('Kick');
        expect(screen.getByTestId('drum-kit-row-t-snare').textContent).toContain('Snare');
    });

    it('draws no row for a melodic track', () => {
        // The caller filters, but the assertion is what the user sees: nothing
        // in this workspace addresses the bass.
        renderKit();
        expect(document.querySelector('[data-testid="drum-kit-row-t-bass"]')).toBeNull();
    });

    it('paints into the row that was clicked and no other', () => {
        const { onToggleStep } = renderKit();
        fireEvent.mouseDown(screen.getByTestId('drum-kit-t-snare-cell-6'), { button: 0 });
        expect(onToggleStep).toHaveBeenCalledTimes(1);
        expect(onToggleStep).toHaveBeenCalledWith('t-snare', 6, 38);
    });

    it('does not let a sweep started in one row continue into another', () => {
        // The rows are separate Instruments in the backend model, so a drag
        // that leaked across them would write into a different asset's export.
        const { onToggleStep } = renderKit();
        fireEvent.mouseDown(screen.getByTestId('drum-kit-t-snare-cell-6'), { button: 0 });
        fireEvent.mouseEnter(screen.getByTestId('drum-kit-t-hat-cell-7'));
        expect(onToggleStep.mock.calls.map(c => c[0])).toEqual(['t-snare']);
    });

    it('selects a row\'s own hit for Step Properties', () => {
        const { onSelectNote } = renderKit();
        fireEvent.contextMenu(screen.getByTestId('drum-kit-t-hat-hit-2-42'));
        expect(onSelectNote).toHaveBeenCalledWith('t-hat', 2, 42);
    });

    it('shares one step header and one playhead across every row', () => {
        renderKit({ currentStep: 3 });
        expect(screen.getAllByTestId('drum-kit-step-header')).toHaveLength(1);
        expect(screen.getAllByTestId('drum-kit-playhead')).toHaveLength(1);
    });

    it('routes a row\'s mute through the real history-pushing mutation', () => {
        // Not "the spy was called": the point of the row button is that muting
        // a kit piece from here is the same undoable document edit as muting
        // it in the track list.
        const pushHistory = vi.fn();
        const Harness: React.FC = () => {
            const seq = useSequencerState({ pushHistory });
            // Mount only: the registry reconciliation is what puts a track
            // in the hook, and it is silent by design (see the hook header).
            const synced = React.useRef(false);
            React.useEffect(() => {
                if (synced.current) return;
                synced.current = true;
                seq.syncInstrumentTracks([{ id: 'inst-kick', name: 'Kick' }]);
            }, [seq]);
            if (seq.tracks.length === 0) return null;
            return (
                <DrumKitView
                    tracks={seq.tracks}
                    currentStep={0}
                    patternSteps={16}
                    bpm={120}
                    onToggleStep={seq.toggleStep}
                    onClearStep={seq.clearStep}
                    onUpdateNote={seq.updateNote}
                    onSelectNote={vi.fn()}
                    onSetDefaultNote={seq.setTrackDefaultNote}
                    onMuteToggle={seq.toggleMute}
                    onSoloToggle={seq.toggleSolo}
                    onClose={vi.fn()}
                />
            );
        };
        render(<Harness />);

        // syncInstrumentTracks is silent by design, so the stack is empty here.
        expect(pushHistory).not.toHaveBeenCalled();

        const muteButton = document.querySelector('[data-testid^="drum-kit-mute-"]') as HTMLElement;
        fireEvent.click(muteButton);
        expect(pushHistory).toHaveBeenCalledTimes(1);
        expect(pushHistory.mock.calls[0][0]).toBe('Mute track');
    });
});

describe('SequencerDock — the kit entry point', () => {
    afterEach(cleanup);

    const renderDock = (dockTracks: SequencerTrack[]) => render(
        <ScaleProvider>
            <SequencerDock
                state={{ isPlaying: false, currentStep: 0, tracks: dockTracks }}
                nodes={nodes}
                isBuilding={false}
                bpm={120}
                setBpm={vi.fn()}
                patternSteps={16}
                setPatternSteps={vi.fn()}
                masterVolume={0.8}
                setMasterVolume={vi.fn()}
                onPlay={vi.fn()}
                onStop={vi.fn()}
                onToggleLoop={vi.fn()}
                isLooping={false}
                onMuteToggle={vi.fn()}
                onSoloToggle={vi.fn()}
                onFocusTrack={vi.fn()}
                onToggleStep={vi.fn()}
                onClearStep={vi.fn()}
                onUpdateNote={vi.fn()}
                onUpdateSteps={vi.fn()}
                onStepSelect={vi.fn()}
                onSetTrackViewMode={vi.fn()}
                onSetTrackDefaultNote={vi.fn()}
                analyserNode={null}
                meterAnalysers={null}
            />
        </ScaleProvider>,
    );

    it('offers the Kit button once two percussive tracks exist, and opens the workspace', () => {
        renderDock(tracks);
        fireEvent.click(screen.getByTestId('open-drum-kit'));
        expect(screen.getAllByTestId(/^drum-kit-row-/)).toHaveLength(3);
    });

    it('hides the Kit button when only one track is percussive', () => {
        // One kit piece is what the single-track Drum Roll is for; a "kit" of
        // one row is a worse version of it, not a feature.
        renderDock([tracks[0], tracks[3]]);
        expect(document.querySelector('[data-testid="open-drum-kit"]')).toBeNull();
    });
});
