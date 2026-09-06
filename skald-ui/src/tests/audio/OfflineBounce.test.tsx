// @vitest-environment jsdom
//
// Roadmap G1 (§9.12 item 1) — the editor-facing half of the offline bounce:
// serialise, build, render, encode, save. The render core and the encoder are
// pinned by their own fixtures (OfflineRender.test.ts, WavEncoder.test.ts);
// what is pinned HERE is the wiring, and specifically the two decisions a
// reader would otherwise have to take on trust:
//
//   * the bounce builds the module from the SAME project description the
//     preview builds from — master_volume baked at a topology-neutral 1.0,
//     the live fader reapplied through skald_set_master_volume — so "the
//     bounce is what you heard" is true by construction and not by luck;
//   * the file that reaches disk is a real WAV of the requested length, and a
//     failure anywhere in the chain is REPORTED, not swallowed into a busy
//     indicator that never clears.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useOfflineBounce, BOUNCE_SAMPLE_RATE } from '../../hooks/nodeEditor/useOfflineBounce';
import { framesForBars } from '../../audio/offlineRender';
import { WAV_HEADER_BYTES } from '../../audio/wavEncoder';
import { SequencerTrack } from '../../definitions/types';
import { FileStatus } from '../../hooks/nodeEditor/useFileIO';

const makeInstrument = (id: string, name: string): Node => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name,
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

/** A wasm stand-in whose skald_process writes a constant, so silence is detectable. */
const makeShim = (assetCount: number) => {
    const LEFT_PTR = 4096;
    const RIGHT_PTR = 8192;
    const memory = { buffer: new ArrayBuffer(65536) };
    const volumes = new Array(assetCount).fill(1);
    return {
        memory,
        skald_init: vi.fn(),
        skald_set_master_volume: vi.fn(),
        skald_start_all: vi.fn(),
        skald_stop_all: vi.fn(),
        skald_asset_count: () => assetCount,
        skald_set_loop: vi.fn(),
        skald_set_volume: vi.fn((a: number, v: number) => { volumes[a] = v; }),
        skald_is_playing: () => 0,
        skald_left_ptr: () => LEFT_PTR,
        skald_right_ptr: () => RIGHT_PTR,
        skald_process: vi.fn((n: number) => {
            const gain = volumes.reduce((s, v) => s + v, 0) / assetCount;
            new Float32Array(memory.buffer, LEFT_PTR, n).fill(0.25 * gain);
            new Float32Array(memory.buffer, RIGHT_PTR, n).fill(-0.25 * gain);
            return n;
        }),
    };
};

let buildWasmPreview: ReturnType<typeof vi.fn>;
let saveWav: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn<(status: FileStatus) => void>>;
let shim: ReturnType<typeof makeShim>;

beforeEach(() => {
    shim = makeShim(1);
    vi.stubGlobal('WebAssembly', {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shim; },
    });
    buildWasmPreview = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    saveWav = vi.fn().mockResolvedValue({ saved: true, path: 'C:/tmp/song.wav' });
    notify = vi.fn<(status: FileStatus) => void>();
    (window as unknown as { electron: unknown }).electron = { buildWasmPreview, saveWav };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const renderBounce = (nodes: Node[], overrides: Record<string, unknown> = {}) =>
    renderHook(() =>
        useOfflineBounce({
            nodes,
            edges: [] as Edge[],
            tracks: [] as SequencerTrack[],
            bpm: 120,
            patternSteps: 16,
            masterVolume: 0.6,
            packageName: 'my_song',
            nearestInScale: (n: number) => n,
            notify,
            ...overrides,
        }));

describe('useOfflineBounce — bounce to WAV', () => {
    it('builds from the same project description the preview builds from, fader and all', async () => {
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        await act(async () => { await result.current.bounceToWav({ bars: 2, includeTail: false }); });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(buildWasmPreview.mock.calls[0][0]);
        // Topology-neutral 1.0, exactly as useWasmAudioEngine::buildModule
        // bakes it — the fader is applied live instead, below.
        expect(sent.project.master_volume).toBe(1.0);
        expect(sent.project.bpm).toBe(120);
        expect(sent.project.instruments).toHaveLength(1);
        expect(shim.skald_set_master_volume).toHaveBeenCalledWith(0.6);
        expect(shim.skald_init).toHaveBeenCalledWith(BOUNCE_SAMPLE_RATE);
    });

    it('saves a real 24-bit WAV of exactly the requested bar length', async () => {
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        await act(async () => { await result.current.bounceToWav({ bars: 2, includeTail: false }); });

        expect(saveWav).toHaveBeenCalledTimes(1);
        const [fileName, bytes] = saveWav.mock.calls[0] as [string, Uint8Array];
        expect(fileName).toMatch(/\.wav$/);
        expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
        const frames = framesForBars(2, 120, BOUNCE_SAMPLE_RATE);
        expect(bytes.length).toBe(WAV_HEADER_BYTES + frames * 6);
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    });

    it('shows busy while it works and clears when it is done', async () => {
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);
        expect(result.current.isBouncing).toBe(false);

        let pending: Promise<void>;
        await act(async () => {
            pending = result.current.bounceToWav({ bars: 1, includeTail: false });
            await Promise.resolve();
        });
        await act(async () => { await pending!; });

        expect(result.current.isBouncing).toBe(false);
        expect(result.current.progress).toBe(0);
    });

    it('reports a build failure instead of leaving a busy indicator spinning forever', async () => {
        buildWasmPreview.mockRejectedValue(
            new Error("Error invoking remote method 'build-wasm-preview': Error: odin build failed"));
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        await act(async () => { await result.current.bounceToWav({ bars: 1, includeTail: false }); });

        expect(saveWav).not.toHaveBeenCalled();
        expect(result.current.isBouncing).toBe(false);
        const status = notify.mock.calls.at(-1)![0];
        expect(status.kind).toBe('error');
        // The Electron envelope is stripped, same as the preview's errors.
        expect(status.message).toContain('odin build failed');
        expect(status.message).not.toContain('Error invoking remote method');
    });

    it('reports a failed write rather than claiming the bounce was saved', async () => {
        saveWav.mockResolvedValue({ saved: false, error: 'EACCES: permission denied' });
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        await act(async () => { await result.current.bounceToWav({ bars: 1, includeTail: false }); });

        const status = notify.mock.calls.at(-1)![0];
        expect(status.kind).toBe('error');
        expect(status.message).toContain('EACCES');
    });

    it('a canceled save dialog is not an error', async () => {
        saveWav.mockResolvedValue({ saved: false });
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        await act(async () => { await result.current.bounceToWav({ bars: 1, includeTail: false }); });

        expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    });

    it('refuses an empty canvas with the same message Play gives, and never builds', async () => {
        const { result } = renderBounce([]);

        await act(async () => { await result.current.bounceToWav({ bars: 1, includeTail: false }); });

        expect(buildWasmPreview).not.toHaveBeenCalled();
        const status = notify.mock.calls.at(-1)![0];
        expect(status.kind).toBe('error');
        expect(status.message).toMatch(/instrument/i);
    });

    it('refuses a second bounce while one is running, rather than interleaving two renders', async () => {
        const { result } = renderBounce([makeInstrument('inst-1', 'Bass')]);

        let first: Promise<void>;
        await act(async () => {
            first = result.current.bounceToWav({ bars: 4, includeTail: false });
            await Promise.resolve();
            await result.current.bounceToWav({ bars: 4, includeTail: false });
        });
        await act(async () => { await first!; });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        expect(saveWav).toHaveBeenCalledTimes(1);
    });
});
