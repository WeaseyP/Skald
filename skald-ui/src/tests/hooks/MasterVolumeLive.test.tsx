// @vitest-environment jsdom
//
// SKB-011 acceptance fixture: preview and export must apply master volume at
// the SAME point in the signal chain. Before this fix, preview baked
// master_volume=1.0 into the worklet and applied the slider AFTERWARD as a
// post-worklet JS GainNode (vol·tanh(x)), while the export applies it INSIDE
// the DSP graph before the soft limiter (tanh(vol·x)). tanh is concave, so
// the two only ever agreed at vol∈{0,1} — every other setting played louder
// and less saturated than what was tuned by ear.
//
// This fixture drives the REAL worklet source (skaldWasmProcessorString)
// against a wasm-shim stand-in that mirrors the generated contract
// (codegen.odin: skald_init bakes the preview's build value — always 1.0,
// see useWasmAudioEngine's buildModule — and skald_set_master_volume is the
// live setter SKB-011's backend half added), so it proves the FRONTEND wiring
// end to end: the slider reaches skald_set_master_volume, not a GainNode, and
// a live value survives a hot-swap instead of snapping back to the baked 1.0.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';
import { SequencerTrack } from '../../definitions/types';

const NAME_BUF_PTR = 1024;

// Mirrors the generated shim's exports surface (codegen.odin) closely enough
// to exercise instantiate()'s call ORDER: skald_init resets the module's
// wasm_master_volume to the value baked at build time (always 1.0 for the
// preview — buildModule never bakes the real slider value, to keep volume
// changes off the rebuild path), so a correct host must call
// skald_set_master_volume AFTER skald_init on every instantiate, not only on
// the first one.
const makeShim = () => {
    const memory = { buffer: new ArrayBuffer(65536) };
    const masterVolumeCalls: number[] = [];
    let masterVolume = 1.0;
    const exports = {
        memory,
        skald_init: vi.fn(() => { masterVolume = 1.0; }),
        skald_start_all: vi.fn(),
        skald_stop_all: vi.fn(),
        skald_asset_count: () => 1,
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
        skald_set_master_volume: vi.fn((v: number) => {
            masterVolumeCalls.push(v);
            masterVolume = v;
        }),
        skald_get_master_volume: () => masterVolume,
    };
    return { exports, masterVolumeCalls, getMasterVolume: () => masterVolume };
};

// Evaluate the REAL worklet source with the worklet globals stubbed and
// WebAssembly shadowed, same technique as LiveParamEndToEnd.test.tsx.
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

// An AudioWorkletNode whose port is genuinely wired to a live processor
// instance, so postMessage from the hook really drives the processor code.
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

const createdContexts: FakeAudioContext[] = [];

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    // Tracked so the "no GainNode" contract assertion below has something to
    // point at: the whole point of SKB-011 is that this must NEVER be called.
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor() { createdContexts.push(this); }
}

beforeEach(() => {
    createdNodes.length = 0;
    createdContexts.length = 0;
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

const makeInstrument = (freq = 440): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: freq, amplitude: 0.5 } },
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

const startEngine = async (masterVolume: number, nodes: Node[] = [makeInstrument()]) => {
    activeShim = makeShim();
    const view = renderHook(
        ({ n, mv }: { n: Node[]; mv: number }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, [] as SequencerTrack[], noopStep, 16, identityScale, mv),
        { initialProps: { n: nodes, mv: masterVolume } }
    );
    await act(async () => { await view.result.current.handlePlay(); });
    expect(view.result.current.isPlaying).toBe(true);
    expect(createdNodes).toHaveLength(1);
    return view;
};

describe('master volume live (SKB-011) — DSP-internal, not a post-worklet GainNode', () => {
    it('Play seeds skald_set_master_volume from the current slider value, and no GainNode is ever created', async () => {
        await startEngine(0.5);

        expect(activeShim!.getMasterVolume()).toBe(0.5);
        // The bug's whole shape: a SECOND, JS-side gain stage. There must be
        // exactly one place volume is applied — inside the DSP.
        expect(createdContexts[0].createGain).not.toHaveBeenCalled();
    });

    it('masterVolume = 0 reaches the DSP as REAL silence — not read as absent and defaulted to unity', async () => {
        // SKB-004 made an authored/live 0 mean actual silence, distinguishable
        // from "no value supplied". A `??`/`||` default anywhere on this path
        // would reintroduce exactly that bug for the master fader.
        await startEngine(0);

        expect(activeShim!.getMasterVolume()).toBe(0);
        expect(activeShim!.masterVolumeCalls).toContain(0);
    });

    it('a live slider change while playing calls skald_set_master_volume directly — no rebuild', async () => {
        const { rerender } = await startEngine(0.5);
        const buildWasmPreview = (window as any).electron.buildWasmPreview as ReturnType<typeof vi.fn>;
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);

        await act(async () => { rerender({ n: [makeInstrument()], mv: 0.9 }); });

        expect(activeShim!.getMasterVolume()).toBe(0.9);
        expect(buildWasmPreview).toHaveBeenCalledTimes(1); // still no rebuild
    });

    it('a hot-swap (topology edit mid-play) REAPPLIES the live volume instead of snapping back to the baked 1.0', async () => {
        vi.useFakeTimers();
        const { rerender } = await startEngine(0.3, [makeInstrument(440)]);
        expect(activeShim!.getMasterVolume()).toBe(0.3);

        // A non-exposed param edit changes the topology signature, which
        // schedules a debounced rebuild -> hot-swap ('swap' message ->
        // instantiate(..., preserveTransport=true) -> skald_init, which this
        // shim uses to reset its master volume to 1.0, simulating the
        // freshly-initialized module).
        await act(async () => { rerender({ n: [makeInstrument(220)], mv: 0.3 }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        const buildWasmPreview = (window as any).electron.buildWasmPreview as ReturnType<typeof vi.fn>;
        expect(buildWasmPreview).toHaveBeenCalledTimes(2); // the hot-swap happened

        // If the host failed to reapply after instantiate, this would read
        // back 1.0 (skald_init's baked value) instead of the fader's actual
        // live position.
        expect(activeShim!.getMasterVolume()).toBe(0.3);
    });
});
