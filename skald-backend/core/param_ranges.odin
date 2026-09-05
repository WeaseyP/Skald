package skald_core

// Default min/max/default/unit for known parameter names. The codegen reads
// this at codegen-time to clamp typed setters and to populate the
// introspectable <Foo>_PARAMS table on each generated processor.
//
// These ranges are conservative (covering audible-range frequencies, time
// constants from 1ms to 10s, normalized 0-1 mix/feedback, etc.) and match
// the ranges sliders use in the UI's parameter panel. If the UI later sends
// per-parameter ranges in the JSON contract, the codegen can prefer those
// over this fallback table.
//
// ---------------------------------------------------------------------------
// ROADMAP PACKET A8 — this table is DATA, on purpose.
//
// It used to be a pair of `switch` statements inside `lookup_param_range`,
// which meant the set of (node_type, name) keys existed only as control flow:
// callable, but not enumerable. That is why six UI/backend range mismatches
// shipped and four of them were fixed once and re-found later (BUGS.md
// SKB-049, SKB-050, SKB-051, SKB-024) — nothing could list the contract in
// order to compare it against the editor.
//
// `tools/param_range_dump` walks the arrays below, calls
// `lookup_param_range` for each key, and prints the results as JSON;
// `skald-ui/src/tests/contracts/RangeParity.test.ts` asserts the editor's
// bounds against that JSON. So:
//
//   * Adding a range = adding a row here. It is dumped and gated automatically.
//   * Adding a special case to the PROC BODY instead of a row here makes it
//     invisible to the dump. Don't. If a rule genuinely cannot be a row (see
//     PARAM_RANGE_PREFIX_RULES) it must be declared as data too.
// ---------------------------------------------------------------------------

import "core:strings"

Param_Range :: struct {
	min:     f32,
	max:     f32,
	default: f32,
	unit:    string,
}

// One row of the range contract.
//
//	node_type == ""  the name-keyed generic table (any node type)
//	node_type != ""  a node-type-scoped override, consulted BEFORE the
//	                 generic table and before the prefix rules
Param_Range_Entry :: struct {
	node_type: string,
	name:      string,
	range:     Param_Range,
}

// A rule that matches by prefix rather than by exact name, so its key set is
// open-ended and cannot be enumerated as rows. Kept as data anyway so the dump
// can emit the rule itself (and sample it) instead of the dump restating it.
Param_Range_Prefix_Rule :: struct {
	node_type: string, // "" = applies to every node type
	prefix:    string,
	range:     Param_Range,
}

// Node-type-specific overrides. The name-keyed table below is wrong for these
// (an exposed FM ratio got a Hz-calibrated [20,20000] setter; an exposed LFO
// frequency clamped to audio range).
PARAM_RANGE_OVERRIDES := [?]Param_Range_Entry{
	{"FmOperator", "frequency", {0.01, 32.0, 1.0, "ratio"}},
	{"LFO", "frequency", {0.01, 100.0, 5.0, "Hz"}},
	{"LFO", "amplitude", {0.0, 20000.0, 1.0, ""}},
	{"SampleHold", "rate", {0.1, 1000.0, 10.0, "Hz"}},
	// The generic "amplitude" default below is 0.5, but the Noise generator's
	// own fallback and the editor's default are both 1.0 (unity) — so exposing
	// an untouched Noise amplitude used to halve it. Same class as the LFO
	// amplitude override above. (SKB-051, closed in 08d5875.)
	{"Noise", "amplitude", {0.0, 1.0, 1.0, ""}},
	{"Wavetable", "position", {0.0, 3.0, 0.0, ""}},
	{"Distortion", "tone", {100.0, 20000.0, 4000.0, "Hz"}},
	// Post-distortion makeup/output gain (packet B1; F-A06-10). Default 1.0 —
	// bit-identical for every patch that never authored it. Matches the
	// generic "gain" row's 0..4 span, and the generator clamps to the same
	// bounds at point of use.
	{"Distortion", "outputGain", {0.0, 4.0, 1.0, "x"}},
	// C5 (F-A02-7): the FM Operator's output level. The generic "amplitude"
	// row defaults to 0.5; an exposed-but-untouched operator must stay at the
	// unity it always emitted (the SKB-051 class, same as the Noise row).
	{"FmOperator", "amplitude", {0.0, 1.0, 1.0, ""}},
	// C5 (F-A07-7): Reverb damping. 0 = the undamped comb every existing
	// patch has; no generic row carries the name.
	{"Reverb", "damping", {0.0, 1.0, 0.0, ""}},
	// NOTE (SKB-024, deliberately absent): a `{"Wavetable", "amplitude",
	// {0.0, 1.0, 1.0, ""}}` row belongs here byte-for-byte like the Noise row
	// above, and is NOT added. The generic 0.5 stands because correcting it
	// makes an already-shipped patch with an exposed-but-unstored Wavetable
	// amplitude 6 dB louder. Owned by packet C2 (+ C1's version field); the
	// parity gate carries a commented allowlist entry naming it.
}

// Mixer channel levels: level1, level2, ... Default 1.0 (unity), NOT the
// wide-open unknown fallback — an exposed channel used to initialize to 0.0
// (silently muted) with a ±1e6 clamp.
PARAM_RANGE_PREFIX_RULES := [?]Param_Range_Prefix_Rule{
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
	// `math.clamp(f32(pw), 0.01, 0.99)` (codegen.odin, square-wave phase
	// compare) and BOTH editor surfaces already say 0.01..0.99 — this row was
	// the only copy claiming 0..1, so an exposed pulseWidth minted a
	// `set_pulseWidth` advertising a range 2% of which the DSP silently
	// discarded. Narrowing the SETTER to what the DSP does cannot change any
	// audio (the DSP clamps either way) and cannot invalidate a saved value
	// (the table is not consulted when reading a patch).
	{"", "pulseWidth", {0.01, 0.99, 0.5, ""}},

	// Envelope
	// A8: attack/decay/release min was 0.001. Zero is a SUPPORTED value in the
	// engine, not an accident: the generated envelope branches on
	// `if (attack) > 0 ... else envelope = 1.0` and wraps every stage
	// denominator in `math.max(x, 0.000001)` specifically so a literal 0 means
	// "instant". Both editor surfaces offer 0. This row was the only copy
	// forbidding it, so `ADSR_set_attack(p, 0)` clamped an instant attack up to
	// 1 ms and no host could ask for a click. Widening a clamp cannot change an
	// existing value.
	{"", "attack", {0.0, 10.0, 0.1, "s"}},
	{"", "decay", {0.0, 10.0, 0.1, "s"}},
	{"", "sustain", {0.0, 1.0, 0.7, ""}},
	{"", "release", {0.0, 10.0, 0.2, "s"}},
	{"", "depth", {0.0, 1.0, 1.0, ""}},
	{"", "velocitySensitivity", {0.0, 1.0, 0.5, ""}},

	// Effects
	{"", "delayTime", {0.0, 2.0, 0.5, "s"}},
	// A8: max was 0.99. The delay's point-of-use clamp is
	// `math.clamp(f32(fdbk), 0.0, 0.95)` — chosen for stability, since feedback
	// at or above 1 diverges geometrically and NaN-latches the whole processor.
	// The node card already said 0.95. So 0.99 here was a fourth answer to one
	// question (card 0.95 / sidebar 1.0 / this row 0.99 / DSP 0.95) and the only
	// one nothing enforced. No saved patch ever SOUNDED like 0.99, because the
	// DSP has always clamped to 0.95 — so this is removing a lie, not changing
	// behaviour. The sidebar's 1.0 is still wrong and is allowlisted in
	// RangeParity.test.tsx against the packet that owns the editor file.
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
}

// Unknown parameter: wide-open range, neutral default. Caller can still expose
// this; the clamp simply won't bite.
PARAM_RANGE_FALLBACK :: Param_Range{-1.0e6, 1.0e6, 0.0, ""}

lookup_param_range :: proc(name: string, node_type := "") -> Param_Range {
	// Node-type-specific overrides first.
	if node_type != "" {
		for entry in PARAM_RANGE_OVERRIDES {
			if entry.node_type == node_type && entry.name == name {
				return entry.range
			}
		}
	}

	for rule in PARAM_RANGE_PREFIX_RULES {
		if rule.node_type != "" && rule.node_type != node_type {
			continue
		}
		// `len(name) > len(prefix)`: the bare prefix ("level") is not itself a
		// channel fader and must fall through to the generic table.
		if strings.has_prefix(name, rule.prefix) && len(name) > len(rule.prefix) {
			return rule.range
		}
	}

	for entry in PARAM_RANGE_GENERIC {
		if entry.name == name {
			return entry.range
		}
	}

	return PARAM_RANGE_FALLBACK
}
