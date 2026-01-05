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

build_project_from_raw :: proc(project_raw: ^Project_Raw) -> Project {
	project: Project
	project.bpm = project_raw.project.bpm
	project.master_volume = project_raw.project.master_volume
	project.instruments = make([]Project_Instrument, len(project_raw.project.instruments))

	for raw_inst, i in project_raw.project.instruments {
		// Use named loop variable 'raw_inst' and 'i'
		// Iterate using index to avoid copying large structs if possible, though 'raw_inst' is a copy here.
		// Odin's `for x in` copies. If Graph_Raw is large, this is inefficient but fine for codegen.
		
		// We need to pass a POINTER to build_graph_from_raw
		// Since 'raw_inst' is a copy, we should access by reference if we can.
		// Alternatively, just take address of the copy, which is fine since build_graph reads it.
		// Wait, Graph_Raw inside Project_Instrument_Raw might contain pointers or slices.
		// Actually, let's just make a mutable copy of the underlying graph raw to pass pointer.
		raw_graph_copy := raw_inst.audio_graph
		
		project.instruments[i] = Project_Instrument {
			id = raw_inst.id,
			name = raw_inst.name,
			mute = raw_inst.mute,
			solo = raw_inst.solo,
			voice_count = raw_inst.voice_count,
			glide = raw_inst.glide,
			unison = raw_inst.unison,
			detune = raw_inst.detune,
			midi_config = raw_inst.midi_config,
			graph = build_graph_from_raw(&raw_graph_copy),
		}
	}

	return project
}
