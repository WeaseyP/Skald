// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from 'reactflow';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { SequencerTrack } from '../../definitions/types';

// ---------------------------------------------------------------------------
// jsdom has no Web Audio. We stub only the surface the engine touches:
//   - AudioContext        (createGain/createAnalyser/audioWorklet/resume/close)
//   - AudioWorkletNode    (its .port is the live control channel)
//   - WebAssembly.compile (bytes -> module)
//   - window.electron.buildWasmPreview (the IPC that does the real codegen+build)
// Each stub records the calls the contract tests assert on. The goal is to pin
// user-observable behavior (does audio start? does a knob rebuild or not?),
// never internal engine state.
// ---------------------------------------------------------------------------

interface FakePort { onmessage: ((e: MessageEvent) => void) | null; postMessage: ReturnType<typeof vi.fn>; }

const createdContexts: FakeAudioContext[] = [];
const createdWorklets: FakeAudioWorkletNode[] = [];

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor() { createdContexts.push(this); }
}

class FakeAudioWorkletNode {
    port: FakePort = { onmessage: null, postMessage: vi.fn() };
    connect = vi.fn();
    constructor(_ctx: unknown, _name: string, _opts: unknown) { createdWorklets.push(this); }
}

let buildWasmPreview: ReturnType<typeof vi.fn>;

beforeEach(() => {
    createdContexts.length = 0;
    createdWorklets.length = 0;

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
    vi.spyOn(WebAssembly, 'compile').mockResolvedValue({} as WebAssembly.Module);

    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    buildWasmPreview = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    (window as unknown as { electron: unknown }).electron = { buildWasmPreview };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

// An instrument whose filter uniquely exposes 'cutoff' (instant set-param path)
// and whose oscillator frequency is NOT exposed (rebuild path).
const makeInstrument = (freq = 440, cutoff = 800): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: freq, amplitude: 0.5 } },
                { id: 'flt', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', type: 'Lowpass', cutoff, resonance: 1, exposedParameters: ['cutoff'] } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'flt', to_port: 'input' },
                { from_node: 'flt', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const noopStep = () => undefined;
const identityScale = (n: number) => n;

const renderEngine = (nodes: Node[], tracks: SequencerTrack[] = []) =>
    renderHook(
        ({ n }: { n: Node[] }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, tracks, noopStep, 16, identityScale),
        { initialProps: { n: nodes } }
    );

describe('useWasmAudioEngine — Play error path', () => {
    it('rejects Play with no instruments: no worklet is built and the AudioContext does not leak', async () => {
        const { result } = renderEngine([
            { id: 'lonely-gain', type: 'gain', position: { x: 0, y: 0 }, data: { gain: 0.5 } } as unknown as Node,
        ]);

        await act(async () => { await result.current.handlePlay(); });

        // Build was never dispatched — the empty-instruments check fires first.
        expect(buildWasmPreview).not.toHaveBeenCalled();
        expect(createdWorklets).toHaveLength(0);
        expect(result.current.isPlaying).toBe(false);
        // The context created inside the click gesture is closed, not leaked.
        expect(createdContexts).toHaveLength(1);
        expect(createdContexts[0].close).toHaveBeenCalled();
    });
});

describe('useWasmAudioEngine — start re-entry latch', () => {
    it('a double-click on Play triggers exactly ONE build', async () => {
        const { result } = renderEngine([makeInstrument()]);

        await act(async () => {
            // Two synchronous clicks before the first build resolves. The
            // startInFlight ref latches out the second.
            const p1 = result.current.handlePlay();
            const p2 = result.current.handlePlay();
            await Promise.all([p1, p2]);
        });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        expect(createdWorklets).toHaveLength(1);
        expect(result.current.isPlaying).toBe(true);
    });
});

describe('useWasmAudioEngine — stop during build', () => {
    it('a Stop that lands before the build resolves creates no worklet node', async () => {
        // Hold the build open so we can Stop mid-flight.
        let resolveBuild!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementation(() => new Promise<ArrayBuffer>((res) => { resolveBuild = res; }));

        const { result } = renderEngine([makeInstrument()]);

        // Kick off Play (do not await — the build is parked).
        let playPromise!: Promise<void>;
        act(() => { playPromise = result.current.handlePlay(); });

        // Stop while the build is still parked.
        act(() => { result.current.handleStop(); });

        // Now let the build resolve. handlePlay must notice the context was torn
        // down and bail before constructing a worklet.
        await act(async () => {
            resolveBuild(new ArrayBuffer(8));
            await playPromise;
        });

        expect(createdWorklets).toHaveLength(0);
        expect(result.current.isPlaying).toBe(false);
    });
});

describe('useWasmAudioEngine — live edits while playing', () => {
    const startPlaying = async (nodes: Node[]) => {
        const view = renderEngine(nodes);
        await act(async () => { await view.result.current.handlePlay(); });
        expect(view.result.current.isPlaying).toBe(true);
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        return view;
    };

    it('a topology edit (non-exposed param) schedules a debounced rebuild', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startPlaying([makeInstrument(440)]);

        // Change the oscillator frequency — not an exposed param, so the
        // topology signature changes and a rebuild must be scheduled.
        await act(async () => { rerender({ n: [makeInstrument(220)] }); });

        // Nothing rebuilds until the debounce elapses...
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // ...then the module is rebuilt.
        expect(buildWasmPreview).toHaveBeenCalledTimes(2);
    });

    it('a uniquely-exposed param edit applies via set-param WITHOUT rebuilding', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startPlaying([makeInstrument(440, 800)]);
        const port = createdWorklets[0].port;
        port.postMessage.mockClear();

        // Change only the exposed 'cutoff'. The signature masks uniquely-exposed
        // values, so this must take the instant set-param channel, not a rebuild.
        await act(async () => { rerender({ n: [makeInstrument(440, 4000)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1); // no rebuild
        const setParamCalls = port.postMessage.mock.calls
            .map((c) => c[0])
            .filter((m: { type: string }) => m.type === 'set-param');
        expect(setParamCalls).toHaveLength(1);
        expect(setParamCalls[0].value).toBe(4000);
        void result;
    });
});
