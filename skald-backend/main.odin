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
	package_name := "generated_audio"

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
		if len(arg) > 9 && arg[0:9] == "-package:" {
			package_name = arg[9:]
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

	project_raw: core.Project_Raw
	parse_err := json.unmarshal(input_bytes, &project_raw)
	if parse_err != nil {
		fmt.eprintf("Error parsing JSON as Project: %v\n", parse_err)
        // Fallback or exit? For now exit.
		os.exit(1)
	} 

	project := core.build_project_from_raw(&project_raw)

	generated_code := core.generate_project_code(&project, name, package_name)

	// Always write to file. If output_file is empty, default to "generated_audio.odin"
	target_file := output_file
	if target_file == "" {
		target_file = "generated_audio.odin"
	}

	write_bool := os.write_entire_file(target_file, transmute([]byte)generated_code)
	if !write_bool {
		fmt.eprintf("Error writing output file: %s\n", target_file)
		os.exit(1)
	}

	// Always print success message to stdout, NEVER the code
	fmt.print("Package generated audio")
}
