// @vitest-environment jsdom
//
// Roadmap E5 (§9.9) — DC blocker + brickwall limiter hardening. The backend
// half (skald-backend/core/codegen_project.odin) flushes a NaN/Inf sample to
// silence and counts it, at the per-asset stage AND the master-bus backstop
// (skald_get_nonfinite_count / skald_get_asset_nonfinite_count). This fixture
// proves the FRONTEND half: the worklet polls those exports once per
// skald_process call and posts a 'nonfinite' message only when a count
// actually moves (skald_process runs 300+ times/sec — a message on every call
// would flood the port for no reason once the count stops changing), and
// useWasmAudioEngine's meterAnalysers.nonfiniteCounts ref (the same "poll a
// ref every rAF tick" path PeakMeter already uses for the audio buffers, not
// React state) picks it up.
//
// Drives the REAL worklet source (skaldWasmProcessorString) against a
// wasm-shim stand-in, same technique as MasterVolumeLive.test.tsx — this is
// the only way to prove the actual emitted JS (not a mock of it) behaves.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';
import { SequencerTrack } from '../../definitions/types';

const NAME_BUF_PTR = 1024;

// Mirrors the generated shim's exports surface closely enough to exercise
// process()'s polling: skald_get_nonfinite_count/skald_get_asset_nonfinite_count
// read live closure state a test can bump, standing in for the backend
// actually flushing a bad sample mid-render.
const makeShim = (assetCount = 1) => {
    const memory = { buffer: new ArrayBuffer(65536) };
    let total = 0;
    let perAsset = new Array(assetCount).fill(0);
    const exports = {
        memory,
        skald_init: vi.fn(() => { total = 0; perAsset = new Array(assetCount).fill(0); }),
        skald_start_all: vi.fn(),
        skald_stop_all: vi.fn(),
        skald_asset_count: () => assetCount,
        skald_set_loop: vi.fn(),
        skald_is_playing: () => 1,
        skald_get_step: () => 0,
        skald_get_step_wait: () => 0,
        skald_seek: vi.fn(),
        skald_left_ptr: () => 4096,
        skald_right_ptr: () => 8192,
        skald_name_buf_ptr: () => NAME_BUF_PTR,
        skald_process: vi.fn(),
        skald_note_on: vi.fn(),
        skald_note_off: vi.fn(),
        skald_trigger: vi.fn(),
        skald_set_param: vi.fn(() => 1),
        skald_set_master_volume: vi.fn(),
        skald_get_nonfinite_count: () => total,
        skald_get_asset_nonfinite_count: (a: number) => perAsset[a] ?? 0,
    };
    return {
        exports,
        setTotal: (n: number) => { total = n; },
        setAsset: (a: number, n: number) => { perAsset[a] = n; },
    };
};

// Evaluate the REAL worklet source with the worklet globals stubbed and
// WebAssembly shadowed, same technique as MasterVolumeLive.test.tsx.
const instantiateWorkletProcessor = (
    processorOptions: Record<string, unknown>,
    shimExports: Record<string, unknown>
) => {
    let captured: (new (options: unknown) => any) | null = null;
    class FakeAudioWorkletProcessor {
        port: { onmessage: ((e: { data: unknown }) => void) | null; onmessageerror: unknown; postMessage: (m: unknown) => void } = {
            onmessage: null,
            onmessageerror: null,
            postMessage: () => undefined,
        };
    }
    const registerProcessor = (_name: string, cls: new (options: unknown) => any) => {
        captured = cls;
    };
    const FakeWebAssembly = {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shimExports; },
    };
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'WebAssembly', skaldWasmProcessorString)(
        FakeAudioWorkletProcessor,
        registerProcessor,
        48000,
        FakeWebAssembly
    );
    expect(captured).not.toBeNull();
    return new captured!({ processorOptions });
};

let activeShim: ReturnType<typeof makeShim> | null = null;
const createdNodes: EndToEndWorkletNode[] = [];

class EndToEndWorkletNode {
    port: {
        onmessage: ((e: { data: unknown }) => void) | null;
        onmessageerror: unknown;
        postMessage: (m: unknown) => void;
    };
    processor: any;
    connect = vi.fn();

    constructor(_ctx: unknown, _name: string, opts: { processorOptions: Record<string, unknown> }) {
        if (!activeShim) throw new Error('test forgot to set activeShim');
        this.processor = instantiateWorkletProcessor(opts.processorOptions, activeShim.exports);
        this.port = {
            onmessage: null,
            onmessageerror: null,
            postMessage: (m: unknown) => { this.processor.port.onmessage?.({ data: m }); },
        };
        this.processor.port.postMessage = (m: unknown) => { this.port.onmessage?.({ data: m }); };
        createdNodes.push(this);
    }
}

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
    createChannelSplitter = vi.fn(() => ({ connect: vi.fn() }));
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
    createdNodes.length = 0;
    activeShim = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', EndToEndWorkletNode);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (window as unknown as { electron: unknown }).electron = {
        buildWasmPreview: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const makeInstrument = (): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const noopStep = () => undefined;
const identityScale = (n: number) => n;

const startEngine = async (assetCount = 1) => {
    activeShim = makeShim(assetCount);
    const view = renderHook(
        ({ n }: { n: Node[] }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, [] as SequencerTrack[], noopStep, 16, identityScale, 1.0),
        { initialProps: { n: [makeInstrument()] } }
    );
    await act(async () => { await view.result.current.handlePlay(); });
    expect(view.result.current.isPlaying).toBe(true);
    expect(createdNodes).toHaveLength(1);
    return view;
};

// Drive one audio-thread render block by hand — nothing calls process() in
// this jsdom test, unlike a real AudioWorkletNode's audio thread.
const runOneBlock = (node: EndToEndWorkletNode, n = 128) => {
    node.processor.process([], [[new Float32Array(n), new Float32Array(n)]]);
};

describe('E5 — non-finite flush count reaches the engine (real worklet source)', () => {
    it('posts no "nonfinite" message while the counts have not moved', async () => {
        const { result } = await startEngine();
        const node = createdNodes[0];

        runOneBlock(node);

        // Still the reset-on-Play default — no message moved it.
        expect(result.current.meterAnalysers?.nonfiniteCounts?.current).toEqual({ total: 0, perAsset: [] });
    });

    it('a flushed NaN/Inf sample updates the engine ref with the new total and per-asset counts', async () => {
        const { result } = await startEngine();
        const node = createdNodes[0];

        // Simulate the backend flushing one bad sample on this asset.
        activeShim!.setTotal(1);
        activeShim!.setAsset(0, 1);
        runOneBlock(node);

        expect(result.current.meterAnalysers?.nonfiniteCounts?.current).toEqual({ total: 1, perAsset: [1] });
    });

    it('does not re-post once the counts stop changing (no port flood)', async () => {
        await startEngine();
        const node = createdNodes[0];
        activeShim!.setTotal(1);
        activeShim!.setAsset(0, 1);
        runOneBlock(node);

        const spy = vi.fn();
        node.port.onmessage = (e) => spy(e.data);
        runOneBlock(node); // counts unchanged this time
        const nonfiniteMsgs = spy.mock.calls.map((c) => c[0]).filter((m: { type: string }) => m.type === 'nonfinite');
        expect(nonfiniteMsgs).toHaveLength(0);
    });

    it('attributes counts per asset — a two-instrument project blames the right one', async () => {
        const { result } = await startEngine(2);
        const node = createdNodes[0];
        activeShim!.setTotal(1);
        activeShim!.setAsset(1, 1); // second asset only
        runOneBlock(node);

        expect(result.current.meterAnalysers?.nonfiniteCounts?.current).toEqual({ total: 1, perAsset: [0, 1] });
    });

    it('the count resets to zero on the NEXT Play, even though the previous session had flushed samples', async () => {
        const view = await startEngine();
        const node1 = createdNodes[0];
        activeShim!.setTotal(5);
        activeShim!.setAsset(0, 5);
        runOneBlock(node1);
        expect(view.result.current.meterAnalysers?.nonfiniteCounts?.current.total).toBe(5);

        act(() => { view.result.current.handleStop(); });
        expect(view.result.current.meterAnalysers).toBeNull();

        // Second session: a fresh shim, counters back at 0 (as skald_init
        // really does on the backend).
        activeShim = makeShim();
        await act(async () => { await view.result.current.handlePlay(); });
        expect(view.result.current.isPlaying).toBe(true);

        expect(view.result.current.meterAnalysers?.nonfiniteCounts?.current).toEqual({ total: 0, perAsset: [] });
    });
});
