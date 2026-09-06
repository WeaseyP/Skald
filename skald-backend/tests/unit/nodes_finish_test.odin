#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet C5 — finish the nodes (F-A01-7, F-A01-8, F-A02-7, F-A07-7).
//
// Three parameters the audit found missing from otherwise complete nodes,
// each added with a default that reproduces today's emission byte for byte
// so no existing patch changes sound:
//
//   Wavetable `pulseWidth` (+ input_pulseWidth) — the square end of the
//     morph was hard-coded at 50 % duty while the Oscillator's square had
//     a full pulse-width control.
//   Wavetable `phase` — same per-voice reset architecture as the
//     Oscillator, but no way to offset the accumulator.
//   FmOperator `amplitude` (+ input_amp) — the only source node with no
//     output level; a bare `sin(...)` at full scale, so every operator
//     needed a VCA after it just to be quieter.
//   Reverb `damping` — a one-pole lowpass on the fed-back sample, the
//     minimal Schroeder way to make highs die faster than lows. Emitted
//     only when authored or exposed, so an undamped reverb's text (and its
//     goldens) do not move.
//
// (The roadmap row's fourth item, the Wavetable/FM unison decision, was
// already closed by SKB-012: both generators carry the unison loop and
// wavetable_unison_stack / fm_unison_stack pin it.)
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

single_node_graph :: proc(id, node_type: string, params: json.Object) -> core.Graph {
	nodes := make(map[string]core.Node)
	nodes[id] = core.Node{id = id, raw_id = id, type = node_type, parameters = params}
	return core.Graph{nodes = nodes}
}

emit_node :: proc(g: ^core.Graph, id: string) -> string {
	sb := strings.builder_make()
	inst := core.Project_Instrument{id = "i", name = "I", unison = 1}
	node := g.nodes[id]
	switch node.type {
	case "Wavetable":  core.generate_wavetable_code(&sb, node, g, nil, &inst)
	case "FmOperator": core.generate_fm_operator_code(&sb, node, g, nil, &inst)
	case "Reverb":     core.generate_reverb_code(&sb, node, g, nil)
	}
	return strings.to_string(sb)
}

// --- Wavetable ---------------------------------------------------------

@(test)
test_wavetable_pulse_width_reaches_the_square_shape :: proc(t: ^testing.T) {
	params := json.Object{"position" = json.Float(3.0), "pulseWidth" = json.Float(0.1)}
	g := single_node_graph("wt", "Wavetable", params)
	code := emit_node(&g, "wt")
	// The sample helper now takes the duty cycle as its third argument.
	testing.expect(t, strings.contains(code, "skald_wavetable_sample(") && strings.contains(code, "f32(0.100000000)"), code)
}

@(test)
test_wavetable_pulse_width_absent_is_the_old_fifty_percent :: proc(t: ^testing.T) {
	params := json.Object{"position" = json.Float(3.0)}
	g := single_node_graph("wt", "Wavetable", params)
	code := emit_node(&g, "wt")
	testing.expect(t, strings.contains(code, "f32(0.500000000)"), code)
}

@(test)
test_wavetable_phase_offsets_the_accumulator_in_turns :: proc(t: ^testing.T) {
	// 180 degrees is half a cycle; the Wavetable's accumulator runs 0..1,
	// so the offset is phase / 360, not the Oscillator's radians.
	params := json.Object{"position" = json.Float(0.0), "phase" = json.Float(180.0)}
	g := single_node_graph("wt", "Wavetable", params)
	code := emit_node(&g, "wt")
	testing.expect(t, strings.contains(code, "f32(180.000000000)") && strings.contains(code, "/ 360.0"), code)
}

@(test)
test_wavetable_phase_absent_adds_nothing_to_the_emission :: proc(t: ^testing.T) {
	// No phase authored: the phase line is not emitted at all, so every
	// existing Wavetable golden keeps its exact text apart from the helper.
	params := json.Object{"position" = json.Float(0.0)}
	g := single_node_graph("wt", "Wavetable", params)
	code := emit_node(&g, "wt")
	testing.expect(t, !strings.contains(code, "/ 360.0"), code)
}

// --- FM Operator --------------------------------------------------------

@(test)
test_fm_operator_amplitude_scales_the_output :: proc(t: ^testing.T) {
	params := json.Object{"frequency" = json.Float(1.0), "modIndex" = json.Float(0.0), "amplitude" = json.Float(0.25)}
	g := single_node_graph("op", "FmOperator", params)
	code := emit_node(&g, "op")
	testing.expect(t, strings.contains(code, "* (f32(0.250000000))"), code)
}

@(test)
test_fm_operator_amplitude_absent_is_unity_and_emits_no_multiply :: proc(t: ^testing.T) {
	// Every shipped FM patch predates the field; unity must leave its text
	// alone, the same rule Distortion's outputGain follows.
	params := json.Object{"frequency" = json.Float(1.0), "modIndex" = json.Float(0.0)}
	g := single_node_graph("op", "FmOperator", params)
	code := emit_node(&g, "op")
	testing.expect(t, strings.contains(code, "node_op_out = unison_out / f32(unison_count);"), code)
}

@(test)
test_fm_operator_input_amp_port_is_accepted_by_the_validator :: proc(t: ^testing.T) {
	ports, known := core.valid_input_ports("FmOperator")
	testing.expect(t, known, "FmOperator is a known node type")
	found := false
	for p in ports do if p == "input_amp" do found = true
	testing.expect(t, found, "FmOperator must accept input_amp like every other source")
	wt_ports, _ := core.valid_input_ports("Wavetable")
	found_pw := false
	for p in wt_ports do if p == "input_pulseWidth" do found_pw = true
	testing.expect(t, found_pw, "Wavetable must accept input_pulseWidth like the Oscillator")
}

// --- Reverb --------------------------------------------------------------

@(test)
test_reverb_damping_lowpasses_the_feedback_when_authored :: proc(t: ^testing.T) {
	params := json.Object{"decay" = json.Float(2.0), "mix" = json.Float(1.0), "damping" = json.Float(0.7)}
	g := single_node_graph("rv", "Reverb", params)
	code := emit_node(&g, "rv")
	testing.expect(t, strings.contains(code, "p.reverb_rv_damp"), code)
	testing.expect(t, strings.contains(code, "f32(0.700000000)"), code)
}

@(test)
test_reverb_damping_absent_or_zero_emits_the_undamped_comb :: proc(t: ^testing.T) {
	absent := single_node_graph("rv", "Reverb", json.Object{"decay" = json.Float(2.0), "mix" = json.Float(1.0)})
	zero := single_node_graph("rv", "Reverb", json.Object{"decay" = json.Float(2.0), "mix" = json.Float(1.0), "damping" = json.Float(0.0)})
	testing.expect(t, !strings.contains(emit_node(&absent, "rv"), "reverb_rv_damp"), "absent damping must not add state")
	testing.expect(t, !strings.contains(emit_node(&zero, "rv"), "reverb_rv_damp"), "damping 0 must not add state")
	testing.expect(t, core.reverb_damping_active(&absent, nil, absent.nodes["rv"]) == false, "predicate: absent")
}

@(test)
test_reverb_damping_range_row_exists :: proc(t: ^testing.T) {
	// Without a row the exposed setter would clamp to the wide-open unknown
	// fallback; with the generic table it has no entry at all.
	rng := core.lookup_param_range("damping", "Reverb")
	testing.expect_value(t, rng.min, f32(0.0))
	testing.expect_value(t, rng.max, f32(1.0))
	testing.expect_value(t, rng.default, f32(0.0))
	amp := core.lookup_param_range("amplitude", "FmOperator")
	// The generic amplitude default is 0.5; an exposed-but-untouched FM
	// level must stay at the unity the node always had (the SKB-051 class).
	testing.expect_value(t, amp.default, f32(1.0))
}
