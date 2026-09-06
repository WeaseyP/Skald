/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/DrumKitView.tsx                      |
|                                                                              |
| Roadmap F3 (0.2 §9.2 item 2) — the whole kit in one workspace.               |
|                                                                              |
| A kit is one Instrument per piece, so a groove lived across four track       |
| viewports and authoring one meant opening and closing four editors to place  |
| notes that only make sense next to each other. This is the Drum Roll         |
| generalised to N rows: the same DrumRollRow, one per percussive track, under |
| one step header and one playhead, with each row's name, mute, solo and hit   |
| note beside it.                                                              |
|                                                                              |
| ROWS ARE NOT LANES OF ONE TRACK, and nothing here may make them so. Each row |
| is its own SequencerTrack, keyed 1:1 to an Instrument in the backend model   |
| (codegen_analysis.odin::active_sequencer_tracks filters `target_node_id ==   |
| instrument.id`), and merging two of them on disk would delete one asset's    |
| whole sequence. So this component only ever LAYS OUT existing tracks: every  |
| mutation it fires names the row's own track id, and each row owns its own    |
| paint gesture so a drag cannot leak sideways into a neighbour's export.      |
================================================================================
*/
import React, { useRef } from 'react';
import { NoteEvent, SequencerTrack } from '../../definitions/types';
import { NumberInput } from '../common/NumberInput';
import { DrumRollRow } from './DrumRollRow';
import { OutOfRangeNotice } from './OutOfRangeNotice';
import { Playhead } from './Playhead';
import { canonicalDrumPitch } from './drumKit';
import {
    MIDI_NOTE_MAX,
    MIDI_NOTE_MIN,
    effectiveTrackSteps,
    isBeatStart,
    noteExtent,
    outOfRangeNoteCount,
    stepWidthFor,
    stepWidthMinFor,
} from './stepMetrics';
import { useElementWidth } from './useElementWidth';
import { useViewport } from '../../hooks/useViewport';
import { usePlayheadScroll } from '../../hooks/sequencer/usePlayheadScroll';

export interface DrumKitViewProps {
    /** The percussive tracks, already selected by trackViewMode.ts::percussiveTracks. */
    tracks: SequencerTrack[];
    currentStep: number;
    patternSteps: number;
    bpm: number;
    onToggleStep: (trackId: string, step: number, notePitch?: number) => void;
    onClearStep: (trackId: string, step: number) => void;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    onSelectNote?: (trackId: string, step: number, notePitch: number) => void;
    onSetDefaultNote?: (trackId: string, note: number) => void;
    onMuteToggle: (trackId: string) => void;
    onSoloToggle: (trackId: string) => void;
    onClose: () => void;
}

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 24;
const LABEL_WIDTH = 190;

const containerStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1E1E1E',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    color: '#eee',
    fontFamily: 'sans-serif',
};

const toolbarStyles: React.CSSProperties = {
    height: '40px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 10px',
    flex: '0 0 auto',
};

const iconBtnStyles: React.CSSProperties = {
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    padding: 0,
    fontSize: '11px',
    borderRadius: '2px',
};

const activeMuteStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#d9534f', color: 'white', borderColor: '#d9534f' };
const activeSoloStyle: React.CSSProperties = { ...iconBtnStyles, backgroundColor: '#f0ad4e', color: 'black', borderColor: '#f0ad4e' };

export const DrumKitView: React.FC<DrumKitViewProps> = ({
    tracks,
    currentStep,
    patternSteps,
    bpm,
    onToggleStep,
    onClearStep,
    onUpdateNote,
    onSelectNote,
    onSetDefaultNote,
    onMuteToggle,
    onSoloToggle,
    onClose,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // One column count for the whole kit — a shared header and a single
    // playhead are only honest if every row is on the same grid. The widest
    // track decides, and `noteExtent` widens it further for a note stranded
    // past every length there is (SKB-010), so no row's data goes undrawn.
    const columns = Math.max(
        patternSteps,
        noteExtent(tracks),
        ...tracks.map(t => t.steps || 16),
    );
    const strandedCount = outOfRangeNoteCount(tracks, patternSteps);

    const { isNarrow, isCoarsePointer } = useViewport();
    const [, containerWidth] = useElementWidth<HTMLDivElement>(scrollRef);
    const stepWidth = stepWidthFor(columns, Math.max(0, containerWidth - LABEL_WIDTH), {
        min: stepWidthMinFor(isCoarsePointer),
    });
    usePlayheadScroll(isNarrow, scrollRef, currentStep, stepWidth);

    return (
        <div style={containerStyles} data-testid="drum-kit">
            <div style={toolbarStyles}>
                <span style={{ fontWeight: 'bold' }}>Drum Kit — {tracks.length} pieces</span>
                <span style={{ fontSize: '10px', color: '#888' }}>
                    Each row is its own Instrument and its own exported asset; this only edits them side by side.
                </span>
                <span style={{ marginLeft: 'auto' }}>
                    <button onClick={onClose} style={{ cursor: 'pointer', padding: '5px 10px' }}>Close</button>
                </span>
            </div>

            <OutOfRangeNotice count={strandedCount} patternSteps={patternSteps} />

            <div style={{ flexGrow: 1, overflow: 'auto', position: 'relative' }} ref={scrollRef} data-testid="drum-kit-scroll" onContextMenu={(e) => e.preventDefault()}>
                <div style={{ display: 'flex', minWidth: '100%' }}>
                    {/* Row labels. Sticky, so the names stay readable while a
                        long pattern scrolls under them. */}
                    <div style={{ width: LABEL_WIDTH, flex: `0 0 ${LABEL_WIDTH}px`, position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#252526', borderRight: '1px solid #333' }}>
                        <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid #333' }} />
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                data-testid={`drum-kit-row-${track.id}`}
                                style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: '4px', padding: '0 5px', boxSizing: 'border-box', borderBottom: '1px solid #2A2A2A', fontSize: '11px' }}
                            >
                                <div style={{ width: '4px', height: '70%', backgroundColor: track.color }} />
                                <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={track.name}>
                                    {track.name}
                                </span>
                                <button
                                    data-testid={`drum-kit-mute-${track.id}`}
                                    style={track.isMuted ? activeMuteStyle : iconBtnStyles}
                                    onClick={() => onMuteToggle(track.id)}
                                    title="Mute — this is the export's mute, not a preview-only one: a muted track is dropped from the asset's active track set"
                                >
                                    M
                                </button>
                                <button
                                    data-testid={`drum-kit-solo-${track.id}`}
                                    style={track.isSolo ? activeSoloStyle : iconBtnStyles}
                                    onClick={() => onSoloToggle(track.id)}
                                    title="Solo — also structural: leaving one on when you export ships a project with the other assets missing"
                                >
                                    S
                                </button>
                                {onSetDefaultNote && (
                                    <NumberInput
                                        data-testid={`drum-kit-note-${track.id}`}
                                        value={canonicalDrumPitch(track)}
                                        min={MIDI_NOTE_MIN}
                                        max={MIDI_NOTE_MAX}
                                        step={1}
                                        quantize
                                        onChange={(v) => onSetDefaultNote(track.id, v)}
                                        style={{ width: '40px', backgroundColor: '#333', color: '#ccc', border: '1px solid #444', fontSize: '10px', textAlign: 'center' }}
                                        title="The MIDI note new hits on this row are written at"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    <div style={{ width: columns * stepWidth }}>
                        {/* One step header for the whole kit. */}
                        <div data-testid="drum-kit-step-header" style={{ height: HEADER_HEIGHT, display: 'flex', borderBottom: '1px solid #333' }}>
                            {Array.from({ length: columns }, (_, step) => (
                                <div
                                    key={step}
                                    style={{
                                        flex: `0 0 ${stepWidth}px`,
                                        width: stepWidth,
                                        textAlign: 'center',
                                        fontSize: '9px',
                                        lineHeight: `${HEADER_HEIGHT}px`,
                                        color: step === currentStep ? '#0f0' : (step >= patternSteps ? '#5a5a5a' : '#888'),
                                        borderRight: isBeatStart(step + 1) ? '1px solid #444' : '1px solid #2A2A2A',
                                    }}
                                >
                                    {isBeatStart(step) ? step : ''}
                                </div>
                            ))}
                        </div>

                        {/* One playhead, spanning every row rather than one per row. */}
                        <div style={{ position: 'relative' }} data-testid="drum-kit-playhead">
                            <Playhead step={currentStep} bpm={bpm} stepWidth={stepWidth} />
                            {tracks.map(track => {
                                const trackSteps = track.steps || 16;
                                return (
                                    <div key={track.id} style={{ borderBottom: '1px solid #2A2A2A' }}>
                                        <DrumRollRow
                                            track={track}
                                            columns={columns}
                                            // Per row, not per kit: two pieces may
                                            // legitimately loop at different lengths,
                                            // and greying every row at the shortest
                                            // one would lie about the longer.
                                            playableSteps={effectiveTrackSteps(trackSteps, patternSteps)}
                                            stepWidth={stepWidth}
                                            rowHeight={ROW_HEIGHT}
                                            paintPitch={canonicalDrumPitch(track)}
                                            idPrefix={`drum-kit-${track.id}`}
                                            trackSteps={trackSteps}
                                            patternSteps={patternSteps}
                                            onToggleStep={onToggleStep}
                                            onClearStep={onClearStep}
                                            onUpdateNote={onUpdateNote}
                                            onSelectNote={onSelectNote}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
