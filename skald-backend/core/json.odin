package skald_core

import "core:encoding/json"

// =================================================================================
// SECTION F: Main Execution & JSON Parsing (Refactored for correctness)
// =================================================================================

// build_graph_from_raw recursively constructs the main graph and any nested instrument subgraphs.
build_graph_from_raw :: proc(graph_raw: ^Graph_Raw) -> Graph {
	graph: Graph
	graph.nodes = make(map[int]Node)
	graph.connections = graph_raw.connections
	graph.events = graph_raw.events
	graph.sequencer_tracks = graph_raw.sequencer_tracks

	for raw_node in graph_raw.nodes {
		node := Node {
			id = raw_node.id,
			type = raw_node.type,
			parameters = raw_node.parameters,
			subgraph = nil, // Start as nil
		}

		if raw_node.type == "Instrument" && len(raw_node.subgraph) > 0 {
			subgraph_raw: Graph_Raw

			// Manually unmarshal nodes from the subgraph map
			if nodes_val, ok := raw_node.subgraph["nodes"]; ok {
				// Marshal the value back to bytes, then unmarshal into the struct
				nodes_bytes, err := json.marshal(nodes_val)
				if err == nil {
					defer delete(nodes_bytes)
					json.unmarshal(nodes_bytes, &subgraph_raw.nodes)
				}
			}

			// Manually unmarshal connections from the subgraph map
			if conns_val, ok := raw_node.subgraph["connections"]; ok {
				// Marshal the value back to bytes, then unmarshal into the struct
				conns_bytes, err := json.marshal(conns_val)
				if err == nil {
					defer delete(conns_bytes)
					json.unmarshal(conns_bytes, &subgraph_raw.connections)
				}
			}

			subgraph_obj := build_graph_from_raw(&subgraph_raw)
			node.subgraph = new(Graph)
			node.subgraph^ = subgraph_obj
		}
		graph.nodes[raw_node.id] = node
	}
	return graph
}
