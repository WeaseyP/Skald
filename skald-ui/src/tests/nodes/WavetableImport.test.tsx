// @vitest-environment jsdom
// Roadmap G4 (§9.20) — the Wavetable node's Import/Clear controls
// (NodeParameterControls.tsx's WavetableImportSection). Import is meant to be
// ONE document mutation: a single `onChangeMany` call carrying
// useCustomTable/customTable/customTableName together, so pushHistory
// (useGraphState.ts's updateNodeData, which every onChangeMany caller in this
// app ultimately reaches) records ONE undo entry for the whole action — never
// three separate field writes a user would have to undo one at a time.
import React from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { encodeWav24 } from '../../audio/wavEncoder';
import { base64ToTable } from '../../audio/wavReader';

const renderWavetable = (data: Record<string, unknown>) => {
    const onChange = vi.fn();
    const onChangeMany = vi.fn();
    const result = render(
        <NodeParameterControls
            node={{ id: 'wt-1', type: 'wavetable', position: { x: 0, y: 0 }, data }}
            onChange={onChange}
            onChangeMany={onChangeMany}
            renderControlWrapper={(paramKey, label, control) => (
                <section key={paramKey} data-param={paramKey} aria-label={label}>{control}</section>
            )}
        />
    );
    return { ...result, onChange, onChangeMany };
};

const originalElectron = (window as unknown as { electron?: unknown }).electron;

beforeEach(() => {
    (window as unknown as { electron?: unknown }).electron = undefined;
});

afterEach(() => {
    (window as unknown as { electron?: unknown }).electron = originalElectron;
    cleanup();
});

// A real, decodable one-cycle WAV (reuses G1's trusted 24-bit encoder), so
// this exercises the actual decodeWav -> singleCycleTable -> tableToBase64
// pipeline end to end, not a stub.
const sampleWavBytes = (): Uint8Array => {
    const n = 64;
    const left = new Float32Array(n);
    for (let i = 0; i < n; i++) left[i] = Math.sin((i / n) * 2 * Math.PI);
    return encodeWav24(left, new Float32Array(n), 48000);
};

describe('Wavetable Import — success path', () => {
    it('decodes the picked .wav and writes useCustomTable/customTable/customTableName in ONE onChangeMany call', async () => {
        const importWav = vi.fn().mockResolvedValue({ name: 'MyCycle.wav', bytes: sampleWavBytes() });
        (window as unknown as { electron: unknown }).electron = { importWav };
        const { onChangeMany } = renderWavetable({});

        fireEvent.click(screen.getByTestId('wavetable-import'));

        await waitFor(() => expect(onChangeMany).toHaveBeenCalledTimes(1));
        const changes = onChangeMany.mock.calls[0][0];
        expect(changes.useCustomTable).toBe(true);
        expect(changes.customTableName).toBe('MyCycle'); // .wav extension stripped
        expect(typeof changes.customTable).toBe('string');

        // The stored base64 decodes to a real 2048-sample table shaped like
        // the sine cycle handed in — not garbage and not silence.
        const table = base64ToTable(changes.customTable as string);
        expect(table.length).toBe(2048);
        let peak = 0;
        for (const v of table) peak = Math.max(peak, Math.abs(v));
        expect(peak).toBeCloseTo(1, 1);
    });

    it('a canceled dialog (no bytes, no error) writes nothing', async () => {
        const importWav = vi.fn().mockResolvedValue({ name: null, bytes: null });
        (window as unknown as { electron: unknown }).electron = { importWav };
        const { onChangeMany } = renderWavetable({});

        fireEvent.click(screen.getByTestId('wavetable-import'));
        await waitFor(() => expect(importWav).toHaveBeenCalledTimes(1));

        expect(onChangeMany).not.toHaveBeenCalled();
        expect(screen.queryByTestId('wavetable-import-error')).toBeNull();
    });
});

describe('Wavetable Import — failure paths', () => {
    it('surfaces a read error from the main process without touching node data', async () => {
        const importWav = vi.fn().mockResolvedValue({ name: null, bytes: null, error: 'disk on fire' });
        (window as unknown as { electron: unknown }).electron = { importWav };
        const { onChangeMany } = renderWavetable({});

        fireEvent.click(screen.getByTestId('wavetable-import'));

        await waitFor(() => expect(screen.getByTestId('wavetable-import-error').textContent).toContain('disk on fire'));
        expect(onChangeMany).not.toHaveBeenCalled();
    });

    it('surfaces a decode failure (not a valid WAV) instead of writing a broken customTable', async () => {
        const importWav = vi.fn().mockResolvedValue({ name: 'not-a-wav.wav', bytes: new Uint8Array([1, 2, 3, 4]) });
        (window as unknown as { electron: unknown }).electron = { importWav };
        const { onChangeMany } = renderWavetable({});

        fireEvent.click(screen.getByTestId('wavetable-import'));

        await waitFor(() => expect(screen.getByTestId('wavetable-import-error')).toBeTruthy());
        expect(onChangeMany).not.toHaveBeenCalled();
    });

    it('without window.electron.importWav at all (a build that omitted it), shows a message instead of throwing', async () => {
        const { onChangeMany } = renderWavetable({});
        fireEvent.click(screen.getByTestId('wavetable-import'));
        await waitFor(() => expect(screen.getByTestId('wavetable-import-error')).toBeTruthy());
        expect(onChangeMany).not.toHaveBeenCalled();
    });
});

describe('Wavetable Import — Clear', () => {
    it('is not offered when no table is stored', () => {
        renderWavetable({});
        expect(screen.queryByTestId('wavetable-clear')).toBeNull();
    });

    it('clears useCustomTable/customTable/customTableName in ONE call, returning to the analytic shapes', () => {
        const { onChangeMany } = renderWavetable({ useCustomTable: true, customTable: 'AAAA', customTableName: 'Foo' });
        fireEvent.click(screen.getByTestId('wavetable-clear'));
        expect(onChangeMany).toHaveBeenCalledTimes(1);
        expect(onChangeMany).toHaveBeenCalledWith({ useCustomTable: false, customTable: undefined, customTableName: undefined });
    });

    it('shows the stored table name and a waveform preview canvas', () => {
        renderWavetable({ useCustomTable: true, customTable: 'AAAA', customTableName: 'Foo' });
        expect(screen.getByTestId('wavetable-table-name').textContent).toContain('Foo');
        expect(screen.getByTestId('wavetable-preview')).toBeTruthy();
    });
});

describe('Wavetable — Use Imported Table checkbox', () => {
    it('is a single-field onChange, not onChangeMany — it does not itself touch customTable', () => {
        const { onChange, onChangeMany } = renderWavetable({});
        fireEvent.click(screen.getByLabelText('Use Imported Table'));
        expect(onChange).toHaveBeenCalledWith('useCustomTable', true);
        expect(onChangeMany).not.toHaveBeenCalled();
    });
});
