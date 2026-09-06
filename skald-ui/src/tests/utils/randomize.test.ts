import { describe, expect, it } from 'vitest';
import { mulberry32, randomizeParams, RANDOMIZE_AMOUNTS } from '../../utils/randomize';
import { lookupRange } from '../../definitions/nodeSchema.generated';

// Roadmap E11 — "Evolve / Randomize". Written before utils/randomize.ts
// existed: every assertion here failed with a module-resolution error until
// the file was created, then failed on the actual behaviour until the
// implementation matched.

describe('mulberry32', () => {
    it('is deterministic for a given seed', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });

    it('produces values in [0, 1)', () => {
        const r = mulberry32(7);
        for (let i = 0; i < 200; i++) {
            const v = r();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('different seeds diverge', () => {
        const a = mulberry32(1)();
        const b = mulberry32(2)();
        expect(a).not.toBe(b);
    });
});

describe('randomizeParams', () => {
    const instrumentData = {
        name: 'Pad',
        volume: 1,
        voiceCount: 8,
        glide: 0.05,
        unison: 1,
        detune: 5,
        exposedParameters: [] as string[],
    };

    it('same seed -> same result (E11 exit criterion: reproducible)', () => {
        const a = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 1234);
        const b = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 1234);
        expect(a).toEqual(b);
    });

    it('different seeds produce different deltas', () => {
        const a = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 1);
        const b = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 2);
        expect(a).not.toEqual(b);
    });

    it('never mutates parameters that would change the asset\'s public API', () => {
        // exposedParameters (exposure flags), voiceCount (polyphony, C5) — the
        // brief's own list. `name`/`exportId`/`assetType` are strings, already
        // excluded by the numeric filter, but are checked here too so a future
        // change that stringifies a number can't silently re-admit them.
        const out = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 99);
        expect(out).not.toHaveProperty('voiceCount');
        expect(out).not.toHaveProperty('exposedParameters');
        expect(out).not.toHaveProperty('name');
    });

    it('skips a parameter with no authored range (volume: no schema row exists — RangeParity.test.tsx pins the fallback deliberately)', () => {
        // schema/nodes.json has no `volume` row (RangeParity.test.tsx's
        // KNOWN_DIVERGENCES entry #6 records this as a deliberate "no opinion"
        // gap, not a bug). lookupRange('volume', ...) therefore resolves to the
        // wide-open +-1e6 fallback, which has no musically meaningful span to
        // nudge/evolve within — mutating it would as likely blow the level to
        // silence or clipping as leave it musical. Every parameter resolving to
        // that same wide-open fallback (e.g. a Mapper's inMin/inMax/outMin/
        // outMax, which mean "deliberately unbounded") is skipped the same way.
        const out = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, 99);
        expect(out).not.toHaveProperty('volume');
    });

    it('clamps every mutated value inside lookupRange, across many seeds', () => {
        for (let seed = 0; seed < 200; seed++) {
            const out = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, seed);
            for (const [key, value] of Object.entries(out)) {
                const { min, max } = lookupRange(key, 'Instrument');
                expect(value).toBeGreaterThanOrEqual(min);
                expect(value).toBeLessThanOrEqual(max);
            }
        }
    });

    it('rounds unison — the integer-quantized control mirrored from its slider — to a whole number', () => {
        let sawUnison = false;
        for (let seed = 0; seed < 100; seed++) {
            const out = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, seed);
            if ('unison' in out) {
                sawUnison = true;
                expect(Number.isInteger(out.unison)).toBe(true);
            }
        }
        expect(sawUnison).toBe(true);
    });

    it('evolve moves a parameter further from its start value than nudge does, on average', () => {
        const N = 300;
        let nudgeTotal = 0;
        let evolveTotal = 0;
        for (let seed = 0; seed < N; seed++) {
            const n = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.nudge, seed);
            const e = randomizeParams(instrumentData, 'Instrument', RANDOMIZE_AMOUNTS.evolve, seed);
            nudgeTotal += Math.abs((n.glide ?? instrumentData.glide) - instrumentData.glide);
            evolveTotal += Math.abs((e.glide ?? instrumentData.glide) - instrumentData.glide);
        }
        expect(evolveTotal).toBeGreaterThan(nudgeTotal);
    });

    it('ignores non-numeric parameters entirely (waveform, bpmSync, syncRate)', () => {
        const data = { waveform: 'Sine', bpmSync: true, syncRate: '1/8', frequency: 5, amplitude: 1 };
        const out = randomizeParams(data, 'LFO', RANDOMIZE_AMOUNTS.evolve, 5);
        expect(out).not.toHaveProperty('waveform');
        expect(out).not.toHaveProperty('bpmSync');
        expect(out).not.toHaveProperty('syncRate');
    });

    it('returns an empty delta when every parameter is excluded or non-numeric', () => {
        const out = randomizeParams({ device: 'All', useMpe: false }, 'MidiInput', RANDOMIZE_AMOUNTS.evolve, 1);
        expect(out).toEqual({});
    });
});
