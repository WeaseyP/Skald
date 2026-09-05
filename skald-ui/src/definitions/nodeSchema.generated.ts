// GENERATED FILE — do not edit. Source: schema/nodes.json.
// Regenerate with `node scripts/gen-node-schema.mjs`; NodeSchema.test.ts fails when this
// copy is stale. Roadmap packet C2: the parameter-range contract, authored once, read by
// node-definitions.ts for stored defaults. The range-parity gate still asks the REAL
// backend (param_range_dump) for every editor control; this file is the editor's copy of
// the same source, not a second opinion.

export interface SchemaRange {
    min: number;
    max: number;
    default: number;
    unit: string;
}

/** (nodeType, name) overrides — consulted first. */
export const RANGE_OVERRIDES: Record<string, Record<string, SchemaRange>> = {
    "FmOperator": {
        "frequency": { min: 0.01, max: 32, default: 2, unit: "ratio" },
        "amplitude": { min: 0, max: 1, default: 1, unit: "" },
    },
    "LFO": {
        "frequency": { min: 0.01, max: 100, default: 5, unit: "Hz" },
        "amplitude": { min: 0, max: 20000, default: 1, unit: "" },
    },
    "SampleHold": {
        "rate": { min: 0.1, max: 1000, default: 10, unit: "Hz" },
        "amplitude": { min: 0, max: 1, default: 1, unit: "" },
    },
    "Noise": {
        "amplitude": { min: 0, max: 1, default: 1, unit: "" },
    },
    "Wavetable": {
        "amplitude": { min: 0, max: 1, default: 1, unit: "" },
        "position": { min: 0, max: 3, default: 0, unit: "" },
    },
    "ADSR": {
        "decay": { min: 0, max: 10, default: 0.2, unit: "s" },
        "sustain": { min: 0, max: 1, default: 0.5, unit: "" },
        "release": { min: 0, max: 10, default: 1, unit: "s" },
        "attackCurve": { min: -1, max: 1, default: 0, unit: "" },
        "decayCurve": { min: -1, max: 1, default: 0, unit: "" },
        "releaseCurve": { min: -1, max: 1, default: 0, unit: "" },
    },
    "Reverb": {
        "decay": { min: 0.1, max: 10, default: 3, unit: "s" },
        "damping": { min: 0, max: 1, default: 0, unit: "" },
    },
    "Gain": {
        "gain": { min: 0, max: 4, default: 0.75, unit: "x" },
    },
    "Mapper": {
        "outMax": { min: -1000000, max: 1000000, default: 20000, unit: "" },
    },
    "Distortion": {
        "tone": { min: 100, max: 20000, default: 4000, unit: "Hz" },
        "outputGain": { min: 0, max: 4, default: 1, unit: "x" },
    },
};

/** name-prefix rules (level1, level2, …): the name must be LONGER than the prefix. */
export const RANGE_PREFIX_RULES: { nodeType: string; prefix: string; range: SchemaRange }[] = [
    { nodeType: "", prefix: "level", range: { min: 0, max: 2, default: 1, unit: "x" } },
];

/** name-keyed generic table. */
export const RANGE_GENERIC: Record<string, SchemaRange> = {
    "frequency": { min: 20, max: 20000, default: 440, unit: "Hz" },
    "cutoff": { min: 20, max: 20000, default: 800, unit: "Hz" },
    "resonance": { min: 0.1, max: 20, default: 1, unit: "Q" },
    "phase": { min: 0, max: 360, default: 0, unit: "deg" },
    "pulseWidth": { min: 0.01, max: 0.99, default: 0.5, unit: "" },
    "attack": { min: 0, max: 10, default: 0.1, unit: "s" },
    "decay": { min: 0, max: 10, default: 0.1, unit: "s" },
    "sustain": { min: 0, max: 1, default: 0.7, unit: "" },
    "release": { min: 0, max: 10, default: 0.2, unit: "s" },
    "depth": { min: 0, max: 1, default: 1, unit: "" },
    "velocitySensitivity": { min: 0, max: 1, default: 0.5, unit: "" },
    "delayTime": { min: 0, max: 2, default: 0.5, unit: "s" },
    "feedback": { min: 0, max: 0.95, default: 0.5, unit: "" },
    "preDelay": { min: 0, max: 0.25, default: 0.02, unit: "s" },
    "wetDryMix": { min: 0, max: 1, default: 0.5, unit: "" },
    "mix": { min: 0, max: 1, default: 0.5, unit: "" },
    "drive": { min: 1, max: 100, default: 20, unit: "x" },
    "gain": { min: 0, max: 4, default: 1, unit: "x" },
    "amplitude": { min: 0, max: 1, default: 0.5, unit: "" },
    "pan": { min: -1, max: 1, default: 0, unit: "" },
    "rate": { min: 0.1, max: 100, default: 10, unit: "Hz" },
    "modIndex": { min: 0, max: 1000, default: 100, unit: "" },
    "inMin": { min: -1000000, max: 1000000, default: 0, unit: "" },
    "outMin": { min: -1000000, max: 1000000, default: 0, unit: "" },
    "inMax": { min: -1000000, max: 1000000, default: 1, unit: "" },
    "outMax": { min: -1000000, max: 1000000, default: 1, unit: "" },
    "bpm": { min: 20, max: 999, default: 120, unit: "bpm" },
    "voiceCount": { min: 1, max: 32, default: 8, unit: "" },
    "unison": { min: 1, max: 16, default: 1, unit: "" },
    "detune": { min: 0, max: 100, default: 5, unit: "cents" },
    "glide": { min: 0, max: 5, default: 0.05, unit: "s" },
};

export const RANGE_FALLBACK: SchemaRange = { min: -1000000, max: 1000000, default: 0, unit: "" };

/**
 * Mirror of core.lookup_param_range (param_ranges.odin), case by case: override,
 * then prefix rule (same node type or any, name longer than the prefix), then
 * generic, then the fallback. Both read the same schema, so the only thing that
 * can drift is this precedence — which the staleness gate pins against the Odin.
 */
export const lookupRange = (name: string, nodeType = ''): SchemaRange => {
    if (nodeType !== '') {
        const o = RANGE_OVERRIDES[nodeType]?.[name];
        if (o) return o;
    }
    for (const rule of RANGE_PREFIX_RULES) {
        if (rule.nodeType !== '' && rule.nodeType !== nodeType) continue;
        if (name.startsWith(rule.prefix) && name.length > rule.prefix.length) return rule.range;
    }
    const g = RANGE_GENERIC[name];
    if (g) return g;
    return RANGE_FALLBACK;
};

/** The default a fresh node stores and an exposed-but-unstored parameter generates at. */
export const schemaDefault = (nodeType: string, name: string): number => lookupRange(name, nodeType).default;
