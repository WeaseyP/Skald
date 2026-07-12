package skald_core

import "core:slice"

// =================================================================================
// SECTION B: Graph Traversal & Analysis Helpers
// =================================================================================

// Odin map iteration order is unspecified and varies run-to-run. Any codegen
// loop that emits per-node output (struct fields, PRNG seed assignment, the
// "first ADSR" selection, exposed-param collision suffixes, node_out decls)
// must iterate this sorted-by-id view instead of `graph.nodes` directly, or
// the generated source is non-deterministic — which breaks reproducible builds
// and makes golden snapshots useless. Caller owns the returned slice.
nodes_sorted_by_id :: proc(graph: ^Graph) -> []Node {
	ids := make([dynamic]string)
	defer delete(ids)
	for id in graph.nodes do append(&ids, id)
	slice.sort(ids[:])
	out := make([]Node, len(ids))
	for id, i in ids do out[i] = graph.nodes[id]
	return out
}

topological_sort :: proc(graph: ^Graph) -> (sorted_nodes: []Node, is_dag: bool) {
	if graph == nil do return nil, true
	in_degree := make(map[string]int)
	defer delete(in_degree)
	for _, node in graph.nodes {
		in_degree[node.id] = 0
	}
	for conn in graph.connections {
		if _, ok := in_degree[conn.to_node]; ok {
			in_degree[conn.to_node] += 1
		}
	}
	queue := make([dynamic]string)
	defer delete(queue)
	for id, degree in in_degree {
		if degree == 0 do append(&queue, id)
	}
	// Sort the initial ready-set so the Kahn traversal is deterministic:
	// the seed came from a map iteration, and connections are scanned in a
	// fixed slice order below, so a sorted seed makes the whole topological
	// order reproducible across runs (required for stable golden snapshots).
	slice.sort(queue[:])

	sorted := make([dynamic]Node)
	// defer delete(sorted) // Corrected: Do not delete the 'sorted' dynamic array.

	for len(queue) > 0 {
		node_id := queue[0]
		pop_front(&queue)
		if node, ok := graph.nodes[node_id]; ok {
			append(&sorted, node)
		}
		for conn in graph.connections {
			if conn.from_node == node_id {
				target_node_id := conn.to_node
				if degree, ok := in_degree[target_node_id]; ok {
					new_degree := degree - 1
					in_degree[target_node_id] = new_degree
					if new_degree == 0 do append(&queue, target_node_id)
				}
			}
		}
	}
	return sorted[:], len(sorted) == len(graph.nodes)
}

find_input_for_port :: proc(graph: ^Graph, target_node_id: string, target_port: string) -> (id: string, port: string, ok: bool) {
	if graph == nil do return "", "", false
	for conn in graph.connections {
		if conn.to_node == target_node_id && conn.to_port == target_port do return conn.from_node, conn.from_port, true
	}
	return "", "", false
}

Connection_Source :: struct {
    id: string,
    port: string,
}

find_inputs_for_port :: proc(graph: ^Graph, target_node_id: string, target_port: string) -> [dynamic]Connection_Source {
    sources := make([dynamic]Connection_Source)
    if graph == nil do return sources
    for conn in graph.connections {
        if conn.to_node == target_node_id && conn.to_port == target_port {
            append(&sources, Connection_Source{conn.from_node, conn.from_port})
        }
    }
    return sources
}
