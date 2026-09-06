import React from 'react';
import { NumberInput } from '../common/NumberInput';
import { BPM_MIN, BPM_MAX, clampBpm } from '../../definitions/bpm';
import { MAX_PATTERN_STEPS, clampPatternSteps } from './stepMetrics';
import { useViewport } from '../../hooks/useViewport';

interface SequencerToolbarProps {
    isPlaying: boolean;
    // True while a preview build (Play or a hot-swap rebuild) is actually
    // running. `-o:none` made rebuilds fast, which made a slow SUCCESSFUL
    // one indistinguishable from nothing happening — this pip is the fix
    // (roadmap A7 item 3, second half).
    isBuilding: boolean;
    bpm: number;
    isLooping: boolean;
    onPlay: () => void;
    onStop: () => void;
    onBpmChange: (bpm: number) => void;
    patternSteps: number;
    onPatternStepsChange: (steps: number) => void;
    onLoopToggle: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    // F3: opens the kit workspace. Absent (or undefined) hides the button —
    // the dock only supplies it once two or more tracks resolve percussive,
    // because a "kit" of one row is a worse Drum Roll, not a feature.
    onOpenKit?: () => void;
}

const toolbarStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '40px',
    backgroundColor: '#333',
    borderBottom: '1px solid #1A1A1A',
    padding: '0 10px',
    color: '#eee',
    fontFamily: 'sans-serif',
    fontSize: '12px',
    gap: '15px'
};

const buttonStyles: React.CSSProperties = {
    backgroundColor: '#444',
    border: 'none',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    textTransform: 'uppercase',
    fontWeight: 600
};

const activeButtonStyle: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: '#007acc',
};

const inputStyles: React.CSSProperties = {
    backgroundColor: '#222',
    border: '1px solid #444',
    color: 'white',
    width: '50px',
    padding: '2px 5px',
    borderRadius: '3px',
    textAlign: 'center'
};

import { useScale, NOTES, SCALES, NoteName, ScaleName } from '../../contexts/ScaleContext';

export const SequencerToolbar: React.FC<SequencerToolbarProps> = ({
    isPlaying,
    isBuilding,
    bpm,
    isLooping,
    onPlay,
    onStop,
    onBpmChange,
    patternSteps,
    onPatternStepsChange,
    onLoopToggle,
    isCollapsed,
    onToggleCollapse,
    onOpenKit
}) => {
    const { rootNote, setRootNote, scaleName, setScaleName } = useScale();
    const { isNarrow } = useViewport();

    // E13: one 40px row of controls with a fixed 15px gap and no wrap. At
    // 1920px it has room to spare; at 448px the Key/Scale selects and Loop sit
    // outside the window with no scrollbar to reach them — clipped away, not
    // merely cramped. Narrow screens scroll the row instead; the desktop is
    // left alone, where there would be nothing to scroll anyway.
    const layout: React.CSSProperties = isNarrow
        ? { ...toolbarStyles, overflowX: 'auto', overflowY: 'hidden', gap: '10px', flexShrink: 0 }
        : toolbarStyles;

    return (
        <div style={layout} data-testid="transport-toolbar">
            <button
                style={buttonStyles}
                onClick={onToggleCollapse}
                title={isCollapsed ? "Expand" : "Collapse"}
            >
                {isCollapsed ? "▲" : "▼"}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button
                    style={isPlaying ? activeButtonStyle : buttonStyles}
                    onClick={onPlay}
                >
                    Play
                </button>
                <button style={buttonStyles} onClick={onStop}>Stop</button>
                {isBuilding && (
                    // Visually quiet on purpose — a status pip, not a modal.
                    // Rebuilds are fast now (-o:none, ~157ms measured), but a
                    // slow one used to be silent and indistinguishable from
                    // nothing happening at all.
                    <span
                        data-testid="build-status-pip"
                        title="Rebuilding the audio preview…"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '10px',
                            color: '#e0a030',
                        }}
                    >
                        <span
                            style={{
                                display: 'inline-block',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: '#e0a030',
                            }}
                        />
                        Building…
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>BPM:</label>
                <NumberInput
                    value={bpm}
                    onChange={(val) => onBpmChange(clampBpm(val))}
                    style={inputStyles}
                    min={BPM_MIN}
                    max={BPM_MAX}
                    title="Project tempo — shared by the preview engine, sequencer and exported code (same field as the sidebar BPM)"
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>Steps:</label>
                <NumberInput
                    value={patternSteps}
                    onChange={(val) => onPatternStepsChange(clampPatternSteps(val))}
                    style={inputStyles}
                    min={1}
                    max={MAX_PATTERN_STEPS}
                    title={`Global pattern length in 16th-note steps, 1–${MAX_PATTERN_STEPS} (16 = one bar). Long patterns shrink the grid and scroll.`}
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>Key:</label>
                <select
                    value={rootNote}
                    onChange={(e) => setRootNote(e.target.value as NoteName)}
                    style={
                        {
                            backgroundColor: '#222',
                            color: 'white',
                            border: '1px solid #444',
                            borderRadius: '3px',
                            padding: '2px'
                        }
                    }
                >
                    {NOTES.map(note => (
                        <option key={note} value={note}>{note}</option>
                    ))}
                </select>
                <select
                    value={scaleName}
                    onChange={(e) => setScaleName(e.target.value as ScaleName)}
                    style={
                        {
                            backgroundColor: '#222',
                            color: 'white',
                            border: '1px solid #444',
                            borderRadius: '3px',
                            padding: '2px',
                            width: '80px'
                        }
                    }
                >
                    {Object.keys(SCALES).map(scale => (
                        <option key={scale} value={scale}>{scale}</option>
                    ))}
                </select>
            </div>

            <button
                style={isLooping ? activeButtonStyle : buttonStyles}
                onClick={onLoopToggle}
            >
                Loop
            </button>

            {onOpenKit && (
                <button
                    data-testid="open-drum-kit"
                    style={buttonStyles}
                    onClick={onOpenKit}
                    title="Edit every percussive track as one grid — each row stays its own Instrument and its own exported asset"
                >
                    Kit
                </button>
            )}

            <div style={{ flexGrow: 1 }} />

            <div style={{ opacity: 0.5 }}>
                Master Transport
            </div>
        </div>
    );
};
