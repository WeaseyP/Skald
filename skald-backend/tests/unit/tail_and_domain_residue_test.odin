#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap B7 residue — B7-x3, B7-x1, B7-x2, B7-3-followup.
//
//   B7-x3  the skald_feedback_tail_seconds helper is emitted only when some
//          asset has a Delay/Reverb tail; every export used to carry it.
//   B7-x1  compute_bus_tail_seconds counts only Delay/Reverb nodes with a
//          path to the output; an orphaned Delay inflated the bound.
//   B7-x2  a Panner whose consumers are all mono inputs discards its pan
//          (the mono fallback is a pass-through since SKB-013) — warn.
//   B7-3-followup  a bus-domain (hoisted) modulator fed by a per-voice source
//          reads the voice SUM; SKB-017 survived one node upstream, silently.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

// --- B7-x1 ----------------------------------------------------------------

@(test)
test_orphaned_delay_does_not_count_toward_the_tail :: proc(t: ^testing.T) {
	// osc -> out, plus a Delay wired from the osc but feeding NOTHING.
	dly_params := json.Object{"delayTime" = json.Float(0.5), "feedback" = json.Float(0.9), "mix" = json.Float(0.5)}
	defer delete(dly_params)
	nodes := []core.Node{
		{id = "dly", raw_id = "dly", type = "Delay", parameters = dly_params},
		{id = "osc", raw_id = "osc", type = "Oscillator"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "out", to_port = "input"},
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
	}
	plan: core.Instrument_Plan
	all := core.nodes_sorted_by_id(&g)
	defer delete(all)
	testing.expect_value(t, core.compute_bus_tail_seconds(&g, all, &plan), 0.0)

	// The same Delay wired INTO the output counts.
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
		{from_node = "dly", from_port = "output", to_node = "out", to_port = "input"},
	}
	testing.expect(t, core.compute_bus_tail_seconds(&g, all, &plan) > 0.0, "a Delay on the way to the output has a tail")
}

@(test)
test_tail_with_no_graph_output_is_unchanged :: proc(t: ^testing.T) {
	// No GraphOutput at all: nothing sounds, and the already-warned shape's
	// behaviour (every Delay counted) must not change under B7-x1.
	dly_params := json.Object{"delayTime" = json.Float(0.5), "feedback" = json.Float(0.9), "mix" = json.Float(0.5)}
	defer delete(dly_params)
	nodes := []core.Node{{id = "dly", raw_id = "dly", type = "Delay", parameters = dly_params}}
	g := graph_of(nodes)
	defer delete(g.nodes)
	plan: core.Instrument_Plan
	all := core.nodes_sorted_by_id(&g)
	defer delete(all)
	testing.expect(t, core.compute_bus_tail_seconds(&g, all, &plan) > 0.0, "without an output every Delay still counts, as before")
}
