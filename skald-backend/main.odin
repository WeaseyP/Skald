package skald_codegen

import "core:fmt"
import "core:os"
import "core" 
import json "core:encoding/json"

main :: proc() {
	input_bytes, read_err := os.read_entire_file_from_handle(os.stdin)
	if read_err != true {
		// fmt.eprintf("Error reading from stdin: %v\n", read_err)
		os.exit(1)
	}

	graph_raw: core.Graph_Raw
	parse_err := json.unmarshal(input_bytes, &graph_raw)
	if parse_err != nil {
		// fmt.eprintf("Error parsing JSON: %v\n", parse_err)
		os.exit(1)
	} 

	graph := core.build_graph_from_raw(&graph_raw)

	generated_code := core.generate_processor_code(&graph)
	fmt.print(generated_code)
}
