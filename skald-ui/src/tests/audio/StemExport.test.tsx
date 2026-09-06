// @vitest-environment jsdom
//
// Roadmap G2 (§9.12 item 2) — per-instrument stems plus the master bounce.
//
// A stem that is not actually isolated is worse than no stem at all: it looks
// right in a file browser, drops into a DAW, and quietly carries the rest of
// the mix under the part you were trying to solo. So the assertion that
// matters here is arithmetic on the rendered samples, not on the call list —
// each instrument contributes a distinguishable DC level, and a stem is
// required to read back as exactly its own instrument's contribution and
// nothing else.
//
// The other decision pinned here is that mute and solo are cleared FOR THE
// STEM BUILD ONLY. Mute/solo is baked at codegen time (a muted asset's
// `_process` is not even called from skald_process), so a stem build that
// honoured them would hand the user a set of files with silent holes in it
// where the parts they had muted while working should be. Clearing them is a
// serialiser option — the user's tracks are never touched, and nothing here
// goes near pushHistory.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useOfflineBounce, BOUNCE_SAMPLE_RATE } from '../../hooks/nodeEditor/useOfflineBounce';
import { WAV_HEADER_BYTES } from '../../audio/wavEncoder';
import { FileStatus } from '../../hooks/nodeEditor/useFileIO';
import { SequencerTrack } from '../../definitions/types';

const makeInstrument = (id: string, name: string, volume = 1.0): Node => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name,
        volume,
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: `${id}-osc`, type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
                { id: `${id}-out`, type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: `${id}-osc`, from_port: 'output', to_node: `${id}-out`, to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const makeTrack = (id: string, target: string, isMuted = false): SequencerTrack => ({
    id,
    name: `Track ${id}`,
    targetNodeId: target,
    notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }],
    isMuted,
    isSolo: false,
} as unknown as SequencerTrack);

/**
 * Two assets, each contributing a constant of its own. `skald_process` sums
 * `contribution[a] * volume[a]` exactly the way the generated shim sums each
 * asset's `_process` return, so a stem that leaked its neighbour would show up
 * as the wrong DC level in the decoded file.
 */
const CONTRIBUTION = [0.5, -0.25];

const makeShim = (authoredVolumes: number[]) => {
    const LEFT_PTR = 4096;
    const RIGHT_PTR = 8192;
    const memory = { buffer: new ArrayBuffer(65536) };
    let volumes = [...authoredVolumes];
    return {
        memory,
        // A fresh instance re-bakes each asset's authored volume, exactly as
        // the generated `<Asset>_init` does (`p.volume = <authored>`), so a
        // pass that sets no volumes renders the mix as authored.
        skald_init: vi.fn(() => { volumes = [...authoredVolumes]; }),
        skald_set_master_volume: vi.fn(),
        skald_start_all: vi.fn(),
        skald_stop_all: vi.fn(),
        skald_asset_count: () => authoredVolumes.length,
        skald_set_loop: vi.fn(),
        skald_set_volume: vi.fn((a: number, v: number) => { volumes[a] = v; }),
        skald_is_playing: () => 0,
        skald_left_ptr: () => LEFT_PTR,
        skald_right_ptr: () => RIGHT_PTR,
        skald_process: vi.fn((n: number) => {
            let sum = 0;
            for (let a = 0; a < authoredVolumes.length; a++) sum += CONTRIBUTION[a] * volumes[a];
            new Float32Array(memory.buffer, LEFT_PTR, n).fill(sum);
            new Float32Array(memory.buffer, RIGHT_PTR, n).fill(sum);
            return n;
        }),
    };
};

/** Read the first frame's left channel back out of an encoded WAV. */
const firstSample = (wav: Uint8Array): number => {
    const off = WAV_HEADER_BYTES;
    const raw = wav[off] | (wav[off + 1] << 8) | (wav[off + 2] << 16);
    return (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388607;
};

/** Root-mean-square of a whole encoded stem's left channel. */
const rms = (wav: Uint8Array): number => {
    const frames = (wav.length - WAV_HEADER_BYTES) / 6;
    let sum = 0;
    for (let i = 0; i < frames; i++) {
        const off = WAV_HEADER_BYTES + i * 6;
        const raw = wav[off] | (wav[off + 1] << 8) | (wav[off + 2] << 16);
        const v = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388607;
        sum += v * v;
    }
    return Math.sqrt(sum / Math.max(1, frames));
};

let buildWasmPreview: ReturnType<typeof vi.fn>;
let saveWavStems: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn<(status: FileStatus) => void>>;
let shim: ReturnType<typeof makeShim>;

const setupShim = (authoredVolumes: number[]) => {
    shim = makeShim(authoredVolumes);
    vi.stubGlobal('WebAssembly', {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shim; },
    });
};

beforeEach(() => {
    setupShim([1, 1]);
    buildWasmPreview = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    saveWavStems = vi.fn().mockResolvedValue({ saved: true, path: 'C:/tmp/stems' });
    notify = vi.fn<(status: FileStatus) => void>();
    (window as unknown as { electron: unknown }).electron = { buildWasmPreview, saveWavStems };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const renderBounce = (nodes: Node[], tracks: SequencerTrack[] = []) =>
    renderHook(() =>
        useOfflineBounce({
            nodes,
            edges: [] as Edge[],
            tracks,
            bpm: 120,
            patternSteps: 16,
            masterVolume: 1.0,
            packageName: 'my_song',
            nearestInScale: (n: number) => n,
            notify,
        }));

const twoInstruments = () => [makeInstrument('a-lead', 'Lead'), makeInstrument('b-bass', 'Bass')];

describe('useOfflineBounce — stem export', () => {
    it('writes one stem per instrument plus the master, named after the assets', async () => {
        const { result } = renderBounce(twoInstruments());

        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });

        expect(saveWavStems).toHaveBeenCalledTimes(1);
        const files = saveWavStems.mock.calls[0][0] as { name: string; bytes: Uint8Array }[];
        expect(files.map((f) => f.name)).toEqual(['Lead.wav', 'Bass.wav', 'master.wav']);
        // One module build for all N+1 passes: the passes differ only in the
        // runtime volumes they set, so rebuilding per stem would be N extra
        // Odin compiles for no change in the emitted code.
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
    });

    it('a stem carries its own instrument and nothing else', async () => {
        // Lead contributes +0.5, Bass -0.25, so a leak reads as the wrong
        // level rather than as "still roughly right".
        const { result } = renderBounce(twoInstruments());

        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });

        const files = saveWavStems.mock.calls[0][0] as { name: string; bytes: Uint8Array }[];
        const byName = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
        expect(firstSample(byName['Lead.wav'])).toBeCloseTo(0.5, 4);
        expect(firstSample(byName['Bass.wav'])).toBeCloseTo(-0.25, 4);
        expect(firstSample(byName['master.wav'])).toBeCloseTo(0.25, 4);
    });

    it('an instrument silenced by its own authored volume produces a near-silent stem, not a leak of the others', async () => {
        setupShim([0.001, 1]);
        const { result } = renderBounce([
            makeInstrument('a-lead', 'Lead', 0.001),
            makeInstrument('b-bass', 'Bass'),
        ]);

        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });

        const files = saveWavStems.mock.calls[0][0] as { name: string; bytes: Uint8Array }[];
        const byName = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
        // Near-zero, and specifically NOT 0.25 (the Bass's contribution).
        expect(rms(byName['Lead.wav'])).toBeLessThan(0.01);
        expect(rms(byName['Bass.wav'])).toBeGreaterThan(0.2);
    });

    it('an instrument muted in the editor still gets a stem, because mute is cleared for the stem build only', async () => {
        const nodes = twoInstruments();
        const tracks = [makeTrack('t1', 'a-lead', true), makeTrack('t2', 'b-bass', false)];
        const { result } = renderBounce(nodes, tracks);

        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });

        const sent = JSON.parse(buildWasmPreview.mock.calls[0][0]);
        expect(sent.project.instruments.map((i: { mute: boolean }) => i.mute)).toEqual([false, false]);
        expect(sent.project.instruments.map((i: { solo: boolean }) => i.solo)).toEqual([false, false]);
        const files = saveWavStems.mock.calls[0][0] as { name: string }[];
        expect(files.map((f) => f.name)).toContain('Lead.wav');
        // And the user's own track state is untouched — a stem export is not
        // an edit, so nothing may reach the document or the history.
        expect(tracks[0].isMuted).toBe(true);
    });

    it('gives two instruments of the same name distinct file names instead of overwriting one with the other', async () => {
        const { result } = renderBounce([
            makeInstrument('a-one', 'Pad'),
            makeInstrument('b-two', 'Pad'),
        ]);

        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });

        const files = saveWavStems.mock.calls[0][0] as { name: string }[];
        expect(new Set(files.map((f) => f.name)).size).toBe(files.length);
    });

    it('reports a folder the user canceled as no error, and a write failure as one', async () => {
        saveWavStems.mockResolvedValue({ saved: false });
        const { result } = renderBounce(twoInstruments());
        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });
        expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));

        saveWavStems.mockResolvedValue({ saved: false, error: 'ENOSPC: no space left on device' });
        await act(async () => { await result.current.exportStems({ bars: 1, includeTail: false }); });
        expect(notify.mock.calls.at(-1)![0].kind).toBe('error');
        expect(notify.mock.calls.at(-1)![0].message).toContain('ENOSPC');
    });

    it('renders every stem at the same length and sample rate as the master', async () => {
        const { result } = renderBounce(twoInstruments());

        await act(async () => { await result.current.exportStems({ bars: 2, includeTail: false }); });

        const files = saveWavStems.mock.calls[0][0] as { bytes: Uint8Array }[];
        const lengths = new Set(files.map((f) => f.bytes.length));
        expect(lengths.size).toBe(1);
        expect(shim.skald_init).toHaveBeenCalledWith(BOUNCE_SAMPLE_RATE);
    });
});
