// main.odin
package skald_codegen

import "core:fmt"
import "core:os"
import "core:strings"
import "core:math"
import json "core:encoding/json"

// --- Data Structures ---

Exposed_Param :: struct {
	node_id:    int,
	param_name: string,
	node_type:  string,
}

Node :: struct {
	id:                 int,
	type:               string,
	position:           Vec2,
	parameters:         json.Object,
	subgraph:           ^Graph,
	exposed_parameters: []string, 
}

Node_Raw :: struct {
	id:                 int,
	type:               string,
	position:           Vec2,
	parameters:         json.Object,
	subgraph:           json.Object,
	exposed_parameters: []string, 
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
	if graph == nil {
		return {}
	}
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
	if graph == nil {
		return -1, false
	}
	for conn in graph.connections {
		if conn.to_node == target_node_id && conn.to_port == target_port {
			return conn.from_node, true
		}
	}
	return -1, false
}

get_param_value_str :: proc(graph: ^Graph, node: Node, param_name: string, input_port: string, default_val_str: string, exposed_map: ^map[int]map[string]struct{}) -> string {
	// 1. Check for a live connection to the input port
	if id, ok := find_input_for_port(graph, node.id, input_port); ok {
		return fmt.tprintf("node_%d_out", id)
	}

	// 2. Check if the parameter is exposed on the processor
	is_exposed := false
	if node_params, ok := exposed_map^[node.id]; ok {
		if _, ok := node_params[param_name]; ok {
			is_exposed = true
		}
	}
	if is_exposed {
		return fmt.tprintf("p.node_%d_%s", node.id, param_name)
	}

	// 3. Fall back to the default value from the node's own parameters
	if val, ok := node.parameters[param_name]; ok {
		if f, ok2 := val.(f64); ok2 {
			return fmt.tprintf("%f", f)
		}
		if i, ok2 := val.(i64); ok2 {
			return fmt.tprintf("%f", f64(i))
		}
	}

	// 4. If all else fails, use the hardcoded default
	return default_val_str
}


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

collect_all_nodes_unique :: proc(graph: ^Graph, node_map: ^map[int]Node) {
	if graph == nil {
		return
	}
	for node in graph.nodes {
		node_map[node.id] = node
		if node.type == "Instrument" {
			collect_all_nodes_unique(node.subgraph, node_map)
		}
	}
}

collect_exposed_params :: proc(graph: ^Graph, all_exposed: ^[dynamic]Exposed_Param) {
	if graph == nil {
		return
	}
	for node in graph.nodes {
		if node.exposed_parameters != nil {
			for param_name in node.exposed_parameters {
				append(all_exposed, Exposed_Param{node.id, param_name, node.type})
			}
		}
		if node.subgraph != nil {
			collect_exposed_params(node.subgraph, all_exposed)
		}
	}
}


generate_instrument_code :: proc(main_graph: ^Graph, inst_node: Node, sb: ^strings.Builder, exposed_map: ^map[int]map[string]struct{}) {
	if inst_node.subgraph == nil {
		fmt.sbprintf(sb, "\t// WARNING: Instrument node %d has no subgraph.\n", inst_node.id)
		fmt.sbprintf(sb, "\tnode_%d_out = 0.0;\n", inst_node.id)
		return
	}

	fmt.sbprintf(sb, "\t// --- Instrument Node %d ---\n", inst_node.id)
	subgraph_sort_result := topological_sort(inst_node.subgraph)

	for sub_node in subgraph_sort_result.sorted_nodes {
		switch sub_node.type {
		case "GraphInput":
			port_name: string
			if val, ok := sub_node.parameters["name"]; ok {
				if str, ok2 := val.(string); ok2 {
					port_name = str
				}
			}
			input_str := "0.0"
			if input_node_id, ok := find_input_for_port(main_graph, inst_node.id, port_name); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			fmt.sbprintf(sb, "\tnode_%d_out = %s; // From instrument input '%s'\n", sub_node.id, input_str, port_name)

		case "GraphOutput":
			input_str := "0.0"
			if input_node_id, ok := find_input_for_port(inst_node.subgraph, sub_node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			fmt.sbprintf(sb, "\tnode_%d_out = %s;\n", inst_node.id, input_str)

		case "Oscillator":
			freq_str := get_param_value_str(inst_node.subgraph, sub_node, "frequency", "input_freq", "440.0", exposed_map)
			amp_str := get_param_value_str(inst_node.subgraph, sub_node, "amplitude", "input_amp", "0.5", exposed_map)
			waveform: string = "Sine"
			if val, ok := sub_node.parameters["waveform"]; ok {
				if w, ok2 := val.(string); ok2 {
					waveform = w
				}
			}

			fmt.sbprintf(sb, "\t// (sub) --- Oscillator Node %d ---\n", sub_node.id)
			fmt.sbprintf(sb, "\tp.osc_%d.phase += 2 * math.PI * (%s) / sample_rate;\n", sub_node.id, freq_str)
			fmt.sbprintf(sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", sub_node.id, sub_node.id)
			switch waveform {
			case "Sawtooth":
				fmt.sbprintf(sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * (%s));\n", sub_node.id, sub_node.id, amp_str)
			case "Square":
				fmt.sbprintf(sb, "\tif math.sin(p.osc_%d.phase) > 0 {{ node_%d_out = %s; }} else {{ node_%d_out = -%s; }}\n", sub_node.id, sub_node.id, amp_str, sub_node.id, amp_str)
			case "Triangle":
				fmt.sbprintf(sb, "\tnode_%d_out = f32((2.0 / math.PI) * math.asin(math.sin(p.osc_%d.phase)) * (%s));\n", sub_node.id, sub_node.id, amp_str)
			case "Sine":
				fallthrough
			case:
				fmt.sbprintf(sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * (%s));\n", sub_node.id, sub_node.id, amp_str)
			}

		case "ADSR":
			input_str := "0.0"
			if id, ok := find_input_for_port(inst_node.subgraph, sub_node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", id)
			}
			attack_str    := get_param_value_str(inst_node.subgraph, sub_node, "attack", "input_attack", "0.01", exposed_map)
			decay_str     := get_param_value_str(inst_node.subgraph, sub_node, "decay", "input_decay", "0.1", exposed_map)
			sustain_str   := get_param_value_str(inst_node.subgraph, sub_node, "sustain", "input_sustain", "0.5", exposed_map)
			note_duration: f64 = 1.0

			fmt.sbprintf(sb, "\t// (sub) --- ADSR Node %d ---\n", sub_node.id)
			fmt.sbprintf(sb, "\tattack_samples_%d  := u64(%s * sample_rate);\n", sub_node.id, attack_str)
			fmt.sbprintf(sb, "\tdecay_samples_%d   := u64(%s * sample_rate);\n", sub_node.id, decay_str)
			fmt.sbprintf(sb, "\tnote_samples_%d    := u64(%.4f * sample_rate);\n", sub_node.id, note_duration)
			fmt.sbprintf(sb, "\tenvelope_%d: f32 = 0.0;\n", sub_node.id)
			fmt.sbprintf(sb, "\tif time_in_samples < attack_samples_%d {{ envelope_%d = f32(time_in_samples) / f32(attack_samples_%d); }}", sub_node.id, sub_node.id, sub_node.id)
			fmt.sbprintf(sb, " else if time_in_samples < attack_samples_%d + decay_samples_%d {{ time_after_attack_%d := f32(time_in_samples - attack_samples_%d); envelope_%d = 1.0 - (time_after_attack_%d / f32(decay_samples_%d) * (1.0 - %s)); }}", sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sub_node.id, sustain_str)
			fmt.sbprintf(sb, " else if time_in_samples < note_samples_%d {{ envelope_%d = %s; }}", sub_node.id, sub_node.id, sustain_str)
			fmt.sbprintf(sb, " else {{ envelope_%d = 0.0; }}\n", sub_node.id)
			fmt.sbprintf(sb, "\tnode_%d_out = (%s) * envelope_%d;\n", sub_node.id, input_str, sub_node.id)

		case "Noise":
			amp_str := get_param_value_str(inst_node.subgraph, sub_node, "amplitude", "input_amp", "1.0", exposed_map)
			fmt.sbprintf(sb, "\t// (sub) --- Noise Node %d ---\n", sub_node.id)
			fmt.sbprintf(sb, "\tif p.noise_%d.seed == 0 {{ p.noise_%d.seed = 42; }}\n", sub_node.id, sub_node.id)
			fmt.sbprintf(sb, "\tp.noise_%d.seed = p.noise_%d.seed * 1664525 + 1013904223;\n", sub_node.id, sub_node.id)
			fmt.sbprintf(sb, "\tnode_%d_out = (f32(p.noise_%d.seed) / f32(0x7FFFFFFF) - 1.0) * %s;\n", sub_node.id, sub_node.id, amp_str)
		}
	}
	fmt.sbprintf(sb, "\t// --- End Instrument Node %d ---\n\n", inst_node.id)
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
	defer delete(graph.nodes)

	for raw_node, i in graph_raw.nodes {
		node := &graph.nodes[i]
		node.id = raw_node.id
		node.type = raw_node.type
		node.position = raw_node.position
		node.parameters = raw_node.parameters
		node.exposed_parameters = raw_node.exposed_parameters
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

	output_node_count := 0
	output_node: Node
	for node in graph.nodes {
		if node.type == "GraphOutput" {
			output_node_count += 1
			output_node = node
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

	all_stateful_nodes := make([dynamic]Node)
	defer delete(all_stateful_nodes)
	collect_stateful_nodes(&graph, &all_stateful_nodes)

	all_nodes_map := make(map[int]Node)
	defer delete(all_nodes_map)
	collect_all_nodes_unique(&graph, &all_nodes_map)

	exposed_params := make([dynamic]Exposed_Param)
	defer delete(exposed_params)
	collect_exposed_params(&graph, &exposed_params)

	exposed_param_map := make(map[int]map[string]struct{})
	defer delete(exposed_param_map)
	for param in exposed_params[:] {
		if _, ok := exposed_param_map[param.node_id]; !ok {
			exposed_param_map[param.node_id] = make(map[string]struct{})
		}
		inner_map := exposed_param_map[param.node_id]
		inner_map[param.param_name] = {}
	}


	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

	strings.write_string(&sb, "package generated_audio\n\n")
	strings.write_string(&sb, "import \"core:math\"\n")
	strings.write_string(&sb, "import \"core:time\"\n")
	strings.write_string(&sb, "import \"base:runtime\"\n\n")

	for node in all_stateful_nodes[:] {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "Oscillator_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tphase: f32,\n")
			strings.write_string(&sb, "}\n\n") // FIXED
		case "Filter":
			fmt.sbprintf(&sb, "Filter_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tz1: f32,\n")
			strings.write_string(&sb, "}\n\n") // FIXED
		case "Noise":
			fmt.sbprintf(&sb, "Noise_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tseed: u32,\n")
			strings.write_string(&sb, "}\n\n") // FIXED
		}
	}

	strings.write_string(&sb, "AudioProcessor :: struct {\n")
	if len(exposed_params) > 0 {
		strings.write_string(&sb, "\t// --- Exposed Parameters ---\n")
		for param in exposed_params[:] {
			fmt.sbprintf(&sb, "\tnode_%d_%s: f32,\n", param.node_id, param.param_name)
		}
		strings.write_string(&sb, "\n")
	}

	strings.write_string(&sb, "\t// --- Internal State ---\n")
	for node in all_stateful_nodes[:] {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "\tosc_%d: Oscillator_%d_State,\n", node.id, node.id)
		case "Filter":
			fmt.sbprintf(&sb, "\tfilter_%d: Filter_%d_State,\n", node.id, node.id)
		case "Noise":
			fmt.sbprintf(&sb, "\tnoise_%d: Noise_%d_State,\n", node.id, node.id)
		}
	}
	strings.write_string(&sb, "}\n\n")

	strings.write_string(&sb, "init_processor :: proc(p: ^AudioProcessor) {\n")
	if len(exposed_params) > 0 {
		strings.write_string(&sb, "\t// Initialize exposed parameters to their defaults\n")
		for param in exposed_params[:] {
			node := all_nodes_map[param.node_id]
			default_val_str := "0.0" 
			if val, ok := node.parameters[param.param_name]; ok {
				if f, ok2 := val.(f64); ok2 { default_val_str = fmt.tprintf("%f", f) } else if i, ok2 := val.(i64); ok2 { default_val_str = fmt.tprintf("%f", f64(i)) }
			}
			fmt.sbprintf(&sb, "\tp.node_%d_%s = %s;\n", param.node_id, param.param_name, default_val_str)
		}
	}
	strings.write_string(&sb, "}\n\n")

	if len(exposed_params) > 0 {
		strings.write_string(&sb, "// --- Public Setter Functions ---\n")
		for param in exposed_params[:] {
			fmt.sbprintf(&sb, "set_node_%d_%s :: proc(p: ^AudioProcessor, value: f32) {{\n", param.node_id, param.param_name)
			fmt.sbprintf(&sb, "\tp.node_%d_%s = value;\n", param.node_id, param.param_name)
			strings.write_string(&sb, "}\n\n") // FIXED
		}
	}


	strings.write_string(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {\n")

	for _, node in all_nodes_map {
		fmt.sbprintf(&sb, "\tnode_%d_out: f32;\n", node.id)
	}
	strings.write_string(&sb, "\n")

	for node in sort_result.sorted_nodes {
		if node.type == "GraphOutput" {
			continue
		}

		switch node.type {
		case "Oscillator":
			freq_str := get_param_value_str(&graph, node, "frequency", "input_freq", "440.0", &exposed_param_map)
			amp_str := get_param_value_str(&graph, node, "amplitude", "input_amp", "0.5", &exposed_param_map)
			waveform: string = "Sine"
			if val, ok := node.parameters["waveform"]; ok {
				if w, ok2 := val.(string); ok2 {
					waveform = w
				}
			}

			fmt.sbprintf(&sb, "\t// --- Oscillator Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * (%s) / sample_rate;\n", node.id, freq_str)
			fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", node.id, node.id)
			switch waveform {
			case "Sawtooth":
				fmt.sbprintf(&sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * (%s));\n\n", node.id, node.id, amp_str)
			case "Square":
				fmt.sbprintf(&sb, "\tif math.sin(p.osc_%d.phase) > 0 {{ node_%d_out = %s; }} else {{ node_%d_out = -%s; }}\n\n", node.id, node.id, amp_str, node.id, amp_str)
			case "Triangle":
				fmt.sbprintf(&sb, "\tnode_%d_out = f32((2.0 / math.PI) * math.asin(math.sin(p.osc_%d.phase)) * (%s));\n\n", node.id, node.id, amp_str)
			case "Sine":
				fallthrough
			case:
				fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * (%s));\n\n", node.id, node.id, amp_str)
			}

		case "ADSR":
			input_str := "0.0"
			if id, ok := find_input_for_port(&graph, node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", id)
			}
			attack_str    := get_param_value_str(&graph, node, "attack", "input_attack", "0.01", &exposed_param_map)
			decay_str     := get_param_value_str(&graph, node, "decay", "input_decay", "0.1", &exposed_param_map)
			sustain_str   := get_param_value_str(&graph, node, "sustain", "input_sustain", "0.5", &exposed_param_map)
			release_str   := get_param_value_str(&graph, node, "release", "input_release", "1.0", &exposed_param_map)
			note_duration: f64 = 1.0

			fmt.sbprintf(&sb, "\t// --- ADSR Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tattack_samples_%d  := u64(%s * sample_rate);\n", node.id, attack_str)
			fmt.sbprintf(&sb, "\tdecay_samples_%d   := u64(%s * sample_rate);\n", node.id, decay_str)
			fmt.sbprintf(&sb, "\tnote_samples_%d    := u64(%.4f * sample_rate);\n", node.id, note_duration) // Using static duration for now
			fmt.sbprintf(&sb, "\tenvelope_%d: f32 = 0.0;\n", node.id)
			fmt.sbprintf(&sb, "\tif time_in_samples < attack_samples_%d {{ envelope_%d = f32(time_in_samples) / f32(attack_samples_%d); }}", node.id, node.id, node.id)
            // FIXED: Changed sub_node to node
			fmt.sbprintf(&sb, " else if time_in_samples < attack_samples_%d + decay_samples_%d {{ time_after_attack_%d := f32(time_in_samples - attack_samples_%d); envelope_%d = 1.0 - (time_after_attack_%d / f32(decay_samples_%d) * (1.0 - %s)); }}", node.id, node.id, node.id, node.id, node.id, node.id, node.id, sustain_str)
			fmt.sbprintf(&sb, " else if time_in_samples < note_samples_%d {{ envelope_%d = %s; }}", node.id, node.id, sustain_str)
			fmt.sbprintf(&sb, " else {{ envelope_%d = 0.0; }}\n", node.id) // Simplified release for now
			fmt.sbprintf(&sb, "\tnode_%d_out = (%s) * envelope_%d;\n\n", node.id, input_str, node.id)

		case "Noise":
			amp_str := get_param_value_str(&graph, node, "amplitude", "input_amp", "1.0", &exposed_param_map)
			fmt.sbprintf(&sb, "\t// --- Noise Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tif p.noise_%d.seed == 0 {{ p.noise_%d.seed = 42; }}\n", node.id, node.id)
			fmt.sbprintf(&sb, "\tp.noise_%d.seed = p.noise_%d.seed * 1664525 + 1013904223;\n", node.id, node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out = (f32(p.noise_%d.seed) / f32(0x7FFFFFFF) - 1.0) * %s;\n\n", node.id, node.id, amp_str)

		case "Instrument":
			generate_instrument_code(&graph, node, &sb, &exposed_param_map)
		}
	}

	// --- Generate final output stage ---
	input_str := "0.0"
	if input_node_id, ok := find_input_for_port(&graph, output_node.id, "input"); ok {
		input_str = fmt.tprintf("node_%d_out", input_node_id)
	}
	fmt.sbprintf(&sb, "\treturn %s, %s;\n", input_str, input_str)

	strings.write_string(&sb, "}\n")

	fmt.printf("%s", strings.to_string(sb))
}
