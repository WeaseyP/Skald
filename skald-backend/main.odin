// main.odin
package skald_codegen

import "core:fmt"
import "core:os"
import "core:strings"
import "core:math"
import json "core:encoding/json"

// --- Data structures for parsing the JSON graph ---
Vec2 :: struct { 
	x: f32,
	y: f32, 
}
Node :: struct { 
	id: int, 
	type: string, 
	position: Vec2, 
	parameters: json.Object, 
}
Connection :: struct { 
	from_node: int, 
	from_port: string, 
	to_node: int, 
	to_port: string, 
}
Graph :: struct { 
	nodes: []Node, 
	connections: []Connection, 
}

// Helper struct to hold the results of the topological sort.
Topo_Sort_Result :: struct {
    sorted_nodes: []Node,
    is_dag:       bool, // Is it a Directed Acyclic Graph?
}

// --- Topological Sort Implementation ---
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


// --- Port-Specific Connection Helper ---
find_input_for_port :: proc(graph: ^Graph, target_node_id: int, target_port: string) -> (id: int, ok: bool) {
    for conn in graph.connections {
        if conn.to_node == target_node_id && conn.to_port == target_port {
            return conn.from_node, true
        }
    }
    return -1, false
}


// --- Main procedure: Reads JSON, generates Odin code ---
main :: proc() {
	input_bytes, read_err := os.read_entire_file_from_handle(os.stdin)
	if read_err != true {
		fmt.eprintf("Error reading from stdin: %v\n", read_err)
		os.exit(1)
	}

	graph: Graph
	parse_err := json.unmarshal(input_bytes, &graph)
	if parse_err != nil {
		fmt.eprintf("Error parsing JSON: %v\n", parse_err)
		os.exit(1)
	}
    
    // --- Validate Graph Structure ---
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

    // --- Run Topological Sort ---
    sort_result := topological_sort(&graph)
    if !sort_result.is_dag {
        fmt.eprintln("Error: Audio graph contains a cycle and cannot be processed.")
        os.exit(1)
    }

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

	// --- Start Generating Code ---
	strings.write_string(&sb, "package generated_audio\n\n")
	strings.write_string(&sb, "import \"core:math\"\n\n")

	for node in sort_result.sorted_nodes {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "Oscillator_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tphase: f32,\n")
			strings.write_string(&sb, "}\n\n")
		case "Filter":
			fmt.sbprintf(&sb, "Filter_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tz1: f32, // Stores the previous output sample for the IIR filter\n")
			strings.write_string(&sb, "}\n\n")
		}
	}

	strings.write_string(&sb, "AudioProcessor :: struct {\n")
	for node in sort_result.sorted_nodes {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "\tosc_%d: Oscillator_%d_State,\n", node.id, node.id)
		case "Filter":
			fmt.sbprintf(&sb, "\tfilter_%d: Filter_%d_State,\n", node.id, node.id)
		}
	}
	strings.write_string(&sb, "}\n\n")

	strings.write_string(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32) -> (left: f32, right: f32) {\n")
	
	for node in sort_result.sorted_nodes {
		fmt.sbprintf(&sb, "\tnode_%d_out: f32\n", node.id)
	}
	strings.write_string(&sb, "\n")

    // --- Generate node processing logic using the sorted order ---
	for node in sort_result.sorted_nodes {
		switch node.type {
		case "Oscillator":
			freq_str: string
			amp_str:  string

			if freq_input_node_id, ok := find_input_for_port(&graph, node.id, "input_freq"); ok {
                freq_str = fmt.tprintf("node_%d_out", freq_input_node_id)
            } else if freq_val, ok := node.parameters["frequency"]; ok {
				// ✅ FIX 1: Handle float OR integer from JSON
				if f, ok_f64 := freq_val.(f64); ok_f64 {
					freq_str = fmt.tprintf("%f", f)
				} else if i, ok_i64 := freq_val.(i64); ok_i64 {
					freq_str = fmt.tprintf("%f", f64(i))
				}
			}

			if amp_input_node_id, ok := find_input_for_port(&graph, node.id, "input_amp"); ok {
                amp_str = fmt.tprintf("node_%d_out", amp_input_node_id)
            } else if amp_val, ok := node.parameters["amplitude"]; ok {
				// ✅ FIX 2: Handle float OR integer from JSON
				if a, ok_f64 := amp_val.(f64); ok_f64 {
					amp_str = fmt.tprintf("%f", a)
				} else if i, ok_i64 := amp_val.(i64); ok_i64 {
					amp_str = fmt.tprintf("%f", f64(i))
				}
			}
			
            waveform: string = "Sine" 
			if wave_val, ok := node.parameters["waveform"]; ok { if w, ok2 := wave_val.(string); ok2 { waveform = w } }
			
			fmt.sbprintf(&sb, "\t// --- Oscillator Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * %s / sample_rate;\n", node.id, freq_str)
			fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", node.id, node.id)
			
			switch waveform {
			case "Sawtooth":
				fmt.sbprintf(&sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * %s);\n\n", node.id, node.id, amp_str)
			case "Sine": fallthrough
			case:
				fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * %s);\n\n", node.id, node.id, amp_str)
			}
		
		case "Filter":
			input_str := "0.0"
			if input_node_id, ok := find_input_for_port(&graph, node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			
			cutoff_str: string
			if cutoff_val, ok := node.parameters["cutoff"]; ok {
				// ✅ FIX 3: Handle float OR integer from JSON
				if c, ok_f64 := cutoff_val.(f64); ok_f64 {
					cutoff_str = fmt.tprintf("%f", c)
				} else if i, ok_i64 := cutoff_val.(i64); ok_i64 {
					cutoff_str = fmt.tprintf("%f", f64(i))
				}
			}

			fmt.sbprintf(&sb, "\t// --- Filter Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tb_%d := f32(1.0 - math.exp(-2.0 * math.PI * %s / sample_rate));\n", node.id, cutoff_str)
			fmt.sbprintf(&sb, "\tp.filter_%d.z1 = (%s * b_%d) + (p.filter_%d.z1 * (1.0 - b_%d));\n", node.id, input_str, node.id, node.id, node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out = p.filter_%d.z1;\n\n", node.id, node.id)


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
