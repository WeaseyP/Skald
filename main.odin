// main.odin
package skald_codegen

import "core:fmt"
import "core:os"
import "core:strings"
import "core:math"
import json "core:encoding/json"
// NOTE: "core:container/map" was removed as 'map' is a built-in type.

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

// --- Task-22: Topological Sort Implementation (Corrected) ---
// Sorts the graph nodes into a valid processing order.
// Returns a list of sorted nodes. If a cycle is detected, returns is_dag = false.
topological_sort :: proc(graph: ^Graph) -> Topo_Sort_Result {
    // Correctly declare and initialize maps.
    in_degree := make(map[int]int)
    defer delete(in_degree)
    
    node_map := make(map[int]Node)
    defer delete(node_map)

    // Initialize in_degree for all nodes and populate the node_map for easy lookup.
    for node in graph.nodes {
        in_degree[node.id] = 0
        node_map[node.id] = node
    }

    // Calculate in_degrees for each node.
    for conn in graph.connections {
        // Use map access syntax to update the degree count.
        if val, ok := in_degree[conn.to_node]; ok {
            in_degree[conn.to_node] = val + 1
        }
    }

    // Initialize queue with all nodes that have an in_degree of 0.
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
        
        // Use the "comma ok" idiom to safely get the node from the map.
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
    // NOTE: slice_to_array is not needed when returning a slice directly.
    return {sorted_nodes[:], is_dag}
}


// --- Task-23: Port-Specific Connection Helper ---
// Finds the source node ID connected to a specific input port of a target node.
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
			freq_str := "440.0"
			if freq_val, ok := node.parameters["frequency"]; ok { if f, ok2 := freq_val.(f64); ok2 { freq_str = fmt.tprintf("%f", f) } }
			
            amp_str := "0.5"
			if amp_val, ok := node.parameters["amplitude"]; ok { if a, ok2 := amp_val.(f64); ok2 { amp_str = fmt.tprintf("%f", a) } }
			
            waveform: string = "Sine" 
			if wave_val, ok := node.parameters["waveform"]; ok { if w, ok2 := wave_val.(string); ok2 { waveform = w } }
			
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
			input_str := "0.0" // Default to silence
			if input_node_id, ok := find_input_for_port(&graph, node.id, "input"); ok {
				input_str = fmt.tprintf("node_%d_out", input_node_id)
			}
			
			cutoff_str := "1000.0" // Default cutoff
			if cutoff_val, ok := node.parameters["cutoff"]; ok { if c, ok2 := cutoff_val.(f64); ok2 { cutoff_str = fmt.tprintf("%f", c) } }

			fmt.sbprintf(&sb, "\t// --- Filter Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tb_%d := f32(1.0 - math.exp(-2.0 * math.PI * %s / sample_rate));\n", node.id, cutoff_str)
			fmt.sbprintf(&sb, "\tp.filter_%d.z1 = (%s * b_%d) + (p.filter_%d.z1 * (1.0 - b_%d));\n", node.id, input_str, node.id, node.id, node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out = p.filter_%d.z1;\n\n", node.id, node.id)


		case "GraphOutput":
			input_str := "0.0" // Default to silence
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