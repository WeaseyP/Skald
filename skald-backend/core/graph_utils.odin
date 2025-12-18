package skald_core

// =================================================================================
// SECTION B: Graph Traversal & Analysis Helpers
// =================================================================================
topological_sort :: proc(graph: ^Graph) -> (sorted_nodes: []Node, is_dag: bool) {
	if graph == nil do return nil, true
	in_degree := make(map[int]int)
	defer delete(in_degree)
	for _, node in graph.nodes {
		in_degree[node.id] = 0
	}
	for conn in graph.connections {
		if _, ok := in_degree[conn.to_node]; ok {
			in_degree[conn.to_node] += 1
		}
	}
	queue := make([dynamic]int)
	defer delete(queue)
	for id, degree in in_degree {
		if degree == 0 do append(&queue, id)
	}

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

find_input_for_port :: proc(graph: ^Graph, target_node_id: int, target_port: string) -> (id: int, ok: bool) {
	if graph == nil do return -1, false
	for conn in graph.connections {
		if conn.to_node == target_node_id && conn.to_port == target_port do return conn.from_node, true
	}
	return -1, false
}
