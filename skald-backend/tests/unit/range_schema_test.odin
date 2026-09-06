package skald_unit_tests

// =====================================================================
// Roadmap packet C2 — the range contract is one schema (schema/nodes.json)
// and the nine live default divergences it carried are closed.
//
// The parity gate (skald-ui RangeParity.test.tsx) pinned nine cases where
// the editor stored one default and an exposed-but-untouched parameter
// generated another — "exposing an untouched Wavetable amplitude halves
// it, a 6 dB change from a checkbox" (SKB-024) being the named one. The
// tables lookup_param_range walks are now generated from the schema with
// the editor's numbers; the editor's 3->4 save migration stores the OLD
// generated value on any exposed-but-unstored parameter first, so no
// existing file changes sound. (No shipped example had the case.)
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:testing"

expect_default :: proc(t: ^testing.T, node_type, name: string, want: f32) {
	got := core.lookup_param_range(name, node_type)
	testing.expectf(t, got.default == want, "%s.%s: exposed default %v, want %v (editor's stored default)", node_type, name, got.default, want)
}

@(test)
test_the_nine_default_divergences_are_closed :: proc(t: ^testing.T) {
	expect_default(t, "Wavetable", "amplitude", 1.0)
	expect_default(t, "SampleHold", "amplitude", 1.0)
	expect_default(t, "ADSR", "decay", 0.2)
	expect_default(t, "ADSR", "sustain", 0.5)
	expect_default(t, "ADSR", "release", 1.0)
	expect_default(t, "Reverb", "decay", 3.0)
	expect_default(t, "Gain", "gain", 0.75)
	expect_default(t, "FmOperator", "frequency", 2.0)
	expect_default(t, "Mapper", "outMax", 20000.0)
}

@(test)
test_reverb_decay_bounds_are_a_tails_not_an_envelope_stages :: proc(t: ^testing.T) {
	// F-A10-17: the shared decay row's 0 minimum is right for an ADSR stage
	// and wrong for a tail; both editor surfaces say 0.1.
	r := core.lookup_param_range("decay", "Reverb")
	testing.expect_value(t, r.min, f32(0.1))
	testing.expect_value(t, r.max, f32(10.0))
	// And an ADSR's decay keeps its instant-capable 0.
	a := core.lookup_param_range("decay", "ADSR")
	testing.expect_value(t, a.min, f32(0.0))
}

@(test)
test_unscoped_rows_and_the_fallback_are_unchanged :: proc(t: ^testing.T) {
	// A node type without an override still gets the generic row — so the
	// Delay's mix, say, did not move when the overrides above were added.
	m := core.lookup_param_range("mix", "Delay")
	testing.expect_value(t, m.default, f32(0.5))
	lvl := core.lookup_param_range("level3", "Mixer")
	testing.expect_value(t, lvl.default, f32(1.0))
	fb := core.lookup_param_range("no_such_parameter", "")
	testing.expect_value(t, fb.min, f32(-1.0e6))
	testing.expect_value(t, fb.default, f32(0.0))
}
