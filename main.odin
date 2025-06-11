// File: main.odin
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

// --- Main procedure: Reads JSON, generates Odin code ---
main :: proc() {
	// 1. Read the entire standard input.
	input_bytes, read_err := os.read_entire_file_from_handle(os.stdin)
	if read_err != true {
		fmt.eprintf("Error reading from stdin: %v\n", read_err)
		os.exit(1)
	}

	// 2. Parse the input bytes as a Graph object.
	graph: Graph
	parse_err := json.unmarshal(input_bytes, &graph)
	if parse_err != nil {
		fmt.eprintf("Error parsing JSON: %v\n", parse_err)
		os.exit(1)
	}

	// 3. Use a string builder for efficient code generation.
	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

	// --- Start Generating Code ---
	strings.write_string(&sb, "package generated_audio\n\n")
	strings.write_string(&sb, "import \"core:math\"\n\n")

	// Generate state structs for nodes that need them (e.g., Oscillators).
	for node in graph.nodes {
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "Oscillator_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tphase: f32,\n")
			strings.write_string(&sb, "}\n\n")
		}
	}

	// Generate the main AudioProcessor struct holding all node states.
	strings.write_string(&sb, "AudioProcessor :: struct {\n")
	for node in graph.nodes {
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "\tosc_%d: Oscillator_%d_State,\n", node.id, node.id)
		}
	}
	strings.write_string(&sb, "}\n\n")

	// Generate the main process_sample procedure. THIS IS THE CRITICAL PART.
	// It must NOT contain any context-requiring calls.
	strings.write_string(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32) -> (left: f32, right: f32) {\n")
	
	// Declare local variables for the output of each node.
	for node in graph.nodes {
		fmt.sbprintf(&sb, "\tnode_%d_out: f32\n", node.id)
	}
	strings.write_string(&sb, "\n")

	// Generate the processing logic for each node.
	for node in graph.nodes {
		switch node.type {
		case "Oscillator":
			// Safely get parameters from the JSON object.
			freq: f64 = 440.0 // Default frequency
			amp: f64 = 0.5   // Default amplitude
			if freq_val, ok := node.parameters["frequency"]; ok { if f, ok2 := freq_val.(f64); ok2 { freq = f } }
			if amp_val, ok := node.parameters["amplitude"]; ok { if a, ok2 := amp_val.(f64); ok2 { amp = a } }

			// Generate the pure math logic for the oscillator.
			fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * %f);\n", node.id, node.id, amp)
			fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * %f / sample_rate;\n", node.id, freq)
			fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n\n", node.id, node.id)
		
		case "GraphOutput":
			// Find the node connected to this output.
			input_source_node_id := -1
			for conn in graph.connections {
				if conn.to_node == node.id {
					input_source_node_id = conn.from_node
					break
				}
			}

			// Generate the output assignment logic.
			if input_source_node_id != -1 {
				fmt.sbprintf(&sb, "\tnode_%d_out = node_%d_out;\n", node.id, input_source_node_id)
			} else {
				fmt.sbprintf(&sb, "\tnode_%d_out = 0.0;\n", node.id) // Default to silence if nothing is connected.
			}
			// Finally, return the output value.
			fmt.sbprintf(&sb, "\treturn node_%d_out, node_%d_out;\n", node.id, node.id)
		}
	}

	strings.write_string(&sb, "}\n")

	// 4. Print the final generated code to standard output.
	fmt.printf("%s", strings.to_string(sb))
}