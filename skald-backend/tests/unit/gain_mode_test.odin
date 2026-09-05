#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet C4 — multiplicative VCA `input_gain` (F-A04-4, F-C2-10).
//
// Every modulation port in the generator is additive: `(knob) + (incoming)`.
// On the VCA's Gain port that defeats the one idiom the node exists for —
// a bare envelope into a separate amplifier — because `audio * (0.75 +
// envelope)` never reaches silence. All five instruments in the flagship
// song hand-set `gain: 0` to work around it. C4 gives the Gain node a
// `gainMode`: "multiply" (the new default for nodes the editor creates)
// computes `audio * knob * incoming`; anything else — including the field
// being ABSENT, which is every pre-C4 file on disk — keeps the additive
// form, so no existing patch changes sound (version-gated: the 2->3 save
// migration stamps "add" on existing Gain nodes so the file says so).
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

gain_graph :: proc(gain_params: json.Object) -> core.Graph {
	nodes := make(map[string]core.Node)
	nodes["lfo"] = core.Node{id = "lfo", raw_id = "lfo", type = "LFO"}
	nodes["g"] = core.Node{id = "g", raw_id = "g", type = "Gain", parameters = gain_params}
	conns := make([]core.Connection, 1)
	conns[0] = core.Connection{from_node = "lfo", from_port = "output", to_node = "g", to_port = "input_gain"}
	return core.Graph{nodes = nodes, connections = conns}
}

emit_gain :: proc(g: ^core.Graph) -> string {
	sb := strings.builder_make()
	core.generate_gain_code(&sb, g.nodes["g"], g, nil)
	return strings.to_string(sb)
}

@(test)
test_gain_mode_multiply_scales_the_knob_by_the_incoming_signal :: proc(t: ^testing.T) {
	params := json.Object{"gain" = json.Float(1.0), "gainMode" = json.String("multiply")}
	g := gain_graph(params)
	code := emit_gain(&g)
	testing.expect(t, strings.contains(code, "* (node_lfo_out)"), code)
	testing.expect(t, !strings.contains(code, "+ (node_lfo_out)"), code)
}

@(test)
test_gain_mode_absent_keeps_the_additive_form_every_existing_file_relies_on :: proc(t: ^testing.T) {
	// The four-bar song's five VCAs sit at gain 0 with an envelope wired in:
	// `0 + envelope`. Reading absence as "multiply" would make all five silent.
	params := json.Object{"gain" = json.Float(0.0)}
	g := gain_graph(params)
	code := emit_gain(&g)
	testing.expect(t, strings.contains(code, "+ (node_lfo_out)"), code)
	testing.expect(t, !strings.contains(code, "* (node_lfo_out)"), code)
}

@(test)
test_gain_mode_add_is_the_legacy_form_spelled_out :: proc(t: ^testing.T) {
	params := json.Object{"gain" = json.Float(0.0), "gainMode" = json.String("add")}
	g := gain_graph(params)
	code := emit_gain(&g)
	testing.expect(t, strings.contains(code, "+ (node_lfo_out)"), code)
}

@(test)
test_gain_mode_unknown_spelling_is_treated_as_legacy_not_guessed :: proc(t: ^testing.T) {
	params := json.Object{"gain" = json.Float(0.0), "gainMode" = json.String("Multiply")}
	g := gain_graph(params)
	code := emit_gain(&g)
	testing.expect(t, strings.contains(code, "+ (node_lfo_out)"), code)
}

@(test)
test_gain_mode_multiply_without_a_modulator_is_the_plain_knob :: proc(t: ^testing.T) {
	params := json.Object{"gain" = json.Float(0.5), "gainMode" = json.String("multiply")}
	nodes := make(map[string]core.Node)
	nodes["g"] = core.Node{id = "g", raw_id = "g", type = "Gain", parameters = params}
	g := core.Graph{nodes = nodes}
	code := emit_gain(&g)
	testing.expect(t, strings.contains(code, "* (f32(0.500000000))"), code)
	testing.expect_value(t, core.SAVE_FORMAT_VERSION, 4)
}
