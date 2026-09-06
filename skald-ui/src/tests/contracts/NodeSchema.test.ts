// @vitest-environment node
/*
================================================================================
| Roadmap packet C2 — THE STALENESS GATE for the generated range tables.       |
|                                                                              |
| schema/nodes.json is the one authored copy of the parameter-range contract.  |
| scripts/gen-node-schema.mjs renders it to param_ranges.generated.odin and     |
| nodeSchema.generated.ts. If either committed copy differs from what the       |
| schema renders to today, this fails and says which — so an edit to a table    |
| without regenerating (or an edit to a generated file by hand) cannot ship.     |
|                                                                              |
| The second half pins the TypeScript lookup mirror against the Odin            |
| precedence, using the same cases the Odin unit tests use.                     |
================================================================================
*/
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadSchema, renderOdin, renderTs, ODIN_OUT, TS_OUT, SCHEMA_PATH } from '../../../../scripts/gen-node-schema.mjs';
import { lookupRange, schemaDefault, RANGE_FALLBACK } from '../../definitions/nodeSchema.generated';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';

const lf = (s: string) => s.replace(/\r\n/g, '\n');

describe('generated range tables are up to date with schema/nodes.json', () => {
    const schema = loadSchema(SCHEMA_PATH);

    it('param_ranges.generated.odin matches what the schema renders to', () => {
        expect(fs.existsSync(ODIN_OUT), `${path.relative(process.cwd(), ODIN_OUT)} missing — run node scripts/gen-node-schema.mjs`).toBe(true);
        expect(lf(fs.readFileSync(ODIN_OUT, 'utf8'))).toBe(renderOdin(schema));
    });

    it('nodeSchema.generated.ts matches what the schema renders to', () => {
        expect(fs.existsSync(TS_OUT)).toBe(true);
        expect(lf(fs.readFileSync(TS_OUT, 'utf8'))).toBe(renderTs(schema));
    });
});

describe('lookupRange mirrors lookup_param_range precedence', () => {
    it('override beats generic; generic beats fallback', () => {
        expect(lookupRange('frequency', 'FmOperator').unit).toBe('ratio');
        expect(lookupRange('frequency', 'Oscillator').unit).toBe('Hz');
        expect(lookupRange('no_such_parameter')).toEqual(RANGE_FALLBACK);
    });
    it('a prefix rule needs a name LONGER than the prefix', () => {
        expect(lookupRange('level3', 'Mixer').default).toBe(1);
        expect(lookupRange('level', 'Mixer')).toEqual(RANGE_FALLBACK);
    });
    it('the nine former divergences resolve to the editor default', () => {
        expect(schemaDefault('Wavetable', 'amplitude')).toBe(1);
        expect(schemaDefault('SampleHold', 'amplitude')).toBe(1);
        expect(schemaDefault('ADSR', 'decay')).toBe(0.2);
        expect(schemaDefault('ADSR', 'sustain')).toBe(0.5);
        expect(schemaDefault('ADSR', 'release')).toBe(1);
        expect(schemaDefault('Reverb', 'decay')).toBe(3);
        expect(schemaDefault('Gain', 'gain')).toBe(0.75);
        expect(schemaDefault('FmOperator', 'frequency')).toBe(2);
        expect(schemaDefault('Mapper', 'outMax')).toBe(20000);
    });
});

describe('node-definitions stores the schema default for every numeric parameter with a row', () => {
    it('agrees with schemaDefault, so a default cannot be authored twice', () => {
        const mismatches: string[] = [];
        for (const [uiType, def] of Object.entries(NODE_DEFINITIONS)) {
            if (uiType === 'instrument') continue; // instrument-level exposure is dormant (fallback row)
            for (const [param, value] of Object.entries(def.defaultParameters ?? {})) {
                if (typeof value !== 'number') continue;
                const range = lookupRange(param, def.codegenType);
                if (range === RANGE_FALLBACK) continue; // no row: nothing to agree with
                if (range.default !== value) mismatches.push(`${uiType}.${param}: stores ${value}, schema says ${range.default}`);
            }
        }
        expect(mismatches).toEqual([]);
    });
});
