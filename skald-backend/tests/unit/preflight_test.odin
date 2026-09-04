#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet B9-1 / B9-2 — preflight structural rules.
//
// Two finders are under test, both factored out of the parse path so
// the rule itself can run in-process (the call sites exit the process,
// which `odin test` cannot survive — the same split bus_domain_test.odin
// uses for hoist_bus_modulators):
//
//   core.find_nested_instrument(graph) -> (Node, bool)
//       SKB-028. build_graph_from_raw parses an Instrument inside an
//       instrument's subgraph faithfully, but no generator exists for the
//       type. Before B9-1 the emission dispatch printed "unknown node
//       type" and then WROTE THE FILE AND EXITED 0 — the inner
//       instrument's nodes were simply absent from the export and its
//       output variable sat at 0.0. The user saw "Codegen OK".
//
//   core.find_duplicate_node_id(nodes, instrument_only) -> (Duplicate_Node_Id, bool)
//       SKB-021. Two raw nodes whose ids collapse to one sanitized
//       identifier used to be renamed (`<id>_dup2`) with a warning that
//       admitted the connections still targeted the first node. A renamed
//       node is a node nothing in the file can reach, so the "fix" kept
//       the mis-wire and only made it visible to people reading stderr.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:testing"

raw_node :: proc(id: string, node_type: string) -> core.Node_Raw {
	return core.Node_Raw{id = id, type = node_type}
}

// A Graph keyed the way the codegen indexes it. Positional for readability.
graph_of :: proc(nodes: []core.Node) -> core.Graph {
	m := make(map[string]core.Node)
	for n in nodes do m[n.id] = n
	return core.Graph{nodes = m}
}

// =====================================================================
// find_nested_instrument
// =====================================================================

@(test)
test_nested_instrument_is_found_by_type :: proc(t: ^testing.T) {
	inner_params := json.Object{"name" = json.String("Inner")}
	defer delete(inner_params)
	g := graph_of(
		[]core.Node{
			{id = "1", raw_id = "1", type = "Oscillator"},
			{id = "2", raw_id = "2", type = "Instrument", parameters = inner_params},
			{id = "3", raw_id = "3", type = "GraphOutput"},
		},
	)
	defer delete(g.nodes)

	inner, found := core.find_nested_instrument(&g)
	testing.expect(t, found, "an Instrument-typed node inside an instrument graph must be reported")
	testing.expect_value(t, inner.id, "2")
}

@(test)
test_nested_instrument_absent_on_ordinary_graph :: proc(t: ^testing.T) {
	// Every node type a generator exists for must pass. The risk in a
	// structural rule is a false positive that rejects a graph that
	// generated fine yesterday.
	g := graph_of(
		[]core.Node{
			{id = "1", raw_id = "1", type = "Oscillator"},
			{id = "2", raw_id = "2", type = "ADSR"},
			{id = "3", raw_id = "3", type = "Delay"},
			{id = "4", raw_id = "4", type = "GraphInput"},
			{id = "5", raw_id = "5", type = "GraphOutput"},
		},
	)
	defer delete(g.nodes)

	_, found := core.find_nested_instrument(&g)
	testing.expect(t, !found, "a graph with no Instrument node must not be flagged")
}

@(test)
test_nested_instrument_reports_lowest_id_first :: proc(t: ^testing.T) {
	// Deterministic: two nested instruments must name the same one every
	// run, or the error text itself becomes a determinism failure.
	g := graph_of(
		[]core.Node{
			{id = "b", raw_id = "b", type = "Instrument"},
			{id = "a", raw_id = "a", type = "Instrument"},
		},
	)
	defer delete(g.nodes)

	inner, found := core.find_nested_instrument(&g)
	testing.expect(t, found, "nested instruments present")
	testing.expect_value(t, inner.id, "a")
}
