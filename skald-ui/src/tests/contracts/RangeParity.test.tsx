// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { nodeTypes } from '../../definitions/nodeTypes';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';
import { ParamNodeConfig } from '../../components/Nodes/ParamNode';
import { BPM_DEFAULT, BPM_MAX, BPM_MIN } from '../../definitions/bpm';
import {
    BackendDump,
    BackendEntry,
    RangeQuery,
    loadBackendRanges,
    sameAsF32,
} from './paramRangeDump';

/*
================================================================================
| Roadmap packet A8 — THE RANGE-PARITY GATE.                                   |
|                                                                              |
| Six parameter-range mismatches between the editor and the backend have       |
| shipped; four of them were fixed once and re-found later (BUGS.md SKB-024,   |
| SKB-049, SKB-050, SKB-051). The reason is not carelessness — it is that the  |
| parameter contract is written out five to seven times across two languages   |
| and nothing ever compared the copies.                                        |
|                                                                              |
| So this file contains NO TABLE OF RANGES. Copying the Odin table into a      |
| Vitest fixture was the obvious move and it is the wrong one (finding         |
| F-B11-6, corrected by the C3 review): a hand-copied table is an eighth copy  |
| and drifts like all the others. Instead:                                     |
|                                                                              |
|   1. The editor enumerates its own controls — the node cards' `paramSpec`,    |
|      every control `NodeParameterControls` renders, and the BPM constants.    |
|   2. It ASKS the backend what each of those keys resolves to, by building     |
|      and running `skald-backend/tools/param_range_dump` (see                  |
|      paramRangeDump.ts for why it builds instead of reading a committed      |
|      artifact, and why it throws rather than skips without a toolchain).      |
|   3. Anything that disagrees and is not in KNOWN_DIVERGENCES fails.           |
|                                                                              |
| The lookup precedence (node-type override > `level<n>` prefix rule > generic  |
| name > wide-open fallback) is NOT reimplemented here; the dump's `-q` mode    |
| answers for the exact keys the editor asks about, through the real proc.      |
================================================================================
*/

// ---------------------------------------------------------------------------
// What the editor believes
// ---------------------------------------------------------------------------

type Surface = 'card' | 'sidebar' | 'project';

interface UiControl {
    surface: Surface;
    /** React Flow node type, or 'project' for editor-wide constants. */
    uiType: string;
    /** `codegenType` — the `node.type` the backend sees. '' for project scope. */
    backendType: string;
    param: string;
    min?: number;
    max?: number;
}

/** The one way a (nodeType, param) pair becomes a map key. Never inline this. */
const KEY_SEP = '|'; // neither node types nor parameter names contain a pipe
const key = (c: { backendType: string; param: string }) => `${c.backendType}${KEY_SEP}${c.param}`;
const describeControl = (c: UiControl) =>
    `${c.uiType}.${c.param} [${c.surface}] ${c.min ?? 'unbounded'}..${c.max ?? 'unbounded'}`;

/** Node cards: `makeParamNode` keeps its spec readable off the component. */
const cardControls = (): UiControl[] => {
    const out: UiControl[] = [];
    for (const [uiType, Component] of Object.entries(nodeTypes)) {
        const spec = (Component as unknown as { paramSpec?: ParamNodeConfig }).paramSpec;
        if (!spec) continue; // hand-written card; see NodeCardSidebarParity's exemption list
        const backendType = NODE_DEFINITIONS[uiType]?.codegenType ?? '';
        for (const field of spec.fields ?? []) {
            if (field.kind === 'select' || field.kind === 'toggle') continue;
            out.push({ surface: 'card', uiType, backendType, param: field.key, min: field.min, max: field.max });
        }
    }
    return out;
};

/**
 * Data shapes to render each node type under, so `showIf`-gated controls
 * appear (Oscillator/Wavetable `frequency` only exists when `fixedPitch`).
 * Same trick as NodeCardSidebarParity.
 */
const dataVariants = (base: Record<string, unknown>): Record<string, unknown>[] => [
    base,
    { ...base, bpmSync: true },
    { ...base, bpmSync: false },
    { ...base, fixedPitch: true },
    { ...base, fixedPitch: false },
    { ...base, waveform: 'Square' },
];

/**
 * Every numeric bound reachable in a control the sidebar renders.
 *
 * `min`/`max` never reach the DOM — `NumberInput` destructures them out before
 * spreading props, and `CustomSlider` renders a fixed 0..100 *position* axis —
 * so this walks the unrendered element tree handed to `renderControlWrapper`
 * and reads the props directly. That is also why it sees the paired
 * slider+number box as two bounds for one parameter, which is useful: they
 * must agree with each other as well as with the backend.
 */
const collectBounds = (node: React.ReactNode, acc: { min?: number; max?: number }[]): void => {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const child of node) collectBounds(child, acc);
        return;
    }
    const el = node as React.ReactElement<Record<string, unknown>>;
    const props = (el.props ?? {}) as Record<string, unknown>;
    if (typeof props.min === 'number' || typeof props.max === 'number') {
        acc.push({
            min: typeof props.min === 'number' ? props.min : undefined,
            max: typeof props.max === 'number' ? props.max : undefined,
        });
    }
    collectBounds(props.children as React.ReactNode, acc);
};

const sidebarControls = (): UiControl[] => {
    const out: UiControl[] = [];
    const seen = new Set<string>();
    for (const uiType of Object.keys(NODE_DEFINITIONS)) {
        const backendType = NODE_DEFINITIONS[uiType].codegenType;
        const base = { ...(NODE_DEFINITIONS[uiType].defaultParameters ?? {}) } as Record<string, unknown>;
        for (const data of dataVariants(base)) {
            const { unmount } = render(
                <NodeParameterControls
                    node={{ id: `${uiType}-1`, type: uiType, position: { x: 0, y: 0 }, data }}
                    onChange={vi.fn()}
                    renderControlWrapper={(paramKey, _label, control, isExposable) => {
                        // Controls the editor marks non-exposable never mint a
                        // generated setter, so the range table has no say over
                        // them (`inputCount`, `type`, `syncRate`, the Mapper
                        // fields). Excluded rather than allowlisted one by one:
                        // the exclusion is the editor's own declaration.
                        if (isExposable !== false) {
                            const found: { min?: number; max?: number }[] = [];
                            collectBounds(control, found);
                            for (const bound of found) {
                                if (bound.min === undefined && bound.max === undefined) continue;
                                const dedupe = `${uiType}|${paramKey}|${bound.min}|${bound.max}`;
                                if (seen.has(dedupe)) continue;
                                seen.add(dedupe);
                                out.push({
                                    surface: 'sidebar',
                                    uiType,
                                    backendType,
                                    param: paramKey,
                                    min: bound.min,
                                    max: bound.max,
                                });
                            }
                        }
                        return <div key={paramKey}>{control}</div>;
                    }}
                    bpm={120}
                />,
            );
            unmount();
        }
    }
    return out;
};

/** Editor-wide constants that are parameters on the backend side. */
const projectControls = (): UiControl[] => [
    { surface: 'project', uiType: 'project', backendType: '', param: 'bpm', min: BPM_MIN, max: BPM_MAX },
];

// ---------------------------------------------------------------------------
// Divergences that are allowed to exist — each one named and owned
// ---------------------------------------------------------------------------

/**
 * A mismatch that is permitted TODAY, pinned to its exact current values.
 *
 * Pinning is the point. An allowlist that merely names a parameter silently
 * absorbs the NEXT mismatch on that parameter, and an allowlist nobody is
 * forced to revisit is a gate that gets deleted in six months. Because
 * `uiMin`/`uiMax`/`backendMin`/`backendMax` are all recorded, this entry stops
 * matching the moment either side moves — including when someone FIXES it —
 * and the suite fails asking for the entry to be updated or removed.
 */
interface KnownDivergence {
    uiType: string;
    param: string;
    surface?: Surface;
    uiMin?: number;
    uiMax?: number;
    backendMin: number;
    backendMax: number;
    /** Bug id and/or roadmap packet that owns the fix. Never blank. */
    owner: string;
    why: string;
}

/*
 * Every entry below is a mismatch this gate FOUND on its first run and that
 * packet A8 deliberately did not fix, with the reason and the owner. A8 owns
 * `param_ranges.odin`; it does not own the editor files, so every fix that has
 * to happen in `NodeParameterControls.tsx` or a node card is recorded here with
 * the exact edit rather than applied.
 *
 * A8 DID fix, in the table, the five rows where the editor and the ENGINE
 * agreed and only the table disagreed: `pulseWidth` -> 0.01..0.99,
 * `attack`/`decay`/`release` min -> 0, `feedback` max -> 0.95. See the comments
 * on those rows in core/param_ranges.odin.
 */
const KNOWN_DIVERGENCES: KnownDivergence[] = [
    // -----------------------------------------------------------------------
    // 1. Open bugs with an existing id.
    // -----------------------------------------------------------------------
    {
        uiType: 'project',
        param: 'bpm',
        surface: 'project',
        uiMin: 20,
        uiMax: 300,
        backendMin: 20,
        backendMax: 999,
        owner: 'SKB-050 (open) / unify with the runtime-BPM setter work',
        why:
            'The editor cannot reach tempi the backend accepts. Harmless only for as long as ' +
            'there is no runtime BPM setter: the moment one ships, a host can set 400 and the ' +
            'editor can neither display nor re-enter it. Also asserted by name in its own test ' +
            'below, because this is the one still-open member of the original four mismatches.',
    },

    // -----------------------------------------------------------------------
    // 2. The name-keyed table cannot express the parameter (F-A10-17).
    //    `decay` is ONE generic row serving two unrelated quantities: an ADSR
    //    envelope stage and a Reverb tail length. There is no single min that
    //    is right for both, which is the root cause of this whole bug class,
    //    not an oversight. Fixing it needs a Reverb-scoped override — and the
    //    honest override default is 3.0 (what the editor stores), which would
    //    make every shipped patch with an exposed-but-unstored reverb decay
    //    jump from a 0.1 s room to a 3 s hall. That is SKB-024's exact shape,
    //    so it needs the same owner.
    // -----------------------------------------------------------------------
    {
        uiType: 'reverb',
        param: 'decay',
        surface: 'card',
        uiMin: 0.1,
        uiMax: 10,
        backendMin: 0,
        backendMax: 10,
        owner: 'F-A10-17 / packet C2 (per-node schema)',
        why: 'Shared `decay` row: 0 is correct for an ADSR stage, 0.1 for a reverb tail.',
    },
    {
        uiType: 'reverb',
        param: 'decay',
        surface: 'sidebar',
        uiMin: 0.1,
        uiMax: 10,
        backendMin: 0,
        backendMax: 10,
        owner: 'F-A10-17 / packet C2 (per-node schema)',
        why: 'Same shared-row collision as the card above.',
    },

    // -----------------------------------------------------------------------
    // 3. The backend bound is a SAFETY clamp, deliberately wider than any
    //    authoring range. An LFO amplitude feeds whatever it modulates, and
    //    modulating a cutoff means reaching 20 kHz — hence 0..20000 on the
    //    setter. Clamping the setter to the slider's range would make the LFO
    //    useless as a filter modulator. This is a justified divergence, not a
    //    deferred fix; it is pinned so that a CHANGE to either side surfaces.
    //
    //    The editor's own two surfaces disagree here (card 0..10, sidebar
    //    0..1), which is a separate defect the surface-agreement test below
    //    reports against the card/sidebar packet.
    // -----------------------------------------------------------------------
    {
        uiType: 'lfo',
        param: 'amplitude',
        surface: 'card',
        uiMin: 0,
        uiMax: 10,
        backendMin: 0,
        backendMax: 20000,
        owner: 'by design (setter is a safety clamp) — reviewed under A8',
        why: 'An exposed LFO amplitude must be able to reach an audio-range modulation target.',
    },
    {
        uiType: 'lfo',
        param: 'amplitude',
        surface: 'sidebar',
        uiMin: 0,
        uiMax: 1,
        backendMin: 0,
        backendMax: 20000,
        owner: 'by design (setter is a safety clamp) — reviewed under A8',
        why: 'Same as the card entry. The card/sidebar disagreement is the real defect here.',
    },

    // -----------------------------------------------------------------------
    // 4. Fixing needs NARROWING an editor bound, which can invalidate a value
    //    already sitting in a saved patch. Not done by a gate packet.
    // -----------------------------------------------------------------------
    {
        uiType: 'sampleHold',
        param: 'amplitude',
        surface: 'card',
        uiMin: 0,
        uiMax: 10,
        backendMin: 0,
        backendMax: 1,
        owner: 'packet C2 (per-node schema)',
        why:
            'The card is the outlier: the sidebar and the generic `amplitude` row both say 0..1. ' +
            'The S&H DSP does not clamp amplitude, so a patch saved from this card really can ' +
            'hold 7 and really is audible at 7. Narrowing the card to 1 would make that value ' +
            'unreachable for editing, so it needs the schema work, not a bound edit.',
    },
    {
        uiType: 'delay',
        param: 'feedback',
        surface: 'sidebar',
        uiMin: 0,
        uiMax: 1,
        backendMin: 0,
        backendMax: 0.95,
        owner: 'packet C2 — one-line edit in NodeParameterControls.tsx',
        why:
            'A8 corrected the table to the DSP clamp (0.95) and the node card already agreed, ' +
            'so this sidebar slider is now the only copy saying 1.0. The edit is ' +
            "`slider('feedback', 0, 0.95, 0.5)`; it is safe (the DSP has always clamped to " +
            '0.95, so nothing ever sounded different) but it lives in a file A8 does not own.',
    },

    // -----------------------------------------------------------------------
    // 5. Editor surface is NARROWER than the backend and widening it is safe —
    //    recommended fix stated, but the file belongs to another packet.
    //    In both cases the node CARD already matches the backend, so the
    //    sidebar is the sole outlier and there is no judgement call left.
    // -----------------------------------------------------------------------
    {
        uiType: 'lfo',
        param: 'frequency',
        surface: 'sidebar',
        uiMin: 0.1,
        uiMax: 50,
        backendMin: 0.01,
        backendMax: 100,
        owner: 'packet C2 — one-line edit in NodeParameterControls.tsx',
        why:
            'Card and backend both say 0.01..100; only this slider says 0.1..50, so the sidebar ' +
            "cannot reach LFO rates the card and the engine both allow. Edit: " +
            "`slider('frequency', 0.01, 100, 5, 'log')`. Pure widening — non-destructive.",
    },
    {
        uiType: 'sampleHold',
        param: 'rate',
        surface: 'sidebar',
        uiMin: 0.1,
        uiMax: 50,
        backendMin: 0.1,
        backendMax: 1000,
        owner: 'packet C2 — one-line edit in NodeParameterControls.tsx',
        why:
            'Identical shape to lfo.frequency: card and backend agree on 0.1..1000. Edit: ' +
            "`slider('rate', 0.1, 1000, 10, 'log')`. Pure widening — non-destructive.",
    },

    // -----------------------------------------------------------------------
    // 6. Both sides mean "unbounded", spelled differently. The Mapper exists to
    //    rescale arbitrary ranges (its own default outMax is 20000), so the card
    //    deliberately omits min/max and the backend spells the same intent as
    //    +-1e6. Recorded rather than silently skipped: if the contract ever
    //    grows a real "unbounded" marker, these four are the callers to update.
    //    (The sidebar's Mapper fields are marked non-exposable, so they are out
    //    of the enumeration entirely.)
    // -----------------------------------------------------------------------
    ...(['inMin', 'inMax', 'outMin', 'outMax'] as const).map((param) => ({
        uiType: 'mapper',
        param,
        surface: 'card' as Surface,
        uiMin: undefined,
        uiMax: undefined,
        backendMin: -1e6,
        backendMax: 1e6,
        owner: 'by design (both sides mean unbounded) — reviewed under A8',
        why: 'Editor spells unbounded as absent min/max; the backend spells it as +-1e6.',
    })),

    // -----------------------------------------------------------------------
    // 7. No backend row exists, so the lookup returns the wide-open fallback.
    // -----------------------------------------------------------------------
    {
        uiType: 'instrument',
        param: 'volume',
        surface: 'sidebar',
        uiMin: 0,
        uiMax: 1,
        backendMin: -1e6,
        backendMax: 1e6,
        owner: 'packet B2 / C2 — instrument-level exposure is dormant',
        why:
            'The range table has no `volume` row, so this resolves to the unknown-parameter ' +
            'fallback. Adding a row today would invent a contract for a path that mints no ' +
            'setter yet; the fallback IS the correct answer for "no opinion". This entry exists ' +
            'so that enabling instrument exposure trips the gate.',
    },
];

/**
 * Card-vs-sidebar bound disagreements, pinned the same way.
 *
 * These are not backend mismatches — they are the editor contradicting itself,
 * which the enumeration above makes visible for free. Owned by whoever owns
 * card/sidebar convergence (packet C2's generated node schema); recorded here
 * because the alternative is not noticing.
 */
const SURFACE_DISAGREEMENTS: {
    id: string;
    cardMin?: number;
    cardMax?: number;
    sidebarMin?: number;
    sidebarMax?: number;
    owner: string;
}[] = [
    { id: 'lfo.frequency', cardMin: 0.01, cardMax: 100, sidebarMin: 0.1, sidebarMax: 50, owner: 'packet C2' },
    { id: 'lfo.amplitude', cardMin: 0, cardMax: 10, sidebarMin: 0, sidebarMax: 1, owner: 'packet C2' },
    { id: 'sampleHold.rate', cardMin: 0.1, cardMax: 1000, sidebarMin: 0.1, sidebarMax: 50, owner: 'packet C2' },
    { id: 'sampleHold.amplitude', cardMin: 0, cardMax: 10, sidebarMin: 0, sidebarMax: 1, owner: 'packet C2' },
    { id: 'delay.feedback', cardMin: 0, cardMax: 0.95, sidebarMin: 0, sidebarMax: 1, owner: 'packet C2' },
];

/**
 * Default divergences: the editor's stored default vs what an untouched
 * exposure generates. Pinned on both values, so a fix on either side fails.
 */
const KNOWN_DEFAULT_DIVERGENCES: { uiType: string; param: string; ui: number; backend: number; owner: string; why: string }[] = [
    {
        uiType: 'wavetable',
        param: 'amplitude',
        ui: 1.0,
        backend: 0.5,
        owner: 'SKB-024 (open, deliberately) / packet C2 + C1 version field',
        why:
            'THE named case. The one-line fix is a `{"Wavetable", "amplitude", {0,1,1,""}}` row, ' +
            'byte-for-byte the shape that closed SKB-051 for Noise, and it is held back because ' +
            'it is not neutral for existing content: a shipped patch with an exposed-but-unstored ' +
            'Wavetable amplitude generates at 0.5 today and would become 6 dB louder. This gate ' +
            'does NOT force that green — it pins it, so the day someone owns the consequence the ' +
            'test fails and points at this entry.',
    },
    {
        uiType: 'sampleHold',
        param: 'amplitude',
        ui: 1.0,
        backend: 0.5,
        owner: 'packet C2 — same shape as SKB-024',
        why: 'Same as Wavetable: no S&H override, so the generic 0.5 halves an untouched exposure.',
    },
    {
        uiType: 'adsr',
        param: 'decay',
        ui: 0.2,
        backend: 0.1,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why: 'Shared `decay` row again; the editor and the table were never reconciled.',
    },
    {
        uiType: 'adsr',
        param: 'sustain',
        ui: 0.5,
        backend: 0.7,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why: 'Table says 0.7, editor says 0.5.',
    },
    {
        uiType: 'adsr',
        param: 'release',
        ui: 1.0,
        backend: 0.2,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why: 'A 5x difference in release time between an old save and a new one.',
    },
    {
        uiType: 'reverb',
        param: 'decay',
        ui: 3.0,
        backend: 0.1,
        owner: 'F-A10-17 / packet C2',
        why:
            'Worst of the set: an old save with an exposed reverb decay generates a 0.1 s room ' +
            'where the editor shows a 3 s hall. Cannot be fixed without a Reverb-scoped row, and ' +
            'adding one changes shipped audio — SKB-024 all over again.',
    },
    {
        uiType: 'gain',
        param: 'gain',
        ui: 0.75,
        backend: 1.0,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why: 'Editor VCA default 0.75, table unity. ~2.5 dB.',
    },
    {
        uiType: 'fmOperator',
        param: 'frequency',
        ui: 2,
        backend: 1,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why: 'Ratio default: editor 2 (an octave up), table 1 (unison).',
    },
    {
        uiType: 'mapper',
        param: 'outMax',
        ui: 20000,
        backend: 1,
        owner: 'packet C2 (one of SKB-024\'s ten default divergences)',
        why:
            'Editor default maps to 20 kHz (the Mapper exists to drive a cutoff); the table says ' +
            '1. Mapper params are non-exposable today, which is the only reason this is dormant.',
    },
    {
        uiType: 'instrument',
        param: 'volume',
        ui: 1.0,
        backend: 0,
        owner: 'packet B2 / C2 — instrument exposure dormant',
        why: 'No `volume` row, so the fallback default 0 (silence) stands in. See the bounds entry.',
    },
];

const matchesDivergence = (c: UiControl, d: KnownDivergence, backend: BackendEntry): boolean =>
    d.uiType === c.uiType &&
    d.param === c.param &&
    (d.surface === undefined || d.surface === c.surface) &&
    d.uiMin === c.min &&
    d.uiMax === c.max &&
    sameAsF32(d.backendMin, backend.min) &&
    sameAsF32(d.backendMax, backend.max);

// ---------------------------------------------------------------------------

const uiControls: UiControl[] = [];
let dump: BackendDump;
const resolved = new Map<string, BackendEntry>();

beforeAll(() => {
    uiControls.push(...cardControls(), ...sidebarControls(), ...projectControls());

    const queries: RangeQuery[] = [];
    const asked = new Set<string>();
    for (const c of uiControls) {
        const k = key(c);
        if (asked.has(k)) continue;
        asked.add(k);
        queries.push({ nodeType: c.backendType, name: c.param });
    }
    dump = loadBackendRanges(queries);
    for (const q of dump.queries) resolved.set(key({ backendType: q.nodeType, param: q.name }), q);
}, 240_000);

describe('UI/backend parameter-range parity', () => {
    it('enumerated the editor and the backend at all', () => {
        // A gate whose enumeration silently returned nothing would pass forever.
        expect(uiControls.length).toBeGreaterThan(40);
        expect(dump.entries.length).toBeGreaterThan(30);
        expect(dump.queries.length).toBeGreaterThan(20);
        expect(resolved.size).toBe(dump.queries.length);
    });

    it('every exposable UI control agrees with the backend range table', () => {
        const mismatches: string[] = [];
        for (const c of uiControls) {
            const backend = resolved.get(key(c));
            expect(backend, `no backend resolution for ${describeControl(c)}`).toBeDefined();
            if (!backend) continue;
            if (KNOWN_DIVERGENCES.some((d) => matchesDivergence(c, d, backend))) continue;

            const minOk = c.min !== undefined && sameAsF32(c.min, backend.min);
            const maxOk = c.max !== undefined && sameAsF32(c.max, backend.max);
            if (minOk && maxOk) continue;
            mismatches.push(
                `${describeControl(c)}  vs backend(${backend.nodeType || '*'}.${backend.name}) ` +
                    `${backend.min}..${backend.max}`,
            );
        }
        expect(mismatches).toEqual([]);
    });

    it('every recorded divergence still exists exactly as recorded', () => {
        const stale: string[] = [];
        for (const d of KNOWN_DIVERGENCES) {
            expect(d.owner, `KNOWN_DIVERGENCES entry for ${d.uiType}.${d.param} has no owner`).toBeTruthy();
            const hit = uiControls.some((c) => {
                const backend = resolved.get(key(c));
                return backend ? matchesDivergence(c, d, backend) : false;
            });
            if (!hit) {
                stale.push(
                    `${d.uiType}.${d.param} (${d.owner}): recorded ${d.uiMin}..${d.uiMax} vs ` +
                        `${d.backendMin}..${d.backendMax}, but nothing matches that any more. ` +
                        `If it was fixed, DELETE this entry.`,
                );
            }
        }
        expect(stale).toEqual([]);
    });

    it('the node card and the sidebar agree with each other on every shared bound', () => {
        // Not strictly range PARITY, but the same defect class and free to check
        // once both surfaces are enumerated: where the two editor surfaces
        // disagree, at most one of them can match the backend, and the user gets
        // a different answer depending on where they click.
        const bySurface = new Map<string, Map<Surface, UiControl>>();
        for (const c of uiControls) {
            if (c.surface === 'project') continue;
            const k = `${c.uiType}.${c.param}`;
            if (!bySurface.has(k)) bySurface.set(k, new Map());
            bySurface.get(k)!.set(c.surface, c);
        }
        const disagreements: string[] = [];
        for (const [k, surfaces] of bySurface) {
            const card = surfaces.get('card');
            const sidebar = surfaces.get('sidebar');
            if (!card || !sidebar) continue;
            if (card.min === sidebar.min && card.max === sidebar.max) continue;
            const entry = SURFACE_DISAGREEMENTS.find((d) => d.id === k);
            if (
                entry &&
                entry.cardMin === card.min &&
                entry.cardMax === card.max &&
                entry.sidebarMin === sidebar.min &&
                entry.sidebarMax === sidebar.max
            ) {
                continue;
            }
            disagreements.push(
                `${k}: card ${card.min}..${card.max} vs sidebar ${sidebar.min}..${sidebar.max}`,
            );
        }
        expect(disagreements).toEqual([]);
    });

    it('an absent value resolves to the default the editor stores (SKB-024 class)', () => {
        // The other half of the contract, and the half SKB-024 lives in: bounds
        // can match perfectly while the DEFAULTS disagree, and then a patch
        // saved BEFORE a parameter existed generates different audio from a
        // patch saved after. `exposedDefault` is what the backend's
        // `exposed_param_default` returns for an empty node — i.e. exactly what
        // an old save produces — and `defaultParameters` is what a new node
        // stores. They must be the same number.
        const mismatches: string[] = [];
        let compared = 0;
        for (const uiType of Object.keys(NODE_DEFINITIONS)) {
            const def = NODE_DEFINITIONS[uiType];
            const backendType = def.codegenType;
            for (const [param, value] of Object.entries(def.defaultParameters ?? {})) {
                if (typeof value !== 'number') continue; // strings, bools, levels[]
                const backend = resolved.get(key({ backendType, param }));
                if (!backend) continue; // no editor control enumerated for it
                compared += 1;
                if (sameAsF32(value, backend.exposedDefault)) continue;
                const known = KNOWN_DEFAULT_DIVERGENCES.find(
                    (d) => d.uiType === uiType && d.param === param,
                );
                if (known && sameAsF32(known.ui, value) && sameAsF32(known.backend, backend.exposedDefault)) {
                    continue;
                }
                mismatches.push(
                    `${uiType}.${param}: editor stores ${value}, an untouched exposure generates ` +
                        `${backend.exposedDefault}`,
                );
            }
        }
        // Coverage floor. This exact test shipped VACUOUS during development:
        // the map was keyed with one separator and looked up with another, every
        // lookup missed, `continue` swallowed all 30 comparisons and it passed
        // green while checking nothing. A count assertion is the cheap structural
        // guard against that whole class — an enumeration that silently finds
        // nothing must fail, not pass.
        expect(compared).toBeGreaterThan(25);
        expect(mismatches).toEqual([]);
    });

    it('no allowlist entry has gone stale in the other two allowlists either', () => {
        // Same anti-rot rule as the bounds allowlist, applied to the surface and
        // default allowlists. Without this, a fixed default divergence would
        // leave a permanent entry behind that quietly covers the NEXT one.
        const stale: string[] = [];

        const pairs = new Map<string, { card?: UiControl; sidebar?: UiControl }>();
        for (const c of uiControls) {
            if (c.surface === 'project') continue;
            const k = `${c.uiType}.${c.param}`;
            const slot = pairs.get(k) ?? {};
            slot[c.surface as 'card' | 'sidebar'] = c;
            pairs.set(k, slot);
        }
        for (const d of SURFACE_DISAGREEMENTS) {
            const slot = pairs.get(d.id);
            const live =
                slot?.card !== undefined &&
                slot?.sidebar !== undefined &&
                slot.card.min === d.cardMin &&
                slot.card.max === d.cardMax &&
                slot.sidebar.min === d.sidebarMin &&
                slot.sidebar.max === d.sidebarMax;
            if (!live) {
                stale.push(`SURFACE_DISAGREEMENTS ${d.id} (${d.owner}) no longer matches — DELETE it.`);
            }
        }

        for (const d of KNOWN_DEFAULT_DIVERGENCES) {
            expect(d.owner, `default allowlist entry ${d.uiType}.${d.param} has no owner`).toBeTruthy();
            const stored = (NODE_DEFINITIONS[d.uiType]?.defaultParameters ?? {})[d.param];
            const backend = resolved.get(key({ backendType: NODE_DEFINITIONS[d.uiType]?.codegenType ?? '', param: d.param }));
            const live =
                typeof stored === 'number' &&
                backend !== undefined &&
                sameAsF32(stored, d.ui) &&
                sameAsF32(backend.exposedDefault, d.backend);
            if (!live) {
                stale.push(
                    `KNOWN_DEFAULT_DIVERGENCES ${d.uiType}.${d.param} (${d.owner}): recorded ` +
                        `${d.ui} vs ${d.backend}, no longer matches — if it was fixed, DELETE it.`,
                );
            }
        }
        expect(stale).toEqual([]);
    });

    it('BPM: the editor cannot reach tempi the backend accepts (SKB-050, open)', () => {
        // Named separately from the allowlist because SKB-050 is the one open
        // mismatch of the original four and the packet brief requires this gate
        // to light it up rather than absorb it. When a runtime BPM setter ships
        // and the two are unified, this test fails and must be deleted.
        const backend = resolved.get(key({ backendType: '', param: 'bpm' }));
        expect(backend).toBeDefined();
        expect(BPM_MIN).toBe(backend!.min);
        expect(BPM_DEFAULT).toBe(backend!.default);
        expect(BPM_MAX).not.toBe(backend!.max);
        expect([BPM_MAX, backend!.max]).toEqual([300, 999]);
    });
});
