package skald_codegen

import "core:fmt"
import "core:os"
import "core:strings"
import "core:math"
import rand "core:math/rand"
import "core:time"
import "base:runtime"
import json "core:encoding/json"

// --- Data Structures (Unchanged) ---

Node :: struct {
	id:         int,
	type:       string,
	position:   Vec2,
	parameters: json.Object,
	subgraph:   ^Graph,
}

Connection :: struct {
	from_node: int,
	from_port: string,
	to_node:   int,
	to_port:   string,
}

Graph :: struct {
	nodes:       []Node,
	connections: []Connection,
}

Node_Raw :: struct {
	id:         int,
	type:       string,
	position:   Vec2,
	parameters: json.Object,
	subgraph:   json.Object,
}

Graph_Raw :: struct {
	nodes:       []Node_Raw,
	connections: []Connection,
}

Vec2 :: struct {
	x: f32,
	y: f32,
}

Topo_Sort_Result :: struct {
	sorted_nodes: []Node,
	is_dag:       bool,
}

// --- Helper Procedures ---

topological_sort :: proc(graph: ^Graph) -> Topo_Sort_Result {
	in_degree := make(map[int]int)
	defer delete(in_degree)
	node_map := make(map[int]Node)
	defer delete(node_map)

	for node in graph.nodes {
		in_degree[node.id] = 0
		node_map[node.id] = node
	}
	for conn in graph.connections {
		if val, ok := in_degree[conn.to_node]; ok {
			in_degree[conn.to_node] = val + 1
		}
	}
	queue := make([dynamic]int)
	defer delete(queue)
	for k, v in in_degree {
		if v == 0 {
			append(&queue, k)
		}
	}
	sorted_nodes := make([dynamic]Node)
	for len(queue) > 0 {
		node_id := queue[0]
		pop_front(&queue)
		if node, ok := node_map[node_id]; ok {
			append(&sorted_nodes, node)
		}
		for conn in graph.connections {
			if conn.from_node == node_id {
				target_node_id := conn.to_node
				if degree, ok := in_degree[target_node_id]; ok {
					new_degree := degree - 1
					in_degree[target_node_id] = new_degree
					if new_degree == 0 {
						append(&queue, target_node_id)
					}
				}
			}
		}
	}
	is_dag := len(sorted_nodes) == len(graph.nodes)
	return {sorted_nodes[:], is_dag}
}

find_input_for_port :: proc(graph: ^Graph, target_node_id: int, target_port: string) -> (id: int, ok: bool) {
	for conn in graph.connections {
		if conn.to_node == target_node_id && conn.to_port == target_port {
			return conn.from_node, true
		}
	}
	return -1, false
}

// Helper to find all nodes that need state (e.g. Oscillator)
collect_stateful_nodes :: proc(graph: ^Graph, all_nodes: ^[dynamic]Node) {
	if graph == nil {
		return
	}
	for node in graph.nodes {
		switch node.type {
		case "Oscillator", "Filter", "Noise":
			append(all_nodes, node)
		case "Instrument":
			collect_stateful_nodes(node.subgraph, all_nodes)
		}
	}
}

// CORRECTED: Helper to find *all* nodes for variable declaration.
collect_all_nodes_recursive :: proc(graph: ^Graph, all_nodes: ^[dynamic]Node) {
    if graph == nil {
        return
    }
    for node in graph.nodes {
        append(all_nodes, node)
        if node.type == "Instrument" {
            // This is the correct way to make the recursive call.
            collect_all_nodes_recursive(node.subgraph, all_nodes)
        }
    }
}


// --- Main procedure ---
main :: proc() {
	input_bytes, read_err := os.read_entire_file_from_handle(os.stdin)
	if read_err != true {
		fmt.eprintf("Error reading from stdin: %v\n", read_err)
		os.exit(1)
	}

	graph_raw: Graph_Raw
	parse_err_raw := json.unmarshal(input_bytes, &graph_raw)
	if parse_err_raw != nil {
		fmt.eprintf("Error parsing JSON into raw structure: %v\n", parse_err_raw)
		os.exit(1)
	}

    graph := Graph{
        nodes       = make([]Node, len(graph_raw.nodes)),
        connections = graph_raw.connections,
    }

    for raw_node, i in graph_raw.nodes {
        node := &graph.nodes[i]
        node.id = raw_node.id
        node.type = raw_node.type
        node.position = raw_node.position
        node.parameters = raw_node.parameters
        node.subgraph = nil 
        if raw_node.type == "Instrument" && len(raw_node.subgraph) > 0 {
            node.subgraph = new(Graph)
			subgraph_bytes, marshal_err := json.marshal(raw_node.subgraph)
			if marshal_err != nil {
				fmt.eprintf("Error re-marshaling subgraph for node %d: %v\n", node.id, marshal_err)
				os.exit(1)
			}
			defer delete(subgraph_bytes)
			subgraph_err := json.unmarshal(subgraph_bytes, node.subgraph)
			if subgraph_err != nil {
				fmt.eprintf("Error parsing subgraph for node %d: %v\n", node.id, subgraph_err)
				os.exit(1)
			}
        }
    }

	// --- Graph Validation ---
	output_node_count := 0
	for node in graph.nodes {
		if node.type == "GraphOutput" {
			output_node_count += 1
		}
	}
	if output_node_count == 0 {
		fmt.eprintln("Error: Graph must contain a 'GraphOutput' node.")
		os.exit(1)
	}
	if output_node_count > 1 {
		fmt.eprintln("Error: Graph must contain only one 'GraphOutput' node.")
		os.exit(1)
	}

	sort_result := topological_sort(&graph)
	if !sort_result.is_dag {
		fmt.eprintln("Error: Audio graph contains a cycle and cannot be processed.")
		os.exit(1)
	}
    
    // --- Data Collection ---
    all_stateful_nodes := make([dynamic]Node)
    defer delete(all_stateful_nodes)
    collect_stateful_nodes(&graph, &all_stateful_nodes)

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

    // --- Start Generating Code ---
	strings.write_string(&sb, "package generated_audio\n\n")
	strings.write_string(&sb, "import \"core:math\"\n")
	strings.write_string(&sb, "import rand \"core:math/rand\"\n")
	strings.write_string(&sb, "import \"core:time\"\n")
	strings.write_string(&sb, "import \"base:runtime\"\n\n")

    // Generate state structs
	for node in all_stateful_nodes[:] {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "Oscillator_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tphase: f32,\n")
			strings.write_string(&sb, "}\n\n")
		// ... other stateful node types ...
		}
	}

    // Generate AudioProcessor struct
	strings.write_string(&sb, "AudioProcessor :: struct {\n")
	for node in all_stateful_nodes[:] {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "\tosc_%d: Oscillator_%d_State,\n", node.id, node.id)
		// ... other stateful node types ...
		}
	}
	strings.write_string(&sb, "}\n\n")

    // Generate init_processor
	strings.write_string(&sb, "init_processor :: proc(p: ^AudioProcessor) {\n")
	// init logic for stateful nodes would go here if needed
	strings.write_string(&sb, "}\n\n")

    // Generate process_sample
	strings.write_string(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {\n")
	
    // CORRECTED: Call the helper to populate the list of all nodes.
    all_nodes_in_graph := make([dynamic]Node)
    defer delete(all_nodes_in_graph)
    collect_all_nodes_recursive(&graph, &all_nodes_in_graph)

    // Declare output variables for all nodes.
	for node in all_nodes_in_graph[:] {
		fmt.sbprintf(&sb, "\tnode_%d_out: f32\n", node.id)
	}
	strings.write_string(&sb, "\n")

	// Generate node processing logic using the top-level sorted order.
	for node in sort_result.sorted_nodes {
        // [ ... The full switch statement from the previous correct answers goes here ... ]
        // [ ... This logic for processing nodes recursively was correct. ... ]
		switch node.type {
		case "Oscillator":
			freq_str: string = "440.0"; amp_str: string = "0.5"
			if freq_input_node_id, ok := find_input_for_port(&graph, node.id, "input_freq"); ok {
				freq_str = fmt.tprintf("node_%d_out", freq_input_node_id)
			} else if freq_val, ok := node.parameters["frequency"]; ok {
				if f, ok2 := freq_val.(f64); ok2 { freq_str = fmt.tprintf("%f", f) }
			}
			if amp_input_node_id, ok := find_input_for_port(&graph, node.id, "input_amp"); ok {
				amp_str = fmt.tprintf("node_%d_out", amp_input_node_id)
			} else if amp_val, ok := node.parameters["amplitude"]; ok {
				if a, ok2 := amp_val.(f64); ok2 { amp_str = fmt.tprintf("%f", a) }
			}
			waveform: string = "Sine" 
			if wave_val, ok := node.parameters["waveform"]; ok { if w, ok2 := wave_val.(string); ok2 { waveform = w } }
			fmt.sbprintf(&sb, "\t// --- Oscillator Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * (%s) / sample_rate;\n", node.id, freq_str)
			fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", node.id, node.id)
			switch waveform {
			case "Sawtooth": fmt.sbprintf(&sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * (%s));\n\n", node.id, node.id, amp_str)
			case "Square": fmt.sbprintf(&sb, "\tif math.sin(p.osc_%d.phase) > 0 {{ node_%d_out = %s; }} else {{ node_%d_out = -%s; }}\n\n", node.id, node.id, amp_str, node.id, amp_str)
			case "Triangle": fmt.sbprintf(&sb, "\tnode_%d_out = f32((2.0 / math.PI) * math.asin(math.sin(p.osc_%d.phase)) * (%s));\n\n", node.id, node.id, amp_str)
			case "Sine": fallthrough
			case: fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * (%s));\n\n", node.id, node.id, amp_str)
			}
		
		case "ADSR":
			input_str := "0.0"
			if input_node_id, ok := find_input_for_port(&graph, node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			attack:  f64 = 0.01; decay: f64 = 0.1; sustain: f64 = 0.5; note_duration: f64 = 1.0
			if val, ok := node.parameters["attack"]; ok { if v, ok2 := val.(f64); ok2 { attack = v }}
			if val, ok := node.parameters["decay"]; ok { if v, ok2 := val.(f64); ok2 { decay = v }}
			if val, ok := node.parameters["sustain"]; ok { if v, ok2 := val.(f64); ok2 { sustain = v }}
			fmt.sbprintf(&sb, "\t// --- ADSR Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tattack_samples_%d  := u64(%.4f * sample_rate);\n", node.id, attack)
			fmt.sbprintf(&sb, "\tdecay_samples_%d   := u64(%.4f * sample_rate);\n", node.id, decay)
			fmt.sbprintf(&sb, "\tnote_samples_%d    := u64(%.4f * sample_rate);\n", node.id, note_duration)
			fmt.sbprintf(&sb, "\tenvelope_%d: f32 = 0.0;\n", node.id)
			fmt.sbprintf(&sb, "\tif time_in_samples < attack_samples_%d {{ envelope_%d = f32(time_in_samples) / f32(attack_samples_%d); }}", node.id, node.id, node.id)
			fmt.sbprintf(&sb, " else if time_in_samples < attack_samples_%d + decay_samples_%d {{ time_after_attack_%d := f32(time_in_samples - attack_samples_%d); envelope_%d = 1.0 - (time_after_attack_%d / f32(decay_samples_%d) * (1.0 - %.4f)); }}", node.id, node.id, node.id, node.id, node.id, node.id, node.id, sustain)
			fmt.sbprintf(&sb, " else if time_in_samples < note_samples_%d {{ envelope_%d = %.4f; }}", node.id, node.id, sustain)
			fmt.sbprintf(&sb, " else {{ envelope_%d = 0.0; }}\n", node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out = (%s) * envelope_%d;\n\n", node.id, input_str, node.id)
		
		case "Instrument":
			fmt.sbprintf(&sb, "\t// --- Instrument Node %d ---\n", node.id)
			if node.subgraph == nil {
				fmt.sbprintf(&sb, "\t// WARNING: Instrument node %d has no subgraph.\n", node.id)
				fmt.sbprintf(&sb, "\tnode_%d_out = 0.0;\n", node.id)
				continue
			}
			subgraph_sort_result := topological_sort(node.subgraph)
			if !subgraph_sort_result.is_dag {
				fmt.eprintf("Error: Subgraph for Instrument %d contains a cycle.", node.id)
				os.exit(1)
			}
			for sub_node in subgraph_sort_result.sorted_nodes {
				switch sub_node.type {
				case "GraphInput":
					port_name: string
					if val, ok := sub_node.parameters["name"]; ok { if str, ok2 := val.(string); ok2 { port_name = str }}
					if port_name != "" {
						if input_node_id, ok := find_input_for_port(&graph, node.id, port_name); ok {
							fmt.sbprintf(&sb, "\tnode_%d_out = node_%d_out;\n", sub_node.id, input_node_id)
						} else {
							fmt.sbprintf(&sb, "\tnode_%d_out = 0.0;\n", sub_node.id)
						}
					} else {
						fmt.sbprintf(&sb, "\tnode_%d_out = 0.0;\n", sub_node.id)
					}
				case "GraphOutput":
					if input_node_id, ok := find_input_for_port(node.subgraph, sub_node.id, "input"); ok {
						fmt.sbprintf(&sb, "\tnode_%d_out = node_%d_out;\n", node.id, input_node_id)
					} else {
						fmt.sbprintf(&sb, "\tnode_%d_out = 0.0;\n", node.id)
					}
				case "Oscillator":
					freq_str: string = "440.0"; amp_str: string = "0.5"
					if freq_input_node_id, ok := find_input_for_port(node.subgraph, sub_node.id, "input_freq"); ok {
						freq_str = fmt.tprintf("node_%d_out", freq_input_node_id)
					} else if freq_val, ok := sub_node.parameters["frequency"]; ok {
						if f, ok2 := freq_val.(f64); ok2 { freq_str = fmt.tprintf("%f", f) }
					}
					if amp_input_node_id, ok := find_input_for_port(node.subgraph, sub_node.id, "input_amp"); ok {
						amp_str = fmt.tprintf("node_%d_out", amp_input_node_id)
					} else if amp_val, ok := sub_node.parameters["amplitude"]; ok {
						if a, ok2 := amp_val.(f64); ok2 { amp_str = fmt.tprintf("%f", a) }
					}
					waveform: string = "Sawtooth" 
					if wave_val, ok := sub_node.parameters["waveform"]; ok { if w, ok2 := wave_val.(string); ok2 { waveform = w } }
					fmt.sbprintf(&sb, "\t// (sub) --- Oscillator Node %d ---\n", sub_node.id)
					fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * (%s) / sample_rate;\n", sub_node.id, freq_str)
					fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", sub_node.id, sub_node.id)
					switch waveform {
					case "Sawtooth": fmt.sbprintf(&sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * (%s));\n", sub_node.id, sub_node.id, amp_str)
					case: fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * (%s));\n", sub_node.id, sub_node.id, amp_str)
					}
				case "ADSR":
					input_str := "0.0"
					if input_node_id, ok := find_input_for_port(node.subgraph, sub_node.id, "input"); ok {
						input_str = fmt.tprintf("node_%d_out", input_node_id)
					}
					attack: f64 = 0.01; decay: f64 = 0.1; sustain: f64 = 0.5; note_duration: f64 = 1.0
					if val, ok := sub_node.parameters["attack"]; ok { if v, ok2 := val.(f64); ok2 { attack = v }}
					if val, ok := sub_node.parameters["decay"]; ok { if v, ok2 := val.(f64); ok2 { decay = v }}
					if val, ok := sub_node.parameters["sustain"]; ok { if v, ok2 := val.(f64); ok2 { sustain = v }}
					fmt.sbprintf(&sb, "\t// (sub) --- ADSR Node %d ---\n", sub_node.id)
					fmt.sbprintf(&sb, "\tattack_samples_%d  := u64(%.4f * sample_rate);\n", sub_node.id, attack)
					fmt.sbprintf(&sb, "\tdecay_samples_%d   := u64(%.4f * sample_rate);\n", sub_node.id, decay)
					fmt.sbprintf(&sb, "\tnote_samples_%d    := u64(%.4f * sample_rate);\n", sub_node.id, note_duration)
					fmt.sbprintf(&sb, "\tenvelope_%d: f32 = 0.0;\n", sub_node.id)
					fmt.sbprintf(&sb, "\tif time_in_samples < attack_samples_%d {{ envelope_%d = f32(time_in_samples) / f32(attack_samples_%d); }}", sub_node.id, sub_node.id, sub_node.id)
					fmt.sbprintf(&sb, " else if time_in_samples < attack_samples_%d + decay_samples_%d {{ time_after_attack_%d := f32(time_in_samples - attack_samples_%d); envelope_%d = 1.0 - (time_after_attack_%d / f32(decay_samples_%d) * (1.0 - %.4f)); }}", sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sustain)
					fmt.sbprintf(&sb, " else if time_in_samples < note_samples_%d {{ envelope_%d = %.4f; }}", sub_node.id, sub_node.id, sustain)
					fmt.sbprintf(&sb, " else {{ envelope_%d = 0.0; }}\n", sub_node.id)
					fmt.sbprintf(&sb, "\tnode_%d_out = (%s) * envelope_%d;\n", sub_node.id, input_str, sub_node.id)
				}
			}
			strings.write_string(&sb, "\t// --- End Instrument Node ---\n\n")

		case "GraphOutput":
			input_str := "0.0"
			if input_node_id, ok := find_input_for_port(&graph, node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			fmt.sbprintf(&sb, "\tnode_%d_out = %s;\n", node.id, input_str)
			fmt.sbprintf(&sb, "\treturn node_%d_out, node_%d_out;\n", node.id, node.id)
		}
	}

	strings.write_string(&sb, "}\n")

	fmt.printf("%s", strings.to_string(sb))
}