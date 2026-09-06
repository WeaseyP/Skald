/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/DrumRoll.tsx                         |
|                                                                              |
| Roadmap F2 (0.2 §9.2 item 1) — the percussive editor.                        |
|                                                                              |
| One row, not 128. Opening a chromatic keyboard on a kick asks the author to  |
| find one lane out of the whole MIDI space to click in, when the pitch of     |
| that lane is an inert label: a fixed-pitch oscillator ignores the played     |
| note entirely (skald-backend/core/codegen_nodes.odin::generate_oscillator_   |
| code). Which tracks get this editor is decided by trackViewMode.ts, never    |
| here.                                                                        |
|                                                                              |
| THE GENERATED CODE IS UNTOUCHED BY THIS FILE. Every gesture below writes the |
| same `NoteEvent` (step, note, velocity, duration, pLocks) the Piano Roll and |
| the Step Grid write, through the same useSequencerState mutations, and       |
| `codegen_project.odin::generate_sequencer_logic` emits `<Asset>_note_on(p,   |
| note, velocity, duration)` per event with no idea which editor authored it — |
| verified by reading it, not assumed. A patch edited here and the same patch  |
| edited in the roll produce byte-identical Odin.                              |
|                                                                              |
| It is the Piano Roll's third reader of the shared sequencer core, not a      |
| third copy of it: usePlayheadScroll, useStepPaintInteraction, useNoteDrag,   |
| Playhead.tsx, stepMetrics.ts::isBeatStart/effectiveTrackSteps/noteExtent.    |
================================================================================
*/
import React, { useCallback, useMemo, useRef } from 'react';
import { NoteEvent, SequencerTrack } from '../../definitions/types';
import { NumberInput } from '../common/NumberInput';
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
import { useNoteDrag } from '../../hooks/sequencer/useNoteDrag';
import { usePlayheadScroll } from '../../hooks/sequencer/usePlayheadScroll';
import { useStepPaintInteraction } from '../../hooks/sequencer/useStepPaintInteraction';

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

/** useStepPaintInteraction's cell key: one row, so the step alone identifies a cell. */
const cellKey = (step: number): string => String(step);

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
    // above the grid — a note that is inaudible in the editor but audible in
    // the export is the shape of SKB-026 and of B5-x2, and both were about a
    // note the UI simply had no place for.
    const offPitchNotes = useMemo(
        () => Array.from(new Set(track.notes.filter(n => n.note !== paintPitch).map(n => n.note))).sort((a, b) => a - b),
        [track.notes, paintPitch],
    );

    // hooks/sequencer/useStepPaintInteraction.ts. One button, and the mode is
    // decided by the first cell touched (the roll's policy, not the grid's
    // two-button one): a gesture that starts on empty adds all the way, one
    // that starts on a hit clears all the way.
    const hasHitAt = useCallback((key: string) => {
        const step = Number(key);
        return track.notes.some(n => n.step === step);
    }, [track.notes]);
    const addHit = useCallback((key: string) => {
        onToggleStep(track.id, Number(key), paintPitch);
    }, [onToggleStep, track.id, paintPitch]);
    const removeHits = useCallback((key: string) => {
        onClearStep(track.id, Number(key));
    }, [onClearStep, track.id]);
    const paint = useStepPaintInteraction({ hasEventAt: hasHitAt, onPaint: addHit, onErase: removeHits });

    // hooks/sequencer/useNoteDrag.ts. Velocity only, on the vertical axis,
    // with StepGrid's own scale so the same pointer movement means the same
    // change in both editors. It commits once, on release, which is what makes
    // a drag of any length one undo entry (useSequencerState::updateNote).
    const velocityValueFor = useCallback((_field: 'velocity', initialValue: number, _dx: number, deltaY: number) =>
        Math.max(0, Math.min(1, initialValue + deltaY / 100)),
    []);
    const velocityOnCommit = useCallback((trackId: string, step: number, _field: 'velocity', value: number, notePitch: number) =>
        onUpdateNote(trackId, step, { velocity: value }, notePitch),
    [onUpdateNote]);
    const velocityDrag = useNoteDrag<'velocity'>({ valueFor: velocityValueFor, onCommit: velocityOnCommit });

    const handleCellMouseDown = (e: React.MouseEvent, step: number, hasHit: boolean, isDisabled: boolean) => {
        // Right-click belongs to the hit below (selection for Step
        // Properties), not to the cell — left-click is already the toggle here
        // the way it is in the roll, so the grid's right-click-erases has no
        // job to do.
        if (e.button !== 0) return;
        e.preventDefault();

        const mode = hasHit ? 'erase' : 'paint';
        if (isDisabled) {
            // B5-x2: past the playable range nothing may be CREATED — it could
            // never sound — but a note already stranded there must stay
            // deletable where it sits. `applyOnce`, not `start`: a sweep must
            // not be allowed to cross the boundary and take cells with it.
            if (mode === 'erase') paint.applyOnce('erase', cellKey(step));
            return;
        }
        paint.start(mode, cellKey(step));
    };

    const stepArray = Array.from({ length: columns }, (_, i) => i);

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
                <span style={{ marginLeft: 'auto' }}>
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
                        {stepArray.map(step => (
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

                        <div style={{ height: ROW_HEIGHT, display: 'flex' }}>
                            {stepArray.map(step => {
                                const isDisabled = step >= playableSteps;
                                const stepNotes = track.notes
                                    .filter(n => n.step === step)
                                    .slice()
                                    .sort((a, b) => a.note - b.note);
                                const hasHit = stepNotes.length > 0;
                                const laneHeight = Math.max(6, Math.floor((ROW_HEIGHT - 8) / Math.max(1, stepNotes.length)));

                                return (
                                    <div
                                        key={step}
                                        data-testid={`drum-roll-cell-${step}`}
                                        aria-disabled={isDisabled}
                                        title={isDisabled
                                            ? `Step ${step} is past the playable range (${playableSteps} steps = min(track ${steps}, pattern ${effectivePattern})) and never sounds.${hasHit ? ' Click to delete the hit that is stranded here.' : ''}`
                                            : `Step ${step}${hasHit ? ' — click to clear, drag the bar to change velocity, right-click for Step Properties' : ` — click to add a hit at note ${paintPitch}`}`}
                                        onMouseDown={(e) => handleCellMouseDown(e, step, hasHit, isDisabled)}
                                        onMouseEnter={() => !isDisabled && paint.continueAt(cellKey(step))}
                                        style={{
                                            flex: `0 0 ${stepWidth}px`,
                                            width: stepWidth,
                                            height: ROW_HEIGHT,
                                            boxSizing: 'border-box',
                                            position: 'relative',
                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                            backgroundColor: isDisabled ? '#111' : (isBeatStart(step) ? '#242424' : '#1E1E1E'),
                                            opacity: isDisabled ? 0.4 : 1,
                                            borderRight: isBeatStart(step + 1) ? '1px solid #444' : '1px solid #2A2A2A',
                                        }}
                                    >
                                        {stepNotes.map((note, lane) => {
                                            const isDragging = velocityDrag.state !== null
                                                && velocityDrag.state.step === step
                                                && velocityDrag.state.notePitch === note.note;
                                            const velocity = isDragging ? velocityDrag.state!.currentValue : (note.velocity ?? 1);
                                            const probability = note.probability ?? 1;

                                            return (
                                                <div
                                                    key={note.note}
                                                    data-testid={`drum-roll-hit-${step}-${note.note}`}
                                                    title={`Step ${step} note ${note.note}: Vel ${Math.round(velocity * 100)}% Prob ${Math.round(probability * 100)}% Dur ${note.duration || 1}`}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        onSelectNote?.(track.id, step, note.note);
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        left: 2,
                                                        right: 2,
                                                        top: 4 + lane * laneHeight,
                                                        height: laneHeight - 2,
                                                        borderRadius: '2px',
                                                        // Velocity IS the cell's intensity: on a row with no
                                                        // pitch axis it is the only thing left to read off a
                                                        // hit at a glance.
                                                        backgroundColor: track.color || '#007acc',
                                                        opacity: (track.isMuted ? 0.2 : 1) * (0.25 + 0.75 * velocity),
                                                        outline: isDragging ? '1px solid #fff'
                                                            : (note.note === paintPitch ? 'none' : '1px dashed rgba(224,160,48,0.9)'),
                                                    }}
                                                >
                                                    {/* The velocity grip. Same split as the roll's duration
                                                        handle (E2): the hit's body keeps passing clicks
                                                        through to the cell, so left-click still clears the
                                                        step, and only this strip starts a drag. */}
                                                    <div
                                                        data-testid={`drum-roll-velocity-${step}-${note.note}`}
                                                        title="Drag up/down to change velocity"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            velocityDrag.start({
                                                                trackId: track.id,
                                                                step,
                                                                notePitch: note.note,
                                                                field: 'velocity',
                                                                initialValue: note.velocity ?? 1,
                                                                startX: e.clientX,
                                                                startY: e.clientY,
                                                            });
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: 0,
                                                            right: 0,
                                                            bottom: 0,
                                                            height: Math.max(6, Math.round((laneHeight - 2) * 0.4)),
                                                            cursor: 'ns-resize',
                                                            backgroundColor: 'rgba(0,0,0,0.25)',
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
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
