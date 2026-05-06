package skald_core

import "core:encoding/json"
import "core:fmt"

// =================================================================================
// SECTION F: Main Execution & JSON Parsing (Refactored for correctness)
// =================================================================================

// build_graph_from_raw recursively constructs the main graph and any nested instrument subgraphs.
build_graph_from_raw :: proc(graph_raw: ^Graph_Raw) -> Graph {
	graph: Graph
	graph.nodes = make(map[string]Node)
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

		if raw_node.type == "instrument" && len(raw_node.subgraph) > 0 {
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
            
            // NOTE: Internal graphs usually don't have sequencer tracks for the instrument itself, 
            // but if they did, we'd parse them here.

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


// NEW: Build Project from a Main Graph (where nodes are instruments)
build_project_from_graph :: proc(graph: ^Graph) -> Project {
    project: Project
    project.bpm = 120.0 // Default
    project.master_volume = 1.0

    // Count instruments
    inst_count := 0
    for _, node in graph.nodes {
        // BUG-TYPE-CASE-MISMATCH: JSON contract is PascalCase per useCodeGeneration's
        // codegenType mapping. Match the on-the-wire spelling exactly so a future
        // case drift becomes a loud bug instead of silent data loss.
        if node.type == "Instrument" || node.type == "instrument" {
            inst_count += 1
        }
    }
    project.instruments = make([]Project_Instrument, inst_count)

    idx := 0
    for _, node in graph.nodes {
        // BUG-TYPE-CASE-MISMATCH: JSON contract is PascalCase per useCodeGeneration's
        // codegenType mapping. Match the on-the-wire spelling exactly so a future
        // case drift becomes a loud bug instead of silent data loss.
        if node.type == "Instrument" || node.type == "instrument" {
            
            // Extract Instrument parameters from Node Data
            name := get_string_param(node, "name", "Untitled")
            label := get_string_param(node, "label", "Untitled")
            voice_count := int(get_f32_param_val(node, "voiceCount", 1.0))
            if voice_count <= 0 do voice_count = 1
            glide := get_f32_param_val(node, "glide", 0.0)
            unison := int(get_f32_param_val(node, "unison", 1.0))
            if unison <= 0 do unison = 1
            detune := get_f32_param_val(node, "detune", 0.0)

            inst_graph := Graph{}
            if node.subgraph != nil {
                inst_graph = node.subgraph^
            }

            project.instruments[idx] = Project_Instrument {
                id = node.id,
                name = name,
                voice_count = voice_count,
                glide = glide,
                unison = unison,
                detune = detune,
                graph = inst_graph,
            }
            idx += 1
        }
    }
    
    // Copy sequencer tracks from the main graph to the project
    project.sequencer_tracks = graph.sequencer_tracks
    
    return project
}

// Helper to get raw float value from parameters map without generating code string
get_f32_param_val :: proc(node: Node, param_name: string, default_val: f32) -> f32 {
	if val, ok := node.parameters[param_name]; ok {
        #partial switch v in val {
        case json.Float:
            return f32(v)
		case json.Integer:
            return f32(v)
        }
	}
	return default_val
}
