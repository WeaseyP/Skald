// @vitest-environment jsdom
/*
================================================================================
| Tests for BUG-BPM-SETUP-UX Phase C fixes:                                    |
|  1. clampBpm — every BPM edit control goes through one guarded path          |
|     (the sidebar's raw parseInt used to push NaN into project state).        |
|  2. syncRateToSeconds — UI mirror of the backend's bpm_sync_seconds_expr.    |
|  3. BpmSyncControl and the node cards share SYNC_RATE_OPTIONS (two           |
|     different lists over the same stored syncRate rendered as blank).        |
|  4. Sidebar BPM input never emits NaN and clamps to [BPM_MIN, BPM_MAX].      |
|  5. NodeParameterControls annotates synced rates with the effective time     |
|     at the project tempo (visible BPM-sync indicator).                       |
================================================================================
*/
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BPM_DEFAULT, BPM_MAX, BPM_MIN, SYNC_RATE_OPTIONS, clampBpm, syncRateToSeconds,
} from '../../definitions/bpm';
import { BpmSyncControl } from '../../components/controls/BpmSyncControl';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import Sidebar from '../../components/Sidebar';

afterEach(cleanup);

describe('clampBpm', () => {
    it('passes through in-range values untouched', () => {
        expect(clampBpm(120)).toBe(120);
        expect(clampBpm(BPM_MIN)).toBe(BPM_MIN);
        expect(clampBpm(BPM_MAX)).toBe(BPM_MAX);
    });

    it('clamps out-of-range values to the shared bounds', () => {
        expect(clampBpm(1)).toBe(BPM_MIN);
        expect(clampBpm(100000)).toBe(BPM_MAX);
    });

    it('never returns NaN — non-finite input falls back to the default', () => {
        expect(clampBpm(NaN)).toBe(BPM_DEFAULT);
        expect(clampBpm(Infinity)).toBe(BPM_DEFAULT);
        expect(clampBpm(-Infinity)).toBe(BPM_DEFAULT);
    });
});

describe('syncRateToSeconds (mirror of backend bpm_sync_seconds_expr)', () => {
    it('computes straight divisions: whole note = 4 beats', () => {
        expect(syncRateToSeconds('1/4', 120)).toBeCloseTo(0.5, 9);   // one beat
        expect(syncRateToSeconds('1/1', 120)).toBeCloseTo(2.0, 9);   // whole note
        expect(syncRateToSeconds('1/8', 120)).toBeCloseTo(0.25, 9);
        expect(syncRateToSeconds('1/64', 120)).toBeCloseTo(0.03125, 9);
    });

    it('applies the 2/3 triplet factor for trailing t', () => {
        expect(syncRateToSeconds('1/8t', 120)).toBeCloseTo(0.25 * (2 / 3), 9);
        expect(syncRateToSeconds('1/4t', 90)).toBeCloseTo((60 / 90) * (2 / 3), 9);
    });

    it('scales inversely with tempo', () => {
        expect(syncRateToSeconds('1/4', 60)).toBeCloseTo(1.0, 9);
        expect(syncRateToSeconds('1/4', 240)).toBeCloseTo(0.25, 9);
    });
});

describe('sync-rate option list is shared between panel and node cards', () => {
    it('BpmSyncControl renders exactly SYNC_RATE_OPTIONS', () => {
        render(<BpmSyncControl value="1/4" onChange={() => undefined} />);
        const options = screen.getAllByRole('option').map(o => (o as HTMLOptionElement).value);
        expect(options).toEqual(SYNC_RATE_OPTIONS);
    });

    it('covers every rate the old node-card list offered (no stored value orphaned)', () => {
        const legacyNodeCardRates = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4t', '1/8t', '1/16t'];
        for (const rate of legacyNodeCardRates) {
            expect(SYNC_RATE_OPTIONS).toContain(rate);
        }
    });
});

describe('Sidebar BPM input', () => {
    const renderSidebar = (onBpmChange: (bpm: number) => void, bpm = 120) => {
        const noop = () => undefined;
        return render(
            <Sidebar
                onGenerate={noop}
                onPlay={noop}
                onStop={noop}
                isPlaying={false}
                onSave={noop}
                onLoad={noop}
                onImport={noop}
                onCreateInstrument={noop}
                onCreateGroup={noop}
                canCreateInstrument={false}
                bpm={bpm}
                onBpmChange={onBpmChange}
                isLooping={false}
                onLoopToggle={noop}
                onExplodeInstrument={noop}
                canExplodeInstrument={false}
                packageName="generated_audio"
                onPackageNameChange={noop}
                outputPath=""
                onSelectOutputPath={noop}
                onUndo={noop}
                onRedo={noop}
                canUndo={false}
                canRedo={false}
                undoDepth={0}
                redoDepth={0}
                undoLabel={null}
                redoLabel={null}
            />
        );
    };

    const bpmInput = () => screen.getByLabelText('BPM') as HTMLInputElement;

    it('never propagates NaN when the field is cleared (the old parseInt path did)', () => {
        const onBpmChange = vi.fn();
        renderSidebar(onBpmChange);
        fireEvent.change(bpmInput(), { target: { value: '' } });
        fireEvent.blur(bpmInput());
        for (const call of onBpmChange.mock.calls) {
            expect(Number.isFinite(call[0])).toBe(true);
        }
        // Blur with an empty field reverts to the last valid value — no write.
        expect(bpmInput().value).toBe('120');
    });

    it('clamps typed values into the shared range on commit', () => {
        const onBpmChange = vi.fn();
        renderSidebar(onBpmChange);
        fireEvent.change(bpmInput(), { target: { value: '500' } });
        fireEvent.blur(bpmInput());
        expect(onBpmChange).toHaveBeenLastCalledWith(BPM_MAX);

        fireEvent.change(bpmInput(), { target: { value: '3' } });
        fireEvent.blur(bpmInput());
        expect(onBpmChange).toHaveBeenLastCalledWith(BPM_MIN);
    });

    it('passes normal edits through unclamped', () => {
        const onBpmChange = vi.fn();
        renderSidebar(onBpmChange);
        fireEvent.change(bpmInput(), { target: { value: '140' } });
        expect(onBpmChange).toHaveBeenLastCalledWith(140);
    });
});

describe('NodeParameterControls sync-time annotation', () => {
    const wrapper = (paramKey: string, label: string, control: React.ReactNode) => (
        <label key={paramKey}>{label}{control}</label>
    );

    const lfoNode = {
        id: 'lfo-1',
        type: 'lfo',
        position: { x: 0, y: 0 },
        data: { waveform: 'Sine', frequency: 5, amplitude: 1, bpmSync: true, syncRate: '1/4' },
    };

    it('shows the effective time at the project tempo when bpm is provided', () => {
        render(
            <NodeParameterControls
                node={lfoNode}
                onChange={() => undefined}
                renderControlWrapper={wrapper}
                bpm={120}
            />
        );
        expect(screen.getByTestId('sync-time-hint').textContent).toBe('1/4 at 120 BPM = 0.500 s');
    });

    it('omits the annotation when no bpm is passed (isolated editors)', () => {
        render(
            <NodeParameterControls
                node={lfoNode}
                onChange={() => undefined}
                renderControlWrapper={wrapper}
            />
        );
        expect(screen.queryByTestId('sync-time-hint')).toBeNull();
    });
});
