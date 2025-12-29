package skald_codegen

import "core:fmt"
import "core:os"
import "core" 
import json "core:encoding/json"

main :: proc() {
	// Parse arguments
	name := "Default"
	input_file := ""
	output_file := ""

	for arg in os.args {
		if len(arg) > 6 && arg[0:6] == "-name:" {
			name = arg[6:]
		}
		if len(arg) > 4 && arg[0:4] == "-in:" {
			input_file = arg[4:]
		}
		if len(arg) > 5 && arg[0:5] == "-out:" {
			output_file = arg[5:]
		}
	}

	input_bytes: []byte
	read_bool: bool
	if input_file != "" {
		input_bytes, read_bool = os.read_entire_file(input_file)
		if !read_bool {
			fmt.eprintf("Error reading input file: %s\n", input_file)
			os.exit(1)
		}
	} else {
		input_bytes, read_bool = os.read_entire_file_from_handle(os.stdin)
		if !read_bool {
			fmt.eprintf("Error reading from stdin\n")
			os.exit(1)
		}
	}
	defer delete(input_bytes)

	graph_raw: core.Graph_Raw
	parse_err := json.unmarshal(input_bytes, &graph_raw)
	if parse_err != nil {
		fmt.eprintf("Error parsing JSON: %v\n", parse_err)
		os.exit(1)
	} 

	graph := core.build_graph_from_raw(&graph_raw)

	generated_code := core.generate_processor_code(&graph, name)

	if output_file != "" {
		write_bool := os.write_entire_file(output_file, transmute([]byte)generated_code)
		if !write_bool {
			fmt.eprintf("Error writing output file: %s\n", output_file)
			os.exit(1)
		}
	} else {
		fmt.print(generated_code)
	}
}
