#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet A8 — Odin unit layer for the parameter contract
// (finding F-B11-8: "backend has no unit-test layer").
//
// Two procs are under test:
//
//   core.lookup_param_range(name, node_type) -> Param_Range
//       The name-keyed table. Precedence is the whole contract:
//       node-type override > prefix rule > generic name > wide-open
//       fallback. Every one of the six historical range mismatches was a
//       disagreement about one row of it (SKB-024/049/050/051).
//
//   core.exposed_param_default(node, name, fallback) -> f32
//       What a parameter marked "expose" actually initializes the
//       generated field to. This is where "exposing an untouched
//       Wavetable amplitude changes the sound by 6 dB" lives: the range
//       default only reaches the field when the node stores NOTHING
//       usable under that name, and "usable" means specifically a JSON
//       number. A string, a bool, a null or an absent key all fall
//       through — and each of those is reachable from a real save
//       (`waveform: "Sine"`, `bpmSync: false`, a pre-parameter patch).
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:testing"

// --- helpers ---------------------------------------------------------

// A node with an explicit parameter map, so each test states exactly the
// stored shape it is exercising.
node_with :: proc(node_type: string, params: json.Object) -> core.Node {
	return core.Node{id = "n1", raw_id = "n1", type = node_type, parameters = params}
}

expect_range :: proc(
	t: ^testing.T,
	name: string,
	node_type: string,
	min, max, def: f32,
	unit: string,
	loc := #caller_location,
) {
	r := core.lookup_param_range(name, node_type)
	testing.expectf(
		t,
		r.min == min && r.max == max && r.default == def && r.unit == unit,
		// No literal braces: Odin's fmt parses `{` as a directive opener and the
		// message degrades to "%!(MISSING CLOSE BRACE)".
		"lookup_param_range(%q, %q) = [min=%v max=%v default=%v unit=%q], want [min=%v max=%v default=%v unit=%q]",
		name,
		node_type,
		r.min,
		r.max,
		r.default,
		r.unit,
		min,
		max,
		def,
		unit,
		loc = loc,
	)
}

// =====================================================================
// lookup_param_range
// =====================================================================

@(test)
test_generic_name_keyed_hit :: proc(t: ^testing.T) {
	// A representative row from each block of the generic table, including
	// the unit string — `unit` is emitted into the generated PARAMS metadata,
	// so a wrong unit is a shipped API defect, not cosmetic.
	expect_range(t, "cutoff", "", 20.0, 20000.0, 800.0, "Hz")
	// A8 widened attack/decay/release min from 0.001 to 0: the generated
	// envelope has an explicit `if attack > 0 ... else 1.0` branch, so an
	// instant attack is a supported value the setter used to forbid.
	expect_range(t, "attack", "", 0.0, 10.0, 0.1, "s")
	expect_range(t, "release", "", 0.0, 10.0, 0.2, "s")
	// A8 narrowed pulseWidth to the DSP's own point-of-use clamp, and feedback
	// max to the delay's stability clamp. Both were the only copy disagreeing
	// with the engine.
	expect_range(t, "pulseWidth", "", 0.01, 0.99, 0.5, "")
	expect_range(t, "feedback", "", 0.0, 0.95, 0.5, "")
	expect_range(t, "pan", "", -1.0, 1.0, 0.0, "")
	expect_range(t, "drive", "", 1.0, 100.0, 20.0, "x")
	expect_range(t, "resonance", "", 0.1, 20.0, 1.0, "Q")
	expect_range(t, "detune", "", 0.0, 100.0, 5.0, "cents")
	expect_range(t, "phase", "", 0.0, 360.0, 0.0, "deg")
}

@(test)
test_bpm_range_and_boundary :: proc(t: ^testing.T) {
	// SKB-050, RESOLVED. The editor used to clamp BPM to 20..300 while this
	// row said 20..999 — the one still-open member of the original four
	// range mismatches, watched by RangeParity.test.tsx's KNOWN_DIVERGENCES
	// allowlist. The editor's `BPM_MAX` was raised to 999 to match this row
	// (not the other way around: this 20..999 range predates the A8 gate
	// entirely, matches the conventional DAW tempo ceiling, and nothing in
	// the example corpus or the step accumulator in codegen.odin assumes an
	// upper bound below it — see bpm.ts for the full reasoning). The
	// allowlist entry pinning the mismatch, and the gate's dedicated
	// "still open" test, were both deleted rather than updated, per the
	// gate's own "if it was fixed, DELETE this entry" rule.
	expect_range(t, "bpm", "", 20.0, 999.0, 120.0, "bpm")

	// The boundary itself: 20 and 999 are the last values still inside the
	// contract; 19 and 1000 are the first values outside it in either
	// direction. There is no runtime BPM setter yet (BUGS.md SKB-050's
	// "harmless until a runtime BPM setter ships" note), so this row is
	// consulted only by the range-dump/parity gate today — pinning the
	// boundary here is what proves the CONTRACT the gate reads from,
	// mirroring `clampBpm`'s boundary test on the editor side.
	r := core.lookup_param_range("bpm", "")
	testing.expect(t, 20.0 >= r.min && 20.0 <= r.max, "20 (min boundary) must be inside the bpm range")
	testing.expect(t, 999.0 >= r.min && 999.0 <= r.max, "999 (max boundary) must be inside the bpm range")
	testing.expect(t, 19.0 < r.min, "19 must be outside the bpm range (below min)")
	testing.expect(t, 1000.0 > r.max, "1000 must be outside the bpm range (above max)")
}

@(test)
test_multi_name_cases_are_distinct_rows :: proc(t: ^testing.T) {
	// `wetDryMix`/`mix` and `inMin`/`outMin` used to share one switch case.
	// As data they are separate rows, so this pins that they still agree —
	// the failure mode of splitting a shared case is editing one copy.
	a := core.lookup_param_range("wetDryMix", "")
	b := core.lookup_param_range("mix", "")
	testing.expect(t, a == b, "wetDryMix and mix must resolve identically")

	testing.expect(
		t,
		core.lookup_param_range("inMin", "") == core.lookup_param_range("outMin", ""),
		"inMin and outMin must resolve identically",
	)
	testing.expect(
		t,
		core.lookup_param_range("inMax", "") == core.lookup_param_range("outMax", ""),
		"inMax and outMax must resolve identically",
	)
	// inMin defaults 0 and inMax defaults 1: NOT interchangeable.
	testing.expect(
		t,
		core.lookup_param_range("inMin", "").default != core.lookup_param_range("inMax", "").default,
		"inMin and inMax must not have the same default",
	)
}

@(test)
test_node_type_override_wins_over_generic :: proc(t: ^testing.T) {
	// The generic rows these shadow, for contrast:
	//   frequency 20..20000 Hz / 440   amplitude 0..1 / 0.5   rate 0.1..100 / 10
	expect_range(t, "frequency", "FmOperator", 0.01, 32.0, 2.0, "ratio") // default 2 = the editor's (C2)
	expect_range(t, "frequency", "LFO", 0.01, 100.0, 5.0, "Hz")
	expect_range(t, "amplitude", "LFO", 0.0, 20000.0, 1.0, "")
	expect_range(t, "rate", "SampleHold", 0.1, 1000.0, 10.0, "Hz")
	expect_range(t, "tone", "Distortion", 100.0, 20000.0, 4000.0, "Hz")
	expect_range(t, "position", "Wavetable", 0.0, 3.0, 0.0, "")

	// SKB-051, the regression this whole override mechanism was built for and
	// then omitted: the generic `amplitude` default is 0.5, so exposing an
	// untouched Noise amplitude halved it (-6 dB).
	expect_range(t, "amplitude", "Noise", 0.0, 1.0, 1.0, "")
	testing.expect(
		t,
		core.lookup_param_range("amplitude", "Noise").default !=
		core.lookup_param_range("amplitude", "").default,
		"the Noise amplitude override must still differ from the generic row, or SKB-051 has regressed",
	)
}

@(test)
test_override_does_not_leak_to_other_types_or_names :: proc(t: ^testing.T) {
	// An override is scoped to (node_type, name). Both halves of that key
	// matter: LFO.frequency must not affect Oscillator.frequency, and it must
	// not affect LFO.cutoff.
	expect_range(t, "frequency", "Oscillator", 20.0, 20000.0, 440.0, "Hz")
	expect_range(t, "cutoff", "LFO", 20.0, 20000.0, 800.0, "Hz")
	// An empty node_type must never match an override.
	expect_range(t, "frequency", "", 20.0, 20000.0, 440.0, "Hz")
	// A node type with no overrides at all falls straight through.
	expect_range(t, "amplitude", "Oscillator", 0.0, 1.0, 0.5, "")
}

@(test)
test_wavetable_amplitude_row_is_applied :: proc(t: ^testing.T) {
	// SKB-024, CLOSED by packet C2. This test used to assert the bug on
	// purpose (the generic 0.5) so that landing the row would fail it and
	// remind whoever did so to delete the matching allowlist entry in
	// RangeParity.test.tsx — done. The row is safe now because the 3->4 save
	// migration stores 0.5 on any exposed-but-unstored Wavetable amplitude
	// first, so a patch that generated at 0.5 keeps generating at 0.5; a fresh
	// node stores 1.0 and now generates at what its card shows.
	expect_range(t, "amplitude", "Wavetable", 0.0, 1.0, 1.0, "")
	expect_range(t, "amplitude", "SampleHold", 0.0, 1.0, 1.0, "")
}

@(test)
test_level_prefix_rule :: proc(t: ^testing.T) {
	// Mixer faders are `level1`, `level2`, ... — an open-ended key set that
	// cannot be table rows, so it is a prefix rule. Default 1.0 (unity), NOT
	// the wide-open fallback: an exposed channel used to initialize to 0.0,
	// silently muted, with a +-1e6 clamp.
	for name in ([]string{"level1", "level2", "level8", "level12", "level99"}) {
		expect_range(t, name, "Mixer", 0.0, 2.0, 1.0, "x")
	}
	// The rule is node-type agnostic (node_type "" in the rule table), which
	// is deliberate: the codegen looks up `level<n>` before it has decided the
	// node is a Mixer.
	expect_range(t, "level1", "", 0.0, 2.0, 1.0, "x")
	expect_range(t, "level1", "Oscillator", 0.0, 2.0, 1.0, "x")
}

@(test)
test_level_prefix_boundary :: proc(t: ^testing.T) {
	// The bare prefix is not a fader. `len(name) > len(prefix)` is the guard;
	// dropping it would give a parameter literally named "level" the fader
	// range instead of the fallback.
	fb := core.PARAM_RANGE_FALLBACK
	expect_range(t, "level", "Mixer", fb.min, fb.max, fb.default, fb.unit)
	// Non-numeric suffixes still match the prefix rule. That is the current
	// behaviour and it is benign (no such parameter exists), but it is stated
	// here so a future tightening to digits-only is a deliberate edit.
	expect_range(t, "levelX", "Mixer", 0.0, 2.0, 1.0, "x")
	// Names that merely CONTAIN "level" do not match — has_prefix, not contains.
	expect_range(t, "sublevel1", "Mixer", fb.min, fb.max, fb.default, fb.unit)
}

@(test)
test_unknown_parameter_falls_back_wide_open :: proc(t: ^testing.T) {
	fb := core.PARAM_RANGE_FALLBACK
	expect_range(t, "totallyMadeUpParameter", "", fb.min, fb.max, fb.default, fb.unit)
	expect_range(t, "", "", fb.min, fb.max, fb.default, fb.unit)
	// Parameters the editor shows but the range table has no opinion on.
	// Listed so that giving one of them a row is a deliberate change.
	expect_range(t, "volume", "Instrument", fb.min, fb.max, fb.default, fb.unit)
	expect_range(t, "inputCount", "Mixer", fb.min, fb.max, fb.default, fb.unit)
	// The fallback is wide-open-but-neutral by design: the clamp must not bite,
	// and the default must not inject a value.
	testing.expect(t, fb.default == 0.0, "fallback default must be neutral 0")
	testing.expect(t, fb.min < 0.0 && fb.max > 0.0, "fallback must straddle zero")
}

@(test)
test_table_has_no_duplicate_keys :: proc(t: ^testing.T) {
	// The table is scanned linearly and the FIRST match wins, so a duplicate
	// key is a row that can never be reached — exactly how a "fixed once,
	// re-found later" mismatch survives an edit. Now that the table is data,
	// this is checkable.
	seen := make(map[string]bool)
	defer delete(seen)
	for e in core.PARAM_RANGE_OVERRIDES {
		// node_type and name are both ASCII identifiers containing no NUL, so
		// a NUL join is an unambiguous composite key.
		ck := concat_key(e.node_type, e.name)
		defer delete(ck)
		testing.expectf(t, e.node_type != "", "override row %q must name a node type", e.name)
		testing.expectf(t, !seen[ck], "duplicate override row for (%q, %q)", e.node_type, e.name)
		seen[ck] = true
	}
	for e in core.PARAM_RANGE_GENERIC {
		testing.expectf(t, e.node_type == "", "generic row %q must have an empty node_type", e.name)
		ck := concat_key(e.node_type, e.name)
		defer delete(ck)
		testing.expectf(t, !seen[ck], "duplicate generic row for %q", e.name)
		seen[ck] = true
	}
}

concat_key :: proc(a, b: string) -> string {
	buf := make([]byte, len(a) + 1 + len(b))
	copy(buf[:], a)
	buf[len(a)] = 0
	copy(buf[len(a) + 1:], b)
	return string(buf)
}

// =====================================================================
// exposed_param_default — one case per JSON value type the parameter
// store can hold. `#partial switch` in the implementation means only
// Float and Integer are honoured; everything else must fall through to
// the caller's fallback rather than coercing or zeroing.
// =====================================================================

@(test)
test_exposed_default_json_float :: proc(t: ^testing.T) {
	params := json.Object{"amplitude" = json.Float(0.25)}
	defer delete(params)
	n := node_with("Oscillator", params)
	got := core.exposed_param_default(n, "amplitude", 0.5)
	testing.expectf(t, got == 0.25, "stored Float must win over the fallback: got %v, want 0.25", got)
}

@(test)
test_exposed_default_json_integer :: proc(t: ^testing.T) {
	// JSON has one number type but the parser splits it: `"amplitude": 1`
	// arrives as Integer, `1.0` as Float. Only handling Float is a real
	// historical shape of this bug — an integer-valued save read as absent.
	params := json.Object{"voiceCount" = json.Integer(16)}
	defer delete(params)
	n := node_with("Instrument", params)
	got := core.exposed_param_default(n, "voiceCount", 8.0)
	testing.expectf(t, got == 16.0, "stored Integer must win over the fallback: got %v, want 16", got)

	// And an integral amplitude of 1 must not be mistaken for absent, which
	// would re-open SKB-051 from the other direction.
	p2 := json.Object{"amplitude" = json.Integer(1)}
	defer delete(p2)
	n2 := node_with("Wavetable", p2)
	got2 := core.exposed_param_default(n2, "amplitude", 0.5)
	testing.expectf(t, got2 == 1.0, "integral 1 must read as 1.0, got %v", got2)
}

@(test)
test_exposed_default_json_string :: proc(t: ^testing.T) {
	// A string-valued parameter is not parsed. It must yield the fallback, not
	// 0 and not a parse attempt. Reachable today: `waveform`, `syncRate`,
	// `tableName`, `type` are all strings on nodes that also expose numbers,
	// and a hand-edited or older save can put "0.8" where a number belongs.
	params := json.Object{"amplitude" = json.String("0.8")}
	defer delete(params)
	n := node_with("Oscillator", params)
	got := core.exposed_param_default(n, "amplitude", 0.5)
	testing.expectf(t, got == 0.5, "String must fall through to the fallback: got %v, want 0.5", got)
}

@(test)
test_exposed_default_json_bool :: proc(t: ^testing.T) {
	// `bpmSync` and `useMpe` are Booleans living in the same map. A bool must
	// not coerce to 0/1.
	params := json.Object{"depth" = json.Boolean(true)}
	defer delete(params)
	n := node_with("ADSR", params)
	got := core.exposed_param_default(n, "depth", 1.0)
	testing.expectf(t, got == 1.0, "Boolean must fall through to the fallback: got %v, want 1.0", got)

	// The stronger form: `false` must not become 0.0.
	p2 := json.Object{"depth" = json.Boolean(false)}
	defer delete(p2)
	n2 := node_with("ADSR", p2)
	got2 := core.exposed_param_default(n2, "depth", 0.75)
	testing.expectf(t, got2 == 0.75, "Boolean false must not read as 0: got %v, want 0.75", got2)
}

@(test)
test_exposed_default_json_null :: proc(t: ^testing.T) {
	params := json.Object{"release" = json.Null{}}
	defer delete(params)
	n := node_with("ADSR", params)
	got := core.exposed_param_default(n, "release", 0.2)
	testing.expectf(t, got == 0.2, "Null must fall through to the fallback: got %v, want 0.2", got)
}

@(test)
test_exposed_default_absent :: proc(t: ^testing.T) {
	// The SKB-024/SKB-051 case: the key is not present at all, so the range
	// table's default is what the generated field initializes to. Since C2 that
	// default is the editor's (1.0); files that relied on the old 0.5 had it
	// stored by the 3->4 save migration before this row changed.
	params := json.Object{}
	defer delete(params)
	n := node_with("Wavetable", params)

	rng := core.lookup_param_range("amplitude", "Wavetable")
	got := core.exposed_param_default(n, "amplitude", rng.default)
	testing.expectf(
		t,
		got == 1.0,
		"an absent Wavetable amplitude resolves to the unified 1.0 (SKB-024 closed by C2): got %v",
		got,
	)
	// Contrast: Noise has an override, so the same absent shape resolves to
	// unity. Same code path, different row — that is the fix SKB-024 needs.
	pn := json.Object{}
	defer delete(pn)
	nn := node_with("Noise", pn)
	rn := core.lookup_param_range("amplitude", "Noise")
	gn := core.exposed_param_default(nn, "amplitude", rn.default)
	testing.expectf(t, gn == 1.0, "an absent Noise amplitude must resolve to unity: got %v", gn)
}

@(test)
test_exposed_default_array_falls_through :: proc(t: ^testing.T) {
	// json.Array is the remaining Value variant. `levels` is stored as one, so
	// this shape is live; asking for it as a scalar must fall back.
	arr := json.Array{json.Float(0.25)}
	defer delete(arr)
	params := json.Object{"levels" = arr}
	defer delete(params)
	n := node_with("Mixer", params)
	got := core.exposed_param_default(n, "levels", 0.9)
	testing.expectf(t, got == 0.9, "Array must fall through to the fallback: got %v, want 0.9", got)
}

@(test)
test_exposed_default_mixer_levels_resolution :: proc(t: ^testing.T) {
	// Mixer faders are authored nested in `levels` but exposed under the flat
	// names `level1`, `level2`, ... — so the generic lookup would hand back
	// the range default (unity) and silently reset the mix on exposure.
	// The UI shape is [{id, level, pan}, ...].
	ch1 := json.Object{"id" = json.Integer(1), "level" = json.Float(0.25), "pan" = json.Float(0)}
	defer delete(ch1)
	ch2 := json.Object{"id" = json.Integer(2), "level" = json.Integer(2), "pan" = json.Float(0)}
	defer delete(ch2)
	arr := json.Array{ch1, ch2}
	defer delete(arr)
	params := json.Object{"levels" = arr}
	defer delete(params)
	n := node_with("Mixer", params)

	fallback := core.lookup_param_range("level1", "Mixer").default
	testing.expectf(t, fallback == 1.0, "level fader fallback should be unity, got %v", fallback)

	got1 := core.exposed_param_default(n, "level1", fallback)
	testing.expectf(t, got1 == 0.25, "level1 must resolve from levels[0].level: got %v, want 0.25", got1)

	// Integer-valued nested level, same split-number-type trap as above.
	got2 := core.exposed_param_default(n, "level2", fallback)
	testing.expectf(t, got2 == 2.0, "level2 must resolve an Integer nested level: got %v, want 2", got2)

	// Past the end of the array -> fallback, not 0 (0 is silence).
	got3 := core.exposed_param_default(n, "level3", fallback)
	testing.expectf(t, got3 == fallback, "level3 past the array end must use the fallback: got %v", got3)

	// The nested resolution is Mixer-scoped: the same param name on another
	// node type must not go looking for `levels`.
	other := node_with("Oscillator", params)
	got4 := core.exposed_param_default(other, "level1", fallback)
	testing.expectf(t, got4 == fallback, "level1 on a non-Mixer must not read `levels`: got %v", got4)

	// A flat stored `level1` outranks the nested array — stored value first.
	flat := json.Object{"level1" = json.Float(0.1), "levels" = arr}
	defer delete(flat)
	nf := node_with("Mixer", flat)
	got5 := core.exposed_param_default(nf, "level1", fallback)
	testing.expectf(t, got5 == 0.1, "a flat stored level1 must win over levels[]: got %v, want 0.1", got5)
}

@(test)
test_exposed_default_mixer_bare_level_is_not_a_channel :: proc(t: ^testing.T) {
	// "level" with no digits is not channel 0 and must not index the array.
	arr := json.Array{json.Float(0.25)}
	defer delete(arr)
	params := json.Object{"levels" = arr}
	defer delete(params)
	n := node_with("Mixer", params)
	got := core.exposed_param_default(n, "level", 0.77)
	testing.expectf(t, got == 0.77, "bare `level` must not resolve a channel: got %v, want 0.77", got)
}
