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

	// Generate state structs for nodes that need them.
	for node in graph.nodes {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "Oscillator_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tphase: f32,\n")
			strings.write_string(&sb, "}\n\n")
		// NEW: Add a state struct for the Filter node.
		case "Filter":
			fmt.sbprintf(&sb, "Filter_%d_State :: struct {{\n", node.id)
			strings.write_string(&sb, "\tz1: f32, // Stores the previous output sample for the IIR filter\n")
			strings.write_string(&sb, "}\n\n")
		}
	}

	// Generate the main AudioProcessor struct holding all node states.
	strings.write_string(&sb, "AudioProcessor :: struct {\n")
	for node in graph.nodes {
		switch node.type {
		case "Oscillator":
			fmt.sbprintf(&sb, "\tosc_%d: Oscillator_%d_State,\n", node.id, node.id)
		// NEW: Add the filter's state to the main processor struct.
		case "Filter":
			fmt.sbprintf(&sb, "\tfilter_%d: Filter_%d_State,\n", node.id, node.id)
		}
	}
	strings.write_string(&sb, "}\n\n")

	// Generate the main process_sample procedure.
	strings.write_string(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32) -> (left: f32, right: f32) {\n")
	
	// Declare local variables for the output of each node.
	for node in graph.nodes {
		fmt.sbprintf(&sb, "\tnode_%d_out: f32\n", node.id)
	}
	strings.write_string(&sb, "\n")

	// Generate the processing logic for each node.
	// IMPORTANT: This assumes nodes in the JSON are in a valid topological order.
	for node in graph.nodes {
		switch node.type {
			case "Oscillator":
						// --- Get Parameters ---
						freq: f64 = 440.0
						amp: f64 = 0.5
						waveform: string = "Sine" // Default to Sine
						if freq_val, ok := node.parameters["frequency"]; ok { if f, ok2 := freq_val.(f64); ok2 { freq = f } }
						if amp_val, ok := node.parameters["amplitude"]; ok { if a, ok2 := amp_val.(f64); ok2 { amp = a } }
						if wave_val, ok := node.parameters["waveform"]; ok { if w, ok2 := wave_val.(string); ok2 { waveform = w } }
						
						// --- Generate phase update logic (same for all waveforms) ---
						fmt.sbprintf(&sb, "\tp.osc_%d.phase += 2 * math.PI * %f / sample_rate;\n", node.id, freq)
						fmt.sbprintf(&sb, "\tif p.osc_%d.phase > 2 * math.PI {{ p.osc_%d.phase -= 2 * math.PI; }}\n", node.id, node.id)
						
						// --- Generate waveform-specific output ---
						switch waveform {
						case "Sawtooth":
							// A sawtooth wave is rich in harmonics, perfect for filtering.
							// It's calculated by normalizing the phase from [0, 2*PI] to [-1, 1].
							fmt.sbprintf(&sb, "\tnode_%d_out = f32(((p.osc_%d.phase / math.PI) - 1.0) * %f);\n\n", node.id, node.id, amp)
						case "Sine": fallthrough // Fallthrough to Sine as the default
						case:
							// A pure sine wave has no harmonics.
							fmt.sbprintf(&sb, "\tnode_%d_out = f32(math.sin(p.osc_%d.phase) * %f);\n\n", node.id, node.id, amp)
						}
		
		// NEW: Add the processing logic for the Filter node.
		case "Filter":
			// Find the node connected to this filter's input.
			input_source_node_id := -1
			for conn in graph.connections {
				if conn.to_node == node.id {
					input_source_node_id = conn.from_node
					break
				}
			}

			// The input to the filter is the output of the connected node.
			input_str := "0.0" // Default to silence if not connected.
			if input_source_node_id != -1 {
				input_str = fmt.tprintf("node_%d_out", input_source_node_id)
			}
			
			// Get parameters
			cutoff: f64 = 1000.0 // Default cutoff frequency
			if cutoff_val, ok := node.parameters["cutoff"]; ok { if c, ok2 := cutoff_val.(f64); ok2 { cutoff = c } }

			// Generate the logic for a simple one-pole low-pass filter.
			// The coefficient 'b' is calculated from the cutoff frequency.
			// Because the cutoff is a constant from the JSON, the Odin compiler
			// will evaluate this 'math.exp' call at compile time, resulting in no runtime cost.
			fmt.sbprintf(&sb, "\t// --- Filter Node %d ---\n", node.id)
			fmt.sbprintf(&sb, "\tb_%d := f32(1.0 - math.exp(-2.0 * math.PI * %f / sample_rate));\n", node.id, cutoff)
			fmt.sbprintf(&sb, "\tp.filter_%d.z1 = (%s * b_%d) + (p.filter_%d.z1 * (1.0 - b_%d));\n", node.id, input_str, node.id, node.id, node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out = p.filter_%d.z1;\n\n", node.id, node.id)


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