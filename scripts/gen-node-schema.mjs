// Roadmap packet C2 — generate the parameter-range tables from schema/nodes.json.
//
//   node scripts/gen-node-schema.mjs          write both generated files
//   node scripts/gen-node-schema.mjs --check  exit 1 if a committed copy is stale
//
// Emits:
//   skald-backend/core/param_ranges.generated.odin   PARAM_RANGE_OVERRIDES, PARAM_RANGE_PREFIX_RULES,
//                                                    PARAM_RANGE_GENERIC, PARAM_RANGE_FALLBACK
//   skald-ui/src/definitions/nodeSchema.generated.ts the same data + lookupRange, the case-by-case
//                                                    mirror of core.lookup_param_range
//
// The rendering functions are exported so NodeSchema.test.ts can regenerate in memory and
// compare against the committed files without touching the tree. Both outputs are written LF;
// git's autocrlf is what the repo relies on for line endings elsewhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const SCHEMA_PATH = path.join(ROOT, 'schema', 'nodes.json');
export const ODIN_OUT = path.join(ROOT, 'skald-backend', 'core', 'param_ranges.generated.odin');
export const TS_OUT = path.join(ROOT, 'skald-ui', 'src', 'definitions', 'nodeSchema.generated.ts');

export const loadSchema = (p = SCHEMA_PATH) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Odin f32 literal: every number carries a decimal point so `{0, 4}` never
// becomes an integer literal in a struct of f32s. 1000000 prints as 1.0e6, the
// spelling the hand-written table used for "unbounded".
const odinNum = (n) => {
    if (n === 1000000) return '1.0e6';
    if (n === -1000000) return '-1.0e6';
    if (Number.isInteger(n)) return `${n}.0`;
    return String(n);
};
const odinStr = (s) => JSON.stringify(s);
const odinRange = (r) => `{${odinNum(r.min)}, ${odinNum(r.max)}, ${odinNum(r.default)}, ${odinStr(r.unit)}}`;

const wrapComment = (text, indent) => {
    // Hand-wrap at ~76 columns so the generated file reads like the source it replaced.
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if ((cur + ' ' + w).trim().length > 76 - indent.length - 3) {
            lines.push(cur.trim());
            cur = w;
        } else {
            cur = (cur + ' ' + w).trim();
        }
    }
    if (cur) lines.push(cur.trim());
    return lines.map((l) => `${indent}// ${l}`).join('\n');
};

export const renderOdin = (schema) => {
    const out = [];
    out.push('package skald_core');
    out.push('');
    out.push('// GENERATED FILE — do not edit. Source: schema/nodes.json.');
    out.push('// Regenerate with `node scripts/gen-node-schema.mjs`; NodeSchema.test.ts fails');
    out.push('// when this copy is stale. The lookup that walks these tables, the Param_Range');
    out.push('// types and the documentation of WHY the contract is data live in');
    out.push('// param_ranges.odin (roadmap packets A8 and C2).');
    out.push('');
    out.push('// Node-type-specific overrides, consulted before the prefix rules and the');
    out.push('// generic table.');
    out.push('PARAM_RANGE_OVERRIDES := [?]Param_Range_Entry{');
    for (const r of schema.overrides) {
        if (r.why) out.push(wrapComment(r.why, '\t'));
        out.push(`\t{${odinStr(r.nodeType)}, ${odinStr(r.name)}, ${odinRange(r)}},`);
    }
    out.push('}');
    out.push('');
    out.push('PARAM_RANGE_PREFIX_RULES := [?]Param_Range_Prefix_Rule{');
    for (const r of schema.prefixRules) {
        if (r.why) out.push(wrapComment(r.why, '\t'));
        out.push(`\t{${odinStr(r.nodeType)}, ${odinStr(r.prefix)}, ${odinRange(r)}},`);
    }
    out.push('}');
    out.push('');
    out.push('// The name-keyed generic table.');
    out.push('PARAM_RANGE_GENERIC := [?]Param_Range_Entry{');
    let first = true;
    for (const r of schema.generic) {
        if (r.group !== undefined) {
            if (!first) out.push('');
            out.push(wrapComment(r.group, '\t'));
            first = false;
            continue;
        }
        if (r.why) out.push(wrapComment(r.why, '\t'));
        out.push(`\t{"", ${odinStr(r.name)}, ${odinRange(r)}},`);
        first = false;
    }
    out.push('}');
    out.push('');
    out.push('// Unknown parameter: wide-open range, neutral default. Caller can still expose');
    out.push("// this; the clamp simply won't bite.");
    out.push(`PARAM_RANGE_FALLBACK :: Param_Range${odinRange(schema.fallback)}`);
    out.push('');
    return out.join('\n');
};

const tsRange = (r) => `{ min: ${r.min}, max: ${r.max}, default: ${r.default}, unit: ${JSON.stringify(r.unit)} }`;

export const renderTs = (schema) => {
    const out = [];
    out.push('// GENERATED FILE — do not edit. Source: schema/nodes.json.');
    out.push('// Regenerate with `node scripts/gen-node-schema.mjs`; NodeSchema.test.ts fails when this');
    out.push('// copy is stale. Roadmap packet C2: the parameter-range contract, authored once, read by');
    out.push('// node-definitions.ts for stored defaults. The range-parity gate still asks the REAL');
    out.push('// backend (param_range_dump) for every editor control; this file is the editor\'s copy of');
    out.push('// the same source, not a second opinion.');
    out.push('');
    out.push('export interface SchemaRange {');
    out.push('    min: number;');
    out.push('    max: number;');
    out.push('    default: number;');
    out.push('    unit: string;');
    out.push('}');
    out.push('');
    out.push('/** (nodeType, name) overrides — consulted first. */');
    out.push('export const RANGE_OVERRIDES: Record<string, Record<string, SchemaRange>> = {');
    const byType = new Map();
    for (const r of schema.overrides) {
        if (!byType.has(r.nodeType)) byType.set(r.nodeType, []);
        byType.get(r.nodeType).push(r);
    }
    for (const [t, rows] of byType) {
        out.push(`    ${JSON.stringify(t)}: {`);
        for (const r of rows) out.push(`        ${JSON.stringify(r.name)}: ${tsRange(r)},`);
        out.push('    },');
    }
    out.push('};');
    out.push('');
    out.push('/** name-prefix rules (level1, level2, …): the name must be LONGER than the prefix. */');
    out.push('export const RANGE_PREFIX_RULES: { nodeType: string; prefix: string; range: SchemaRange }[] = [');
    for (const r of schema.prefixRules) {
        out.push(`    { nodeType: ${JSON.stringify(r.nodeType)}, prefix: ${JSON.stringify(r.prefix)}, range: ${tsRange(r)} },`);
    }
    out.push('];');
    out.push('');
    out.push('/** name-keyed generic table. */');
    out.push('export const RANGE_GENERIC: Record<string, SchemaRange> = {');
    for (const r of schema.generic) {
        if (r.group !== undefined) continue;
        out.push(`    ${JSON.stringify(r.name)}: ${tsRange(r)},`);
    }
    out.push('};');
    out.push('');
    out.push(`export const RANGE_FALLBACK: SchemaRange = ${tsRange(schema.fallback)};`);
    out.push('');
    out.push('/**');
    out.push(' * Mirror of core.lookup_param_range (param_ranges.odin), case by case: override,');
    out.push(' * then prefix rule (same node type or any, name longer than the prefix), then');
    out.push(' * generic, then the fallback. Both read the same schema, so the only thing that');
    out.push(' * can drift is this precedence — which the staleness gate pins against the Odin.');
    out.push(' */');
    out.push("export const lookupRange = (name: string, nodeType = ''): SchemaRange => {");
    out.push("    if (nodeType !== '') {");
    out.push('        const o = RANGE_OVERRIDES[nodeType]?.[name];');
    out.push('        if (o) return o;');
    out.push('    }');
    out.push('    for (const rule of RANGE_PREFIX_RULES) {');
    out.push("        if (rule.nodeType !== '' && rule.nodeType !== nodeType) continue;");
    out.push('        if (name.startsWith(rule.prefix) && name.length > rule.prefix.length) return rule.range;');
    out.push('    }');
    out.push('    const g = RANGE_GENERIC[name];');
    out.push('    if (g) return g;');
    out.push('    return RANGE_FALLBACK;');
    out.push('};');
    out.push('');
    out.push('/** The default a fresh node stores and an exposed-but-unstored parameter generates at. */');
    out.push("export const schemaDefault = (nodeType: string, name: string): number => lookupRange(name, nodeType).default;");
    out.push('');
    return out.join('\n');
};

const main = () => {
    const schema = loadSchema();
    const odin = renderOdin(schema);
    const ts = renderTs(schema);
    const check = process.argv.includes('--check');
    const same = (p, s) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') === s;
    if (check) {
        const stale = [ODIN_OUT, TS_OUT].filter((p, i) => !same(p, i === 0 ? odin : ts));
        if (stale.length) {
            console.error('stale generated files:\n  ' + stale.join('\n  ') + '\nrun: node scripts/gen-node-schema.mjs');
            process.exit(1);
        }
        console.log('generated files are up to date');
        return;
    }
    fs.writeFileSync(ODIN_OUT, odin);
    fs.writeFileSync(TS_OUT, ts);
    console.log('wrote', path.relative(ROOT, ODIN_OUT));
    console.log('wrote', path.relative(ROOT, TS_OUT));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
