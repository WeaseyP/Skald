// @vitest-environment jsdom
//
// Acceptance fixture for the "<nodeId>::<param>" live-parameter path,
// end to end across everything the frontend owns:
//
//   node data → projectSerializer (key construction + live/rebuild routing)
//     → useWasmAudioEngine (instant set-param path)
//       → the REAL worklet code (evaluated from skaldWasmProcessorString)
//         → a wasm-shim stand-in implementing the generated skald_set_param
//           dispatch contract (codegen.odin: host writes UTF-8 bytes into
//           skald_name_buf, calls skald_set_param(asset, len, value), gets 1
//           only when the name matched a setter — names include the
//           node-scoped "<nodeId>::<param>" aliases).
//
// Nothing tested the alias end to end before: a stale codegen binary that
// predates the alias made every exposed-parameter knob a silent no-op during
// preview and no test noticed (SKB-001 / F-C4-2). The second test here is
// exactly that scenario — a running module WITHOUT the alias — and pins that
// it is now loudly reported instead of silent.
//
// NOT covered (stated plainly): the wasm module itself is a JS stand-in, so
// this fixture proves the frontend honours the dispatch contract, not that
// the Odin codegen still emits the alias. That half needs a real
// codegen+odin build of a fixture patch — it belongs to the examples-corpus
// CI gate (packet A5) and the binary-provenance handshake (A2), which own
// skald-backend and CI files this packet must not touch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';
import { SequencerTrack } from '../../definitions/types';

// ---------------------------------------------------------------------------
// The wasm-shim stand-in. Mirrors the generated module's exports surface and
// the skald_set_param dispatch semantics: the name is read back OUT of shim
// memory (so the fixture proves the worklet really wrote the bytes at
// skald_name_buf_ptr), and only names in `acceptedNames` return 1.
// ---------------------------------------------------------------------------
const NAME_BUF_PTR = 1024;

const makeShim = (acceptedNames: string[]) => {
    const memory = { buffer: new ArrayBuffer(65536) };
    const applied: Record<string, number> = {};
    const exports = {
        memory,
        skald_init: vi.fn(),
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
        skald_set_param: (asset: number, nameLen: number, value: number): number => {
            if (nameLen <= 0 || nameLen > 128) return 0; // generated guard
            const name = new TextDecoder().decode(
                new Uint8Array(memory.buffer, NAME_BUF_PTR, nameLen)
            );
            if (asset !== 0 || !acceptedNames.includes(name)) return 0;
            applied[name] = value;
            return 1;
        },
    };
    return { exports, applied };
};

// ---------------------------------------------------------------------------
// Evaluate the REAL worklet source with the worklet globals stubbed and
// WebAssembly shadowed, so `new WebAssembly.Instance(...)` hands the
// processor our shim. The processor's message handling — buffer guard,
// return-value check, param-dropped reporting — is the shipped code.
// ---------------------------------------------------------------------------
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
        Instance: class {
            exports = shimExports;
            constructor(_module: unknown, _imports: unknown) {}
        },
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

// ---------------------------------------------------------------------------
// An AudioWorkletNode whose port is genuinely WIRED to a live processor
// instance: postMessage delivers into the processor's onmessage, and the
// processor's port.postMessage delivers back into node.port.onmessage.
// ---------------------------------------------------------------------------
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
            // main thread -> audio thread
            postMessage: (m: unknown) => { this.processor.port.onmessage?.({ data: m }); },
        };
        // audio thread -> main thread
        this.processor.port.postMessage = (m: unknown) => { this.port.onmessage?.({ data: m }); };
        createdNodes.push(this);
    }
}

class FakeAudioContext {
    state = 'running';
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
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
});

// The same instrument shape the other engine tests use: 'flt' exposes
// 'cutoff', so the live key on the wire must be exactly "flt::cutoff".
const makeInstrument = (cutoff: number): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
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

const startEngine = async (cutoff: number) => {
    const view = renderHook(
        ({ n }: { n: Node[] }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, [] as SequencerTrack[], noopStep, 16, identityScale),
        { initialProps: { n: [makeInstrument(cutoff)] } }
    );
    await act(async () => { await view.result.current.handlePlay(); });
    expect(view.result.current.isPlaying).toBe(true);
    expect(createdNodes).toHaveLength(1);
    return view;
};

describe('live-param acceptance — "<nodeId>::<param>" end to end', () => {
    it('a cutoff drag lands in the running module under the exact "flt::cutoff" key, applied through real worklet code', async () => {
        // A current-generation module: it accepts the node-scoped alias
        // (plus the bare collision-resolved name, as the codegen emits both).
        activeShim = makeShim(['flt::cutoff', 'cutoff']);
        const { result, rerender } = await startEngine(800);

        await act(async () => { rerender({ n: [makeInstrument(4000)] }); });

        // The value arrived in "wasm" via skald_name_buf + skald_set_param,
        // keyed by the alias — not by the bare name, not via a rebuild.
        expect(activeShim.applied['flt::cutoff']).toBe(4000);
        expect(activeShim.applied['cutoff']).toBeUndefined();
        expect((window as any).electron.buildWasmPreview).toHaveBeenCalledTimes(1); // no rebuild
        // A knob that worked reports nothing.
        expect(result.current.previewStale).toBeNull();
        expect(result.current.previewError).toBeNull();
    });

    it('SKB-001 shape: a module WITHOUT the "::" alias (stale build) turns the same drag into a VISIBLE previewStale report, not a silent no-op', async () => {
        // A stale-generation module: it only knows the bare field name, like
        // the committed skald_codegen.exe that predated the alias.
        activeShim = makeShim(['cutoff']);
        const { result, rerender } = await startEngine(800);

        await act(async () => { rerender({ n: [makeInstrument(4000)] }); });

        // The knob did nothing in the module...
        expect(activeShim.applied).toEqual({});
        // ...and that is now REPORTED where previewStale is surfaced, naming
        // the key. Before this packet the 0 return was discarded in the
        // worklet and every layer above stayed green — "dragging any exposed
        // parameter during playback does nothing at all" with no report.
        expect(result.current.previewStale).toContain('flt::cutoff');
        expect(result.current.isPlaying).toBe(true); // degradation, not failure
        expect(result.current.previewError).toBeNull();
    });
});
