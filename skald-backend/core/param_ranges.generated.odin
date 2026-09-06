package skald_core

// GENERATED FILE — do not edit. Source: schema/nodes.json.
// Regenerate with `node scripts/gen-node-schema.mjs`; NodeSchema.test.ts fails
// when this copy is stale. The lookup that walks these tables, the Param_Range
// types and the documentation of WHY the contract is data live in
// param_ranges.odin (roadmap packets A8 and C2).

// Node-type-specific overrides, consulted before the prefix rules and the
// generic table.
PARAM_RANGE_OVERRIDES := [?]Param_Range_Entry{
	// A ratio of the played note, not Hz: the generic frequency row gave an
	// exposed FM ratio a [20,20000] Hz setter. Default 2 = the editor's (C2
	// unified nine defaults; the table said 1).
	{"FmOperator", "frequency", {0.01, 32.0, 2.0, "ratio"}},
	// An exposed LFO frequency clamped to audio range under the generic row.
	{"LFO", "frequency", {0.01, 100.0, 5.0, "Hz"}},
	// An LFO's amplitude is a modulation depth in the destination's units, not
	// 0..1.
	{"LFO", "amplitude", {0.0, 20000.0, 1.0, ""}},
	// Wider than the generic rate row's 100 Hz; the card allows 1000.
	{"SampleHold", "rate", {0.1, 1000.0, 10.0, "Hz"}},
	// The generic amplitude default is 0.5, but the Noise generator's own
	// fallback and the editor's default are both 1.0 (unity) — so exposing an
	// untouched Noise amplitude used to halve it (SKB-051, closed in 08d5875).
	{"Noise", "amplitude", {0.0, 1.0, 1.0, ""}},
	// SKB-024, THE named case: byte-for-byte the Noise row's shape, held back
	// until C1's backfill existed. The 3->4 save migration stores 0.5 on any
	// exposed-but-unstored Wavetable amplitude (what it generated at), so no
	// existing file changes sound; new nodes store 1.0 and now generate 1.0
	// when exposed. No shipped example had the case.
	{"Wavetable", "amplitude", {0.0, 1.0, 1.0, ""}},
	// Same shape as the Wavetable row above, same backfill.
	{"SampleHold", "amplitude", {0.0, 1.0, 1.0, ""}},
	// The four-shape morph: 0 sine, 1 triangle, 2 saw, 3 square.
	{"Wavetable", "position", {0.0, 3.0, 0.0, ""}},
	// C2: the editor's default is 0.2; the shared generic decay row said 0.1
	// (one of SKB-024's ten divergences). Backfilled 3->4 for
	// exposed-but-unstored.
	{"ADSR", "decay", {0.0, 10.0, 0.2, "s"}},
	// C2: editor 0.5, generic row 0.7. Backfilled 3->4.
	{"ADSR", "sustain", {0.0, 1.0, 0.5, ""}},
	// C2: editor 1.0, generic row 0.2. Backfilled 3->4.
	{"ADSR", "release", {0.0, 10.0, 1.0, "s"}},
	// E8 (roadmap 9.4 item 2): per-stage curve tension. 0 = linear, the shape
	// every ADSR emitted before this row existed — an exposed-but-untouched
	// attackCurve must generate the same envelope as a patch with no curve at
	// all, so this default is the one number that keeps every pre-E8 patch's
	// goldens byte-identical.
	{"ADSR", "attackCurve", {-1.0, 1.0, 0.0, ""}},
	// E8, same shape as attackCurve above — 0 = linear.
	{"ADSR", "decayCurve", {-1.0, 1.0, 0.0, ""}},
	// E8, same shape as attackCurve above — 0 = linear.
	{"ADSR", "releaseCurve", {-1.0, 1.0, 0.0, ""}},
	// F-A10-17 / C2: the shared decay row's 0 minimum is right for an ADSR
	// stage and wrong for a tail (both editor surfaces say 0.1), and its 0.1
	// default was a 0.1 s room where the editor means a 3 s hall. Backfilled
	// 3->4.
	{"Reverb", "decay", {0.1, 10.0, 3.0, "s"}},
	// C2: editor 0.75, generic gain row 1.0. Backfilled 3->4.
	{"Gain", "gain", {0.0, 4.0, 0.75, "x"}},
	// C2: editor 20000 (0..1 -> 0..20000 Hz is the Mapper's canonical job),
	// generic row 1. Bounds stay unbounded. Backfilled 3->4.
	{"Mapper", "outMax", {-1.0e6, 1.0e6, 20000.0, ""}},
	// The post-shaper one-pole lowpass; the generic table has no tone row.
	{"Distortion", "tone", {100.0, 20000.0, 4000.0, "Hz"}},
	// Post-distortion makeup gain (packet B1; F-A06-10). Default 1.0 —
	// bit-identical for every patch that never authored it. Matches the
	// generic gain row's 0..4 span, and the generator clamps to the same
	// bounds at point of use.
	{"Distortion", "outputGain", {0.0, 4.0, 1.0, "x"}},
	// C5 (F-A02-7): the FM Operator's output level. An exposed-but-untouched
	// operator must stay at the unity it always emitted (the SKB-051 class).
	{"FmOperator", "amplitude", {0.0, 1.0, 1.0, ""}},
	// C5 (F-A07-7): 0 = the undamped comb every existing patch has; no generic
	// row carries the name.
	{"Reverb", "damping", {0.0, 1.0, 0.0, ""}},
}

PARAM_RANGE_PREFIX_RULES := [?]Param_Range_Prefix_Rule{
	// Mixer channel levels: level1, level2, ... Default 1.0 (unity), NOT the
	// wide-open unknown fallback — an exposed channel used to initialize to
	// 0.0 (silently muted) with a ±1e6 clamp.
	{"", "level", {0.0, 2.0, 1.0, "x"}},
}

// The name-keyed generic table.
PARAM_RANGE_GENERIC := [?]Param_Range_Entry{
	// Pitch / spectrum
	{"", "frequency", {20.0, 20000.0, 440.0, "Hz"}},
	{"", "cutoff", {20.0, 20000.0, 800.0, "Hz"}},
	{"", "resonance", {0.1, 20.0, 1.0, "Q"}},
	{"", "phase", {0.0, 360.0, 0.0, "deg"}},
	// A8: was {0.0, 1.0}. The oscillator's point-of-use clamp is
	// math.clamp(f32(pw), 0.01, 0.99) and BOTH editor surfaces already say
	// 0.01..0.99 — this row was the only copy claiming 0..1, so an exposed
	// pulseWidth minted a set_pulseWidth advertising a range 2% of which the
	// DSP silently discarded.
	{"", "pulseWidth", {0.01, 0.99, 0.5, ""}},

	// Envelope
	// A8: attack/decay/release min was 0.001. Zero is a SUPPORTED value in the
	// engine: the generated envelope branches on `if (attack) > 0 ... else
	// envelope = 1.0` and wraps every stage denominator in math.max(x,
	// 0.000001) so a literal 0 means instant. This row was the only copy
	// forbidding it, so ADSR_set_attack(p, 0) clamped an instant attack up to
	// 1 ms.
	{"", "attack", {0.0, 10.0, 0.1, "s"}},
	{"", "decay", {0.0, 10.0, 0.1, "s"}},
	{"", "sustain", {0.0, 1.0, 0.7, ""}},
	{"", "release", {0.0, 10.0, 0.2, "s"}},
	{"", "depth", {0.0, 1.0, 1.0, ""}},
	{"", "velocitySensitivity", {0.0, 1.0, 0.5, ""}},

	// Effects
	{"", "delayTime", {0.0, 2.0, 0.5, "s"}},
	// A8: max was 0.99. The delay's point-of-use clamp is
	// math.clamp(f32(fdbk), 0.0, 0.95) — feedback at or above 1 diverges and
	// NaN-latches the processor. No saved patch ever SOUNDED like 0.99, so
	// this removed a lie, not behaviour.
	{"", "feedback", {0.0, 0.95, 0.5, ""}},
	{"", "preDelay", {0.0, 0.25, 0.02, "s"}},
	{"", "wetDryMix", {0.0, 1.0, 0.5, ""}},
	{"", "mix", {0.0, 1.0, 0.5, ""}},
	{"", "drive", {1.0, 100.0, 20.0, "x"}},

	// Mixers / amplitude
	{"", "gain", {0.0, 4.0, 1.0, "x"}},
	{"", "amplitude", {0.0, 1.0, 0.5, ""}},
	{"", "pan", {-1.0, 1.0, 0.0, ""}},

	// Modulation
	{"", "rate", {0.1, 100.0, 10.0, "Hz"}},
	{"", "modIndex", {0.0, 1000.0, 100.0, ""}},

	// Mapper / range nodes
	{"", "inMin", {-1.0e6, 1.0e6, 0.0, ""}},
	{"", "outMin", {-1.0e6, 1.0e6, 0.0, ""}},
	{"", "inMax", {-1.0e6, 1.0e6, 1.0, ""}},
	{"", "outMax", {-1.0e6, 1.0e6, 1.0, ""}},

	// Global / project
	{"", "bpm", {20.0, 999.0, 120.0, "bpm"}},

	// Instrument-level exposure is currently dormant: these values do not
	// produce setters/PARAMS rows. Keep this fallback aligned with the
	// editor/serializer's compile-time polyphony contract.
	{"", "voiceCount", {1.0, 32.0, 8.0, ""}},
	{"", "unison", {1.0, 16.0, 1.0, ""}},
	{"", "detune", {0.0, 100.0, 5.0, "cents"}},
	{"", "glide", {0.0, 5.0, 0.05, "s"}},
	// G5 (roadmap 9.18): per-trigger random pitch spread, uniform in
	// ±pitchJitter cents. Default 0 emits no jitter code at all, so an
	// untouched Instrument's output stays byte-identical (KI-018's stealMode
	// sibling — a value read at codegen time, not a runtime-exposed field).
	{"", "pitchJitter", {0.0, 100.0, 0.0, "cents"}},
	// G5: per-trigger random velocity spread, uniform in ±velocityJitter,
	// clamped back into [0,1] same as note_on's own velocity clamp. Default 0
	// emits no jitter code.
	{"", "velocityJitter", {0.0, 1.0, 0.0, ""}},
}

// Unknown parameter: wide-open range, neutral default. Caller can still expose
// this; the clamp simply won't bite.
PARAM_RANGE_FALLBACK :: Param_Range{-1.0e6, 1.0e6, 0.0, ""}
