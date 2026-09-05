package skald_unit_tests

// =====================================================================
// KI-055 — a feedback loop must be a hard error, not a partial emission.
//
// core.find_cycle(graph) -> ([]Node, bool)
//   Factored out of generate_processor_code for the same reason every other
//   preflight rule in this file is: the caller (core.validate_no_cycle)
//   calls os.exit(1), which `odin test` cannot survive, so the rule itself
//   has to live behind a pure finder to be exercised in-process.
//
//   Before the fix this repo shipped, generate_processor_code ran the
//   equivalent check, printed the "feedback loop" error naming the nodes
//   topological_sort could not place, and then fell through past a
//   commented-out os.exit(1): the cyclic nodes — and everything downstream
//   of them — were silently missing from the emitted asset while the
//   process still exited 0.
//
// Uses bus_graph(nodes, conns) from bus_domain_test.odin — same package,
// same graph-building need.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:testing"

@(test)
test_two_node_cycle_is_found :: proc(t: ^testing.T) {
	// Filter(2) -> Mapper(3) -> back into Filter(2)'s own input_cutoff: the
	// simplest cycle validate_connections does not already reject for some
	// other reason (every port name used here is a real, valid port).
	g := bus_graph(
		[]core.Node{
			{id = "1", raw_id = "1", type = "Oscillator"},
			{id = "2", raw_id = "2", type = "Filter"},
			{id = "3", raw_id = "3", type = "Mapper"},
		},
		[]core.Connection{
			{from_node = "1", from_port = "output", to_node = "2", to_port = "input"},
			{from_node = "2", from_port = "output", to_node = "3", to_port = "input"},
			{from_node = "3", from_port = "output", to_node = "2", to_port = "input_cutoff"},
		},
	)
	defer delete(g.nodes)

	nodes, found := core.find_cycle(&g)
	defer delete(nodes)
	testing.expect(t, found, "a 2-node cycle behind a non-cyclic source must be reported")
	testing.expect_value(t, len(nodes), 2)
	testing.expect_value(t, nodes[0].id, "2")
	testing.expect_value(t, nodes[1].id, "3")
}

@(test)
test_acyclic_graph_has_no_cycle :: proc(t: ^testing.T) {
	g := bus_graph(
		[]core.Node{
			{id = "1", raw_id = "1", type = "Oscillator"},
			{id = "2", raw_id = "2", type = "Filter"},
			{id = "3", raw_id = "3", type = "GraphOutput"},
		},
		[]core.Connection{
			{from_node = "1", from_port = "output", to_node = "2", to_port = "input"},
			{from_node = "2", from_port = "output", to_node = "3", to_port = "input"},
		},
	)
	defer delete(g.nodes)

	nodes, found := core.find_cycle(&g)
	testing.expect(t, !found, "an ordinary DAG must not be flagged")
	testing.expect(t, nodes == nil, "a DAG must report no nodes")
}

@(test)
test_node_downstream_of_cycle_is_included :: proc(t: ^testing.T) {
	// KI-055's defect was specifically that everything downstream of the
	// cycle — not just the looping nodes themselves — went missing from the
	// emitted asset. Filter(2)<->Mapper(3) loop; GraphOutput(4) only reads
	// Filter(2), so it can never be scheduled either and must be reported too.
	g := bus_graph(
		[]core.Node{
			{id = "1", raw_id = "1", type = "Oscillator"},
			{id = "2", raw_id = "2", type = "Filter"},
			{id = "3", raw_id = "3", type = "Mapper"},
			{id = "4", raw_id = "4", type = "GraphOutput"},
		},
		[]core.Connection{
			{from_node = "1", from_port = "output", to_node = "2", to_port = "input"},
			{from_node = "2", from_port = "output", to_node = "3", to_port = "input"},
			{from_node = "3", from_port = "output", to_node = "2", to_port = "input_cutoff"},
			{from_node = "2", from_port = "output", to_node = "4", to_port = "input"},
		},
	)
	defer delete(g.nodes)

	nodes, found := core.find_cycle(&g)
	defer delete(nodes)
	testing.expect(t, found, "the cycle must still be reported with a downstream consumer attached")
	testing.expect_value(t, len(nodes), 3)
	testing.expect_value(t, nodes[0].id, "2")
	testing.expect_value(t, nodes[1].id, "3")
	testing.expect_value(t, nodes[2].id, "4")
}
