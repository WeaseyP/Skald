/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/DrumRoll.tsx                         |
|                                                                              |
| Roadmap F2 (0.2 §9.2 item 1) — the percussive editor for ONE track.          |
|                                                                              |
| One row, not 128. Opening a chromatic keyboard on a kick asks the author to  |
| find one lane out of the whole MIDI space to click in, when the pitch of     |
| that lane is an inert label: a fixed-pitch oscillator ignores the played     |
| note entirely (skald-backend/core/codegen_nodes.odin::generate_oscillator_   |
| code). Which tracks get this editor is decided by trackViewMode.ts, never    |
| here.                                                                        |
|                                                                              |
| THE GENERATED CODE IS UNTOUCHED BY THIS FILE. Every gesture writes the same  |
| `NoteEvent` (step, note, velocity, duration, pLocks) the Piano Roll and the  |
| Step Grid write, through the same useSequencerState mutations, and           |
| `codegen_project.odin::generate_sequencer_logic` emits `<Asset>_note_on(p,   |
| note, velocity, duration)` per event with no idea which editor authored it — |
| verified by reading it, not assumed. A patch edited here and the same patch  |
| edited in the roll produce byte-identical Odin.                              |
|                                                                              |
| The row's gestures are DrumRollRow's, shared with the F3 kit workspace; the  |
| playhead, beat lines and scroll-follow are the sequencer core's              |
| (usePlayheadScroll, Playhead.tsx, stepMetrics.ts::isBeatStart). This file is |
| the chrome around one of those rows: the title, the hit-note field and the   |
| notice that the track holds pitches the row is not built around.             |
================================================================================
*/
import React, { useMemo, useRef } from 'react';
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
import { ResolvedTrackViewMode } from './trackViewMode';
import { ViewModeToggle } from './ViewModeToggle';

export interface DrumRollProps {
    track: SequencerTrack;
    currentStep: number;
    /** The track's own loop length. */
    steps: number;
    /** The global pattern length; the smaller of the two is what plays. */
    patternSteps?: number;
    bpm: number;
    onToggleStep: (trackId: string, step: number, notePitch?: number) => void;
    /**
     * Erase. A row has no pitch axis, so it clears the whole step rather than
     * one arbitrary member — the same reasoning as StepGrid's right-click
     * (SKB-025), and the reason `onToggleStep` is only ever used to ADD here.
     */
    onClearStep: (trackId: string, step: number) => void;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    /** Same Step Properties path the roll's right-click and the grid's click feed. */
    onSelectNote?: (trackId: string, step: number, notePitch: number) => void;
    /** The row's canonical-pitch field. Absent hides the field (read-only host). */
    onSetDefaultNote?: (trackId: string, note: number) => void;
    onClose: () => void;
    // F4 regression fix, item 3: see PianoRoll.tsx's identical pair — the
    // explicit switch now that SequencerDock resolves the editor once.
    viewMode?: ResolvedTrackViewMode;
    onSetViewMode?: (mode: ResolvedTrackViewMode) => void;
}

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 24;

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

const scrollStyles: React.CSSProperties = {
    flexGrow: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative',
};

export const DrumRoll: React.FC<DrumRollProps> = ({
    track,
    currentStep,
    steps,
    patternSteps,
    bpm,
    onToggleStep,
    onClearStep,
    onUpdateNote,
    onSelectNote,
    onSetDefaultNote,
    onClose,
    viewMode,
    onSetViewMode,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // What plays, and what is drawn. They differ in both directions, exactly as
    // in the roll: a track longer than the pattern has trailing columns that
    // never sound, and a note stranded past both still needs a column to be
    // seen and deleted in (SKB-010 / B5-x2).
    const effectivePattern = patternSteps ?? steps;
    const playableSteps = effectiveTrackSteps(steps, effectivePattern);
    const columns = Math.max(steps, noteExtent([track]));
    const strandedCount = outOfRangeNoteCount([track], effectivePattern);

    const { isNarrow, isCoarsePointer } = useViewport();
    const [, containerWidth] = useElementWidth<HTMLDivElement>(scrollRef);
    const stepWidth = stepWidthFor(columns, containerWidth, { min: stepWidthMinFor(isCoarsePointer) });
    usePlayheadScroll(isNarrow, scrollRef, currentStep, stepWidth);

    const paintPitch = canonicalDrumPitch(track);

    // Notes this row cannot express as "the kit piece": a track flipped to
    // Percussive can hold anything. They are still drawn, and still named
    // above the grid — a note that is inaudible in the editor and audible in
    // the export is the shape of SKB-026 and of B5-x2, and both were about a
    // note the UI simply had no place for.
    const offPitchNotes = useMemo(
        () => Array.from(new Set(track.notes.filter(n => n.note !== paintPitch).map(n => n.note))).sort((a, b) => a - b),
        [track.notes, paintPitch],
    );

    return (
        <div style={containerStyles} data-testid="drum-roll">
            <div style={toolbarStyles}>
                <span style={{ fontWeight: 'bold' }}>Drum Roll - {track.name}</span>
                {onSetDefaultNote && (
                    <label style={{ fontSize: '11px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Hit note
                        <NumberInput
                            data-testid="drum-roll-default-note"
                            value={paintPitch}
                            min={MIDI_NOTE_MIN}
                            max={MIDI_NOTE_MAX}
                            step={1}
                            quantize
                            onChange={(v) => onSetDefaultNote(track.id, v)}
                            style={{ width: '52px', backgroundColor: '#333', color: '#ccc', border: '1px solid #444', fontSize: '11px', textAlign: 'center' }}
                            title="The MIDI note new hits on this track are written at. On a fixed-pitch drum patch the number is an inert label, but it is still the address Step Properties and Export Step use."
                        />
                    </label>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {viewMode && onSetViewMode && (
                        <ViewModeToggle mode={viewMode} onChange={onSetViewMode} />
                    )}
                    <button onClick={onClose} style={{ cursor: 'pointer', padding: '5px 10px' }}>Close</button>
                </span>
            </div>

            <OutOfRangeNotice count={strandedCount} patternSteps={effectivePattern} trackSteps={steps} />

            {offPitchNotes.length > 0 && (
                <div
                    data-testid="drum-roll-offpitch-notice"
                    style={{ flex: '0 0 auto', padding: '3px 10px', fontSize: '10px', color: '#e0a030', backgroundColor: '#252526', borderBottom: '1px solid #333' }}
                >
                    This track also holds notes at {offPitchNotes.join(', ')}, which are drawn here but are not the
                    hit note ({paintPitch}). Open the Piano Roll to move them, or change the hit note above.
                </div>
            )}

            <div style={scrollStyles} ref={scrollRef} data-testid="drum-roll-scroll" onContextMenu={(e) => e.preventDefault()}>
                <div style={{ width: columns * stepWidth, minWidth: '100%' }}>
                    {/* Step header: the beat ruler, so a bar is countable. */}
                    <div style={{ height: HEADER_HEIGHT, display: 'flex', borderBottom: '1px solid #333' }}>
                        {Array.from({ length: columns }, (_, step) => (
                            <div
                                key={step}
                                style={{
                                    flex: `0 0 ${stepWidth}px`,
                                    width: stepWidth,
                                    textAlign: 'center',
                                    fontSize: '9px',
                                    lineHeight: `${HEADER_HEIGHT}px`,
                                    color: step === currentStep ? '#0f0' : (step >= playableSteps ? '#5a5a5a' : '#888'),
                                    borderRight: isBeatStart(step + 1) ? '1px solid #444' : '1px solid #2A2A2A',
                                }}
                            >
                                {isBeatStart(step) ? step : ''}
                            </div>
                        ))}
                    </div>

                    {/* The row itself, and the playhead spanning it. */}
                    <div style={{ position: 'relative' }} data-testid="drum-roll-playhead">
                        <Playhead step={currentStep} bpm={bpm} stepWidth={stepWidth} />
                        <DrumRollRow
                            track={track}
                            columns={columns}
                            playableSteps={playableSteps}
                            stepWidth={stepWidth}
                            rowHeight={ROW_HEIGHT}
                            paintPitch={paintPitch}
                            idPrefix="drum-roll"
                            trackSteps={steps}
                            patternSteps={effectivePattern}
                            onToggleStep={onToggleStep}
                            onClearStep={onClearStep}
                            onUpdateNote={onUpdateNote}
                            onSelectNote={onSelectNote}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
