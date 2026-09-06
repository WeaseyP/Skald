// The AudioWorkletProcessor ships as a source string (skaldWasmProcessorString)
// and cannot be imported as a class, so these tests evaluate the string in a
// sandbox with the worklet globals stubbed and drive the captured class
// directly. Focus: the set-param contract with the generated wasm shim.
//
// Two halves of that contract:
//   1. Name buffer — the generated shim's skald_name_buf is [128]u8
//      (codegen.odin emits `skald_name_buf: [128]u8`). The wasm side rejects
//      oversized names, but only AFTER the host has already copied the bytes
//      into memory — so the worklet must refuse to write more than 128 bytes,
//      or a long param name silently corrupts whatever wasm global follows
//      the buffer. The limit is asserted here BY BEHAVIOUR at the boundary
//      (128 works, 129 is rejected cleanly), not by reading a constant — this
//      test previously pinned 64, a stale value, in green (F-B08-5).
//   2. Return value — skald_set_param returns 1 only when the running module
//      dispatched the name to a real setter. Ignoring the 0 return is what
//      made a stale build's no-op knobs undetectable (SKB-001 / F-C4-2): the
//      worklet must report the drop so the UI can surface it.
import { describe, it, expect, vi } from 'vitest';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';
import { skaldWasmImports } from '../../hooks/nodeEditor/audioWorklets/skaldWasmImports';

// Must match the generated shim's `skald_name_buf: [128]u8`.
const NAME_BUF_BYTES = 128;

interface FakeExports {
    memory: { buffer: ArrayBuffer };
    skald_set_param: ReturnType<typeof vi.fn>;
}

const instantiateProcessor = (setParamResult = 1) => {
    let captured: (new (options: unknown) => any) | null = null;
    class FakeAudioWorkletProcessor {
        port = { onmessage: null, onmessageerror: null, postMessage: vi.fn() };
    }
    const registerProcessor = (_name: string, cls: new (options: unknown) => any) => {
        captured = cls;
    };
    // The worklet string is a plain script: class declaration + registerProcessor.
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', skaldWasmProcessorString)(
        FakeAudioWorkletProcessor,
        registerProcessor,
        48000
    );
    expect(captured).not.toBeNull();
    const proc = new captured!({ processorOptions: {} }); // no bytes: no wasm instantiation
    // Inject a fake wasm instance around the name-buffer contract. The name
    // buffer starts at 0; everything at offset >= NAME_BUF_BYTES stands in
    // for "the next wasm global" and must never be written by set-param
    // handling.
    const ex: FakeExports = {
        memory: { buffer: new ArrayBuffer(512) },
        skald_set_param: vi.fn(() => setParamResult),
    };
    proc.ex = ex;
    proc.nameBufPtr = 0;
    return { proc, ex };
};

const paramDroppedCalls = (proc: any) =>
    proc.port.postMessage.mock.calls
        .map((c: unknown[]) => c[0] as { type: string })
        .filter((m: { type: string }) => m.type === 'param-dropped');

describe('skaldWasm worklet — set-param name buffer guard', () => {
    it('a normal-length name is written and dispatched, with no drop report', () => {
        const { proc, ex } = instantiateProcessor();
        const nameBytes = new TextEncoder().encode('cutoff');

        proc.handleMessage({ type: 'set-param', asset: 0, key: 'cutoff', nameBytes, value: 1234 });

        expect(ex.skald_set_param).toHaveBeenCalledWith(0, nameBytes.length, 1234);
        const mem = new Uint8Array(ex.memory.buffer);
        expect(mem[0]).toBe('c'.charCodeAt(0));
        expect(mem[nameBytes.length - 1]).toBe('f'.charCodeAt(0));
        expect(paramDroppedCalls(proc)).toHaveLength(0);
    });

    it(`a name at EXACTLY the ${NAME_BUF_BYTES}-byte limit is written and dispatched (boundary works)`, () => {
        const { proc, ex } = instantiateProcessor();
        const atLimit = new Uint8Array(NAME_BUF_BYTES).fill('A'.charCodeAt(0));

        proc.handleMessage({ type: 'set-param', asset: 0, key: 'A…', nameBytes: atLimit, value: 7 });

        expect(ex.skald_set_param).toHaveBeenCalledWith(0, NAME_BUF_BYTES, 7);
        const mem = new Uint8Array(ex.memory.buffer);
        expect(mem[0]).toBe('A'.charCodeAt(0));
        expect(mem[NAME_BUF_BYTES - 1]).toBe('A'.charCodeAt(0));
        // The byte AFTER the buffer (the adjacent wasm global) is untouched.
        expect(mem[NAME_BUF_BYTES]).toBe(0);
        expect(paramDroppedCalls(proc)).toHaveLength(0);
    });

    it(`a name ONE byte past the limit (${NAME_BUF_BYTES + 1}) is rejected cleanly: no write, no dispatch, a drop report — not a crash`, () => {
        const { proc, ex } = instantiateProcessor();
        const oneOver = new Uint8Array(NAME_BUF_BYTES + 1).fill('A'.charCodeAt(0));

        proc.handleMessage({ type: 'set-param', asset: 0, key: 'huge::param', nameBytes: oneOver, value: 1 });

        // Nothing may be written anywhere (a partial write would still leave
        // wasm memory inconsistent), and in particular nothing at or past the
        // buffer end (adjacent wasm globals).
        const mem = new Uint8Array(ex.memory.buffer);
        for (let i = 0; i < mem.length; i++) {
            expect(mem[i]).toBe(0);
        }
        expect(ex.skald_set_param).not.toHaveBeenCalled();
        // The drop is REPORTED (the knob did nothing — the user must be able
        // to tell), but not as a worklet crash.
        const drops = paramDroppedCalls(proc);
        expect(drops).toHaveLength(1);
        expect((drops[0] as any).key).toBe('huge::param');
        expect(proc.port.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error' })
        );
    });
});

describe('skaldWasm worklet — skald_set_param return value', () => {
    it('a set_param the module REJECTS (returns 0 — e.g. a stale build without the "::" alias) posts a param-dropped report naming the key', () => {
        const { proc, ex } = instantiateProcessor(0);
        const nameBytes = new TextEncoder().encode('flt::cutoff');

        proc.handleMessage({ type: 'set-param', asset: 0, key: 'flt::cutoff', nameBytes, value: 4000 });

        expect(ex.skald_set_param).toHaveBeenCalledWith(0, nameBytes.length, 4000);
        const drops = paramDroppedCalls(proc);
        expect(drops).toHaveLength(1);
        expect((drops[0] as any).key).toBe('flt::cutoff');
        expect((drops[0] as any).reason).toBeTruthy();
        // A dropped knob is degradation, not a playback failure: no 'error'.
        expect(proc.port.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error' })
        );
    });

    it('a set_param the module ACCEPTS (returns 1) posts nothing', () => {
        const { proc } = instantiateProcessor(1);
        const nameBytes = new TextEncoder().encode('flt::cutoff');

        proc.handleMessage({ type: 'set-param', asset: 0, key: 'flt::cutoff', nameBytes, value: 4000 });

        expect(proc.port.postMessage).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Roadmap G1 (§9.12) — the libm import table has exactly one author.
//
// The offline bounce (audio/offlineRender.ts) instantiates the SAME wasm the
// worklet plays, and a module instantiated with a different import object is
// a different DSP. A missing entry is a LinkError and therefore loud; a wrong
// one — `exp2f` built from Math.exp rather than 2**x, say — is silent and
// detunes everything downstream of it, so "the bounce sounds slightly unlike
// the preview" would be the bug report. The worklet cannot `import` (it is a
// source string evaluated in AudioWorkletGlobalScope), so it interpolates the
// shared function's own source text; these tests are what stops that from
// quietly reverting to a second hand-kept copy.
describe('skaldWasm worklet — one authored libm import table', () => {
    it("the worklet's imports() is the shared table, entry for entry", () => {
        const { proc } = instantiateProcessor();
        const workletEnv = proc.imports().env as Record<string, (...a: number[]) => number>;
        const sharedEnv = skaldWasmImports().env;

        expect(Object.keys(workletEnv).sort()).toEqual(Object.keys(sharedEnv).sort());
        for (const name of Object.keys(sharedEnv)) {
            expect(typeof workletEnv[name]).toBe('function');
        }
        // The two entries that are NOT a bare Math alias, and so are the two
        // a re-typed copy would most plausibly get wrong.
        expect(workletEnv.exp2f(3)).toBe(8);
        expect(workletEnv.fmodf(7, 4)).toBe(3);
    });

    it("carries the shared function's own source text, so a new entry needs no worklet edit", () => {
        expect(skaldWasmProcessorString).toContain(`const skaldWasmImports = ${skaldWasmImports.toString()}`);
        expect(skaldWasmProcessorString).toContain('return skaldWasmImports();');
    });
});
