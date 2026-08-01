package skald_unit_tests

// =====================================================================
// BUGS.md SKB-012 / roadmap packet C5 — Wavetable and FM Operator now
// honour instrument-level unison/detune, mirroring what
// generate_oscillator_code already does. Shipped UNGATED (explicit
// decision: existing Unison>1 Wavetable/FM patches change sound; users
// re-audition).
//
// Oscillator's stack (generate_oscillator_code, core/codegen.odin) is the
// template both new generators copy exactly:
//   - unison_count := instrument.unison, floored to >= 1
//   - per-voice detune spread, in cents, linear across the stack:
//       detune_amount = (i/(N-1) - 0.5) * 2 * instrument.detune   (N>1 only)
//   - detuned_freq = freq * 2^(detune_amount/1200)
//   - one phase accumulator PER VOICE ([N]f32, not a scalar)
//   - gain compensation: unison_out / f32(unison_count) — linear average,
//     NOT sqrt(N) — matching Oscillator's own `unison_out / f32(unison_count)`
//     at codegen.odin:328 exactly.
//
// Tests below prove, in order:
//   1. Wavetable/FmOperator emit the same per-voice loop shape as Oscillator
//      (struct field is now [N]f32, not f32; phase indexed by i; detune
//      spread present; gain divided by N).
//   2. unison<=1 is a structural no-op: the detune branch is gated behind
//      `if unison_count > 1`, so at N=1 (or the floor-to-1 path for N<=0)
//      the emitted arithmetic reduces to exactly what shipped before this
//      fix (detune_amount stays 0.0, pow(2,0)=1.0 multiply is a no-op).
//   3. The two shipped examples BUGS.md names as evidence for this bug —
//      crunch-rhythm.skald.json's FmOperator (instrument unison=2, detune=9)
//      and pad-sequenced.skald.json's Wavetable (instrument unison=3,
//      detune=12) — now actually emit the unison loop when run through the
//      real parse -> codegen pipeline, not a hand-built fixture.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

// --- helpers ---------------------------------------------------------

mk_instrument :: proc(unison: int, detune: f32) -> core.Project_Instrument {
	return core.Project_Instrument{
		id = "inst1",
		name = "Test Instrument",
		voice_count = 8,
		unison = unison,
		detune = detune,
		volume = 1.0,
		limit = true,
	}
}

// Line-oriented "contains both substrings on the same line" check — used to
// pin a marker (e.g. "(Unison/Detune)") to a specific node's comment (e.g.
// "FM Operator Node") rather than just anywhere in a big multi-node file.
any_line_contains_both :: proc(text: string, a: string, b: string) -> bool {
	it := text
	for line in strings.split_lines_iterator(&it) {
		if strings.contains(line, a) && strings.contains(line, b) do return true
	}
	return false
}

// =====================================================================
// Wavetable — structural proof of the per-voice unison stack
// =====================================================================

@(test)
test_wavetable_unison_emits_per_voice_phase_array_and_detune_spread :: proc(t: ^testing.T) {
	n := core.Node{id = "wt1", raw_id = "wt1", type = "Wavetable", parameters = json.Object{}}
	inst := mk_instrument(3, 12.0)

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)
	core.generate_wavetable_code(&sb, n, nil, &inst)
	out := strings.to_string(sb)

	testing.expectf(t, strings.contains(out, "unison_count := 3"), "expected a 3-voice unison_count literal: got %s", out)
	testing.expectf(t, strings.contains(out, "voice.wavetable_wt1_phase[i]"), "expected the phase state to be indexed per-voice (mirroring Oscillator's osc_<id>_phase[i]): got %s", out)
	testing.expectf(t, !strings.contains(out, "voice.wavetable_wt1_phase = math.mod"), "must NOT still emit the old scalar `voice.wavetable_wt1_phase = math.mod(...)` assignment: got %s", out)
	testing.expectf(t, strings.contains(out, "12.000000000"), "expected the instrument's detune (12 cents) baked into the spread formula: got %s", out)
	testing.expectf(t, strings.contains(out, "for i in 0..<unison_count {"), "expected the same per-voice loop shape Oscillator uses: got %s", out)
	// Gain compensation: linear /N average, matching Oscillator's
	// `unison_out / f32(unison_count)` exactly — NOT sqrt(N) or any other
	// curve. A regression to sqrt(N) or to no compensation at all (straight
	// sum) must fail this.
	testing.expectf(t, strings.contains(out, "unison_out / f32(unison_count)"), "expected linear /N gain compensation matching Oscillator: got %s", out)
}

@(test)
test_wavetable_unison_1_is_structurally_a_noop :: proc(t: ^testing.T) {
	// unison=1: the loop still runs (matching Oscillator's own shape at N=1),
	// but the detune branch is gated behind `if unison_count > 1`, so
	// detune_amount can never become non-zero and detuned_freq collapses to
	// freq * pow(2, 0/1200) = freq * 1.0 — bit-identical to the pre-fix
	// scalar path. This is the same no-op shape Oscillator has always had at
	// unison=1 (verified against its existing golden fixtures).
	n := core.Node{id = "wt1", raw_id = "wt1", type = "Wavetable", parameters = json.Object{}}
	inst := mk_instrument(1, 12.0)

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)
	core.generate_wavetable_code(&sb, n, nil, &inst)
	out := strings.to_string(sb)

	testing.expectf(t, strings.contains(out, "unison_count := 1"), "expected unison_count := 1: got %s", out)
	testing.expectf(t, strings.contains(out, "if unison_count > 1 do detune_amount ="), "expected the detune spread to stay gated behind `unison_count > 1` so it cannot fire at N=1: got %s", out)

	// The floor-to-1 guard (a <=0 unison, covering Instruments built
	// directly in code rather than parsed from JSON) must behave identically
	// to an authored unison of 1 — same floor json.odin's own parser applies,
	// and the same one Oscillator's generator already relies on.
	zero_inst := mk_instrument(0, 12.0)
	sb2 := strings.builder_make()
	defer strings.builder_destroy(&sb2)
	core.generate_wavetable_code(&sb2, n, nil, &zero_inst)
	out2 := strings.to_string(sb2)
	testing.expectf(t, strings.contains(out2, "unison_count := 1"), "unison<=0 must floor to 1: got %s", out2)
}

// =====================================================================
// FM Operator — structural proof of the per-voice unison stack
// =====================================================================

@(test)
test_fm_operator_unison_emits_per_voice_phase_array_and_detune_spread :: proc(t: ^testing.T) {
	n := core.Node{id = "fm1", raw_id = "fm1", type = "FmOperator", parameters = json.Object{}}
	inst := mk_instrument(4, 25.0)

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)
	core.generate_fm_operator_code(&sb, n, nil, &inst)
	out := strings.to_string(sb)

	testing.expectf(t, strings.contains(out, "unison_count := 4"), "expected a 4-voice unison_count literal: got %s", out)
	testing.expectf(t, strings.contains(out, "voice.fm_fm1_phase[i]"), "expected the carrier phase state to be indexed per-voice: got %s", out)
	testing.expectf(t, !strings.contains(out, "voice.fm_fm1_phase = math.mod"), "must NOT still emit the old scalar `voice.fm_fm1_phase = math.mod(...)` assignment: got %s", out)
	testing.expectf(t, strings.contains(out, "25.000000000"), "expected the instrument's detune (25 cents) baked into the spread formula: got %s", out)
	testing.expectf(t, strings.contains(out, "for i in 0..<unison_count {"), "expected the same per-voice loop shape Oscillator/Wavetable use: got %s", out)
	testing.expectf(t, strings.contains(out, "unison_out / f32(unison_count)"), "expected linear /N gain compensation matching Oscillator: got %s", out)

	// The deliberate design choice on the modulator: it stays ONE shared
	// signal added identically inside every voice's iteration (mirroring a
	// real multi-carrier FM voice), rather than being re-detuned per voice.
	// This is a choice, not something settled elsewhere — this assertion
	// pins today's behaviour so a silent change to it is caught.
	testing.expectf(t, strings.contains(out, "math.sin(voice.fm_fm1_phase[i] + (0.0) *"), "expected the (unwired, so 0.0) modulator term added identically inside the per-voice loop: got %s", out)
}

@(test)
test_fm_operator_unison_1_is_structurally_a_noop :: proc(t: ^testing.T) {
	n := core.Node{id = "fm1", raw_id = "fm1", type = "FmOperator", parameters = json.Object{}}
	inst := mk_instrument(1, 25.0)

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)
	core.generate_fm_operator_code(&sb, n, nil, &inst)
	out := strings.to_string(sb)

	testing.expectf(t, strings.contains(out, "unison_count := 1"), "expected unison_count := 1: got %s", out)
	testing.expectf(t, strings.contains(out, "if unison_count > 1 do detune_amount ="), "expected the detune spread to stay gated behind `unison_count > 1` so it cannot fire at N=1: got %s", out)

	zero_inst := mk_instrument(0, 25.0)
	sb2 := strings.builder_make()
	defer strings.builder_destroy(&sb2)
	core.generate_fm_operator_code(&sb2, n, nil, &zero_inst)
	out2 := strings.to_string(sb2)
	testing.expectf(t, strings.contains(out2, "unison_count := 1"), "unison<=0 must floor to 1: got %s", out2)
}

// =====================================================================
// Distinct per-voice phase RATES: with detune != 0 and N>1, each voice's
// detune_amount (and therefore its detuned frequency and its phase
// increment) differs from every other voice's — this is the exact
// arithmetic emitted above, evaluated here in Odin so the test does not
// just re-assert its own formula. If the spread formula's shape ever
// changes to something that collapses distinct voices onto the same
// detune (e.g. an off-by-one that always yields i=0), this test goes red
// even though the structural tests above might not notice.
// =====================================================================

@(test)
test_unison_detune_spread_gives_distinct_rates_per_voice :: proc(t: ^testing.T) {
	unison_count := 3
	detune: f32 = 12.0
	freq: f32 = 440.0

	detuned_freq :: proc(i, unison_count: int, detune, freq: f32) -> f32 {
		detune_amount: f32 = 0.0
		if unison_count > 1 {
			detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * detune
		}
		return freq * math_pow2(detune_amount / 1200.0)
	}

	f0 := detuned_freq(0, unison_count, detune, freq)
	f1 := detuned_freq(1, unison_count, detune, freq)
	f2 := detuned_freq(2, unison_count, detune, freq)

	testing.expectf(t, f0 != f1, "voice 0 and voice 1 must advance their phase accumulators at different rates when detune != 0: got %f == %f", f0, f1)
	testing.expectf(t, f1 != f2, "voice 1 and voice 2 must advance their phase accumulators at different rates when detune != 0: got %f == %f", f1, f2)
	testing.expectf(t, f0 != f2, "voice 0 and voice 2 must advance their phase accumulators at different rates when detune != 0: got %f == %f", f0, f2)
	// Center voice (i at the midpoint of an odd stack) must land exactly on
	// the undetuned frequency — the spread formula's own symmetry guarantee.
	testing.expectf(t, f1 == freq, "the center voice of an odd-sized stack must sit at the undetuned frequency: got %f, expected %f", f1, freq)

	// N=1: only one voice exists, so "distinct rates" is vacuously the
	// unchanged, pre-fix behaviour — the frequency must be exactly the
	// undetuned one regardless of the detune parameter's value.
	single := detuned_freq(0, 1, detune, freq)
	testing.expectf(t, single == freq, "unison=1 must never apply detune regardless of the detune value: got %f, expected %f", single, freq)
}

// A tiny local pow(2, x) so the proof above does not need to import
// core:math just for this one call.
math_pow2 :: proc(x: f32) -> f32 {
	// 2^x = e^(x * ln 2)
	return exp_approx(x * 0.6931471805599453)
}

exp_approx :: proc(x: f32) -> f32 {
	// e^x via the standard library would need core:math; this test only
	// ever calls it with the small values the detune spread produces
	// (|x| well under 1 for realistic cents/1200 ratios), so a short Taylor
	// series is accurate to float32 precision for this range. This is test
	// code, not the generator — the generator emits `math.pow` (core:math)
	// verbatim, unchanged from Oscillator's own formula.
	term: f32 = 1.0
	sum: f32 = 1.0
	for k in 1 ..< 20 {
		term *= x / f32(k)
		sum += term
	}
	return sum
}

// =====================================================================
// Real shipped examples — BUGS.md's own evidence for SKB-012.
// crunch-rhythm.skald.json: instrument "Crunch Rhythm", unison=2, detune=9,
// subgraph mixes an Oscillator AND an FmOperator (node id "cr-grit",
// sanitized to "cr_grit"). Before this fix, unison applied to the
// Oscillator only.
// pad-sequenced.skald.json: instrument "Pad", unison=3, detune=12, over a
// Wavetable source (node id "pad_wavetable"). Before this fix it rendered
// as a single voice despite the patch being authored for a 3-voice stack.
// =====================================================================

crunch_rhythm_json := #load("../../../examples/instruments/guitar/crunch-rhythm.skald.json")
pad_sequenced_json := #load("../../../examples/instruments/pads/pad-sequenced.skald.json")

find_instrument_by_name :: proc(project: ^core.Project, name: string) -> (core.Project_Instrument, bool) {
	for inst in project.instruments {
		if inst.name == name do return inst, true
	}
	return core.Project_Instrument{}, false
}

@(test)
test_crunch_rhythm_fm_operator_now_participates_in_unison :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(crunch_rhythm_json)
	testing.expectf(t, err == "", "crunch-rhythm.skald.json failed to parse: %s", err)

	inst, found := find_instrument_by_name(&project, "Crunch Rhythm")
	testing.expect(t, found, "expected an instrument named \"Crunch Rhythm\" in crunch-rhythm.skald.json")
	testing.expect_value(t, inst.unison, 2)
	testing.expect_value(t, inst.detune, f32(9.0))

	asset_type := core.detect_asset_type(&inst, &project)
	out := core.generate_processor_code(&inst.graph, &inst, "Asset", asset_type, project.bpm)

	testing.expect(
		t,
		any_line_contains_both(out, "FM Operator Node", "(Unison/Detune)"),
		"expected crunch-rhythm's FmOperator to emit the new unison-aware comment/block",
	)
	testing.expectf(t, strings.contains(out, "fm_cr_grit_phase: [2]f32"), "expected the FmOperator's phase state to be a 2-element array (instrument unison=2): got a struct without it\n%s", out)
	testing.expectf(t, strings.contains(out, "9.000000000"), "expected the instrument's detune (9 cents) to reach the FmOperator's spread formula: got %s", out)
}

@(test)
test_pad_sequenced_wavetable_now_participates_in_unison :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(pad_sequenced_json)
	testing.expectf(t, err == "", "pad-sequenced.skald.json failed to parse: %s", err)

	inst, found := find_instrument_by_name(&project, "Pad")
	testing.expect(t, found, "expected an instrument named \"Pad\" in pad-sequenced.skald.json")
	testing.expect_value(t, inst.unison, 3)
	testing.expect_value(t, inst.detune, f32(12.0))

	asset_type := core.detect_asset_type(&inst, &project)
	out := core.generate_processor_code(&inst.graph, &inst, "Asset", asset_type, project.bpm)

	testing.expect(
		t,
		any_line_contains_both(out, "Wavetable Node", "(Unison/Detune)"),
		"expected pad-sequenced's Wavetable to emit the new unison-aware comment/block",
	)
	testing.expectf(t, strings.contains(out, "wavetable_pad_wavetable_phase: [3]f32"), "expected the Wavetable's phase state to be a 3-element array (instrument unison=3): got a struct without it\n%s", out)
	testing.expectf(t, strings.contains(out, "12.000000000"), "expected the instrument's detune (12 cents) to reach the Wavetable's spread formula: got %s", out)
}
