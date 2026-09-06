/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasmImports.ts        |
|                                                                              |
| The wasm import object every Skald module is instantiated with — ONE         |
| authored copy, read by both places that instantiate one:                     |
|                                                                              |
|   * the AudioWorkletProcessor (skaldWasm.worklet.ts), which cannot `import`  |
|     anything: it ships as a source string evaluated inside                   |
|     AudioWorkletGlobalScope, so it interpolates this function's own source   |
|     text (see the template's `const skaldWasmImports = ...`);                |
|   * the offline bounce (audio/offlineRender.ts, roadmap G1), which runs the  |
|     same module faster than realtime outside any audio thread.               |
|                                                                              |
| Odin's core:math on freestanding_wasm32 imports libm; the host supplies it.  |
| A module instantiated with a DIFFERENT import object is a different DSP: a   |
| missing entry is a LinkError (loud), but a wrong one — say `exp2f` built     |
| from `Math.exp` instead of `2**x` — is silent and detunes everything that    |
| touches it. Which is why the bounce must not carry its own second copy of    |
| this table: "the bounce sounds slightly unlike the preview" is precisely the |
| defect class a second reader creates (SKB-002's lesson, CLAUDE.md).          |
|                                                                              |
| KEEP THIS FUNCTION SELF-CONTAINED. Its source text is stringified into the   |
| worklet, where nothing this module imports exists — it may reference only    |
| `Math` and literals. WasmWorkletGuard.test.ts pins that the worklet really   |
| carries this body and not a stale duplicate.                                 |
================================================================================
*/

/** The `env` import table an Odin freestanding_wasm32 build of a Skald project needs. */
export const skaldWasmImports = (): { env: Record<string, (...args: number[]) => number> } => ({
    env: {
        sinf: Math.sin, cosf: Math.cos, tanf: Math.tan,
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        exp: Math.exp, expf: Math.exp,
        exp2f: (x: number) => 2 ** x, exp2: (x: number) => 2 ** x,
        log: Math.log, logf: Math.log, log2f: Math.log2, log10f: Math.log10,
        pow: Math.pow, powf: Math.pow, sqrtf: Math.sqrt, cbrtf: Math.cbrt,
        tanh: Math.tanh, tanhf: Math.tanh, coshf: Math.cosh, sinhf: Math.sinh,
        atan2f: Math.atan2, acosf: Math.acos, asinf: Math.asin, atanf: Math.atan,
        fmodf: (a: number, b: number) => a % b,
    },
});
