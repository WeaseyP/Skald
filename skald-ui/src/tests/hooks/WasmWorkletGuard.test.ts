// The AudioWorkletProcessor ships as a source string (skaldWasmProcessorString)
// and cannot be imported as a class, so these tests evaluate the string in a
// sandbox with the worklet globals stubbed and drive the captured class
// directly. Focus: the set-param name-buffer contract with the generated wasm
// shim (skald_name_buf is [64]u8). The wasm side rejects oversized names, but
// only AFTER the host has already copied the bytes into memory — so the
// worklet must refuse to write more than 64 bytes, or a long param name
// silently corrupts whatever wasm global follows the name buffer.
import { describe, it, expect, vi } from 'vitest';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';

interface FakeExports {
    memory: { buffer: ArrayBuffer };
    skald_set_param: ReturnType<typeof vi.fn>;
}

const instantiateProcessor = () => {
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
    // buffer starts at 0; everything at offset >= 64 stands in for "the next
    // wasm global" and must never be written by set-param handling.
    const ex: FakeExports = {
        memory: { buffer: new ArrayBuffer(256) },
        skald_set_param: vi.fn(() => 1),
    };
    proc.ex = ex;
    proc.nameBufPtr = 0;
    return { proc, ex };
};

describe('skaldWasm worklet — set-param name buffer guard', () => {
    it('a normal-length name is written and dispatched', () => {
        const { proc, ex } = instantiateProcessor();
        const nameBytes = new TextEncoder().encode('cutoff');

        proc.handleMessage({ type: 'set-param', asset: 0, nameBytes, value: 1234 });

        expect(ex.skald_set_param).toHaveBeenCalledWith(0, nameBytes.length, 1234);
        const mem = new Uint8Array(ex.memory.buffer);
        expect(mem[0]).toBe('c'.charCodeAt(0));
        expect(mem[nameBytes.length - 1]).toBe('f'.charCodeAt(0));
    });

    it('a name longer than the 64-byte wasm buffer is dropped WITHOUT writing past the buffer', () => {
        const { proc, ex } = instantiateProcessor();
        const oversized = new Uint8Array(100).fill(65); // 100 × 'A'

        proc.handleMessage({ type: 'set-param', asset: 0, nameBytes: oversized, value: 1 });

        // Nothing may be written at or past offset 64 (adjacent wasm globals),
        // and the call must not be forwarded (the wasm side would reject it
        // anyway — after the corruption already happened).
        const mem = new Uint8Array(ex.memory.buffer);
        for (let i = 64; i < 100; i++) {
            expect(mem[i]).toBe(0);
        }
        expect(ex.skald_set_param).not.toHaveBeenCalled();
        // Dropping the message must not be reported as a worklet crash.
        expect(proc.port.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error' })
        );
    });
});
