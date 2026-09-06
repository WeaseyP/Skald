/*
================================================================================
| FILE: skald-ui/src/utils/randomize.ts                                        |
|                                                                              |
| Roadmap packet E11 — "Randomize / Evolve": controlled parameter mutation,   |
| not chaos. A sound designer clicking this wants dozens of plausible timbre  |
| variants of ONE patch, each one still recognisably the same patch — not a   |
| slider dropped to a random point in its full travel, which would as often   |
| produce silence or a clipped mess as something usable.                      |
|                                                                              |
| So every mutation is a bounded NUDGE from the CURRENT value, sized as a      |
| fraction of the parameter's authored span (`lookupRange` — the same C2      |
| schema contract every other control reads; never a hardcoded range here),   |
| not a fresh draw across the whole range. Two presets: "nudge" (+-5%) for a   |
| single sound designer exploring variations of what they already have, and   |
| "evolve" (+-25%) for deliberately drifting further while staying seeded and |
| reproducible (a designer who likes iteration 7 can tell someone else the    |
| seed and get iteration 7 back exactly).                                     |
================================================================================
*/
import { lookupRange, RANGE_FALLBACK, SchemaRange } from '../definitions/nodeSchema.generated';

export type RandomizeAmount = 'nudge' | 'evolve';

/** Fraction of a parameter's authored span the mutation may move it by. */
export const RANDOMIZE_AMOUNTS: Record<RandomizeAmount, number> = {
    nudge: 0.05,
    evolve: 0.25,
};

/**
 * Excluded regardless of node type, because mutating them would not vary the
 * SOUND — it would change what the asset publicly IS (the brief's own list):
 * `exposedParameters` is the exposure-flag list itself, `exportId` is the
 * symbol a game's code links against (assetIdentity.ts), `voiceCount` decides
 * the exported processor's polyphony (its own struct array size, not a knob).
 * `name`/`assetType`/`label` are strings and so are already excluded by the
 * numeric filter below; listed here too so a future change that encodes one
 * of them as a number can't silently re-admit it.
 */
const EXCLUDED_PARAMS: ReadonlySet<string> = new Set([
    'exposedParameters', 'exportId', 'voiceCount', 'name', 'assetType', 'label',
]);

/**
 * Integer-quantized controls: mirrors the `integer = true` sliders in
 * NodeParameterControls.tsx (currently only Unison Voices — Voice Count is
 * the other one, but it is excluded above). A continuous nudge that landed
 * on 3.42 unison voices would be silently truncated somewhere downstream the
 * same way BUG-INTEGER-CONTROLS-EMIT-FLOATS was (CustomSlider.tsx's
 * `quantizeToStep`), so this rounds before the value ever leaves this module.
 */
const INTEGER_PARAMS: ReadonlySet<string> = new Set(['unison']);

/** True when `lookupRange` had no real opinion — the wide-open +-1e6 fallback. */
const isUnboundedFallback = (r: SchemaRange): boolean =>
    r.min === RANGE_FALLBACK.min && r.max === RANGE_FALLBACK.max;

/**
 * Tiny deterministic PRNG (Mulberry32): given the same 32-bit seed it always
 * produces the same sequence in [0, 1), which is what "same seed -> same
 * result" needs. `Math.random()` cannot be seeded, so it cannot honour "seed
 * shown/re-rollable so a result can be reproduced" at all.
 */
export const mulberry32 = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/**
 * The parameters in `data` that Randomize would touch — numeric, not on the
 * exclusion list, and resolving to a real (non-fallback) authored span.
 * Exposed separately from `randomizeParams` so a caller can decide whether to
 * show the control at all (a node with nothing eligible — MIDI Input, whose
 * only fields are `device`/`useMpe` — shouldn't offer a button that always
 * produces an empty delta) WITHOUT consuming the RNG a real click would use.
 *
 * Sorted rather than left in object-insertion order, so the same (data,
 * nodeType) always visits parameters in the same order — which is what makes
 * `randomizeParams` reproducible regardless of how the caller's object
 * happened to be built.
 */
export const randomizableParamNames = (data: Record<string, unknown>, nodeType: string): string[] => {
    const names: string[] = [];
    for (const name of Object.keys(data).sort()) {
        const value = data[name];
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (EXCLUDED_PARAMS.has(name)) continue;
        const range = lookupRange(name, nodeType);
        if (isUnboundedFallback(range)) continue; // no authored range to bound the nudge within
        if (!(range.max - range.min > 0)) continue;
        names.push(name);
    }
    return names;
};

/**
 * Every eligible parameter in `data` (see `randomizableParamNames`), mutated
 * within `amount` of its authored span around its CURRENT value and clamped
 * back into that span. Returns ONLY the changed keys — a delta, exactly like
 * every other multi-field write in this editor (bpmSyncToggleChanges, mixer
 * `withLevel`) — so a caller writes it through the ordinary parameter-set
 * path (`onChangeMany` / `updateNodeData`) in ONE call: one history entry.
 */
export const randomizeParams = (
    data: Record<string, unknown>,
    nodeType: string,
    amount: number,
    seed: number,
): Record<string, number> => {
    const rng = mulberry32(seed);
    const out: Record<string, number> = {};
    for (const name of randomizableParamNames(data, nodeType)) {
        const value = data[name] as number;
        const { min, max } = lookupRange(name, nodeType);
        const delta = (rng() * 2 - 1) * amount * (max - min);
        let next = Math.max(min, Math.min(max, value + delta));
        if (INTEGER_PARAMS.has(name)) next = Math.round(next);
        out[name] = next;
    }
    return out;
};
