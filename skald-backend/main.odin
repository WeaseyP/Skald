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
	wasm_shim_file := ""
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
		if len(arg) > 11 && arg[0:11] == "-wasm-shim:" {
			wasm_shim_file = arg[11:]
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

    // Try parsing as Project first
	project_raw: core.Project_Raw
	parse_err := json.unmarshal(input_bytes, &project_raw)
    
    project: core.Project
    is_project := false

    if parse_err == nil && len(project_raw.project.instruments) > 0 {
        is_project = true
		project = core.build_project_from_raw(&project_raw)
    }

    if !is_project {
        // Try parsing as Graph (single instrument/test setup)
        graph_raw: core.Graph_Raw
        parse_err_g := json.unmarshal(input_bytes, &graph_raw)
        
        if parse_err_g == nil && len(graph_raw.nodes) > 0 {
             main_graph := core.build_graph_from_raw(&graph_raw)
             project = core.build_project_from_graph(&main_graph)
        } else {
             fmt.eprintf("Error: Input JSON must be valid Project or Graph.\nProject Error: %v\nGraph Error: %v\n", parse_err, parse_err_g)
             os.exit(1)
        }
    }

	// BUG-EMPTY-PROJECT-SILENT: a graph that lacks any instrument-typed
	// nodes silently produced an empty Project_State + no-op project_process
	// and exited 0. Make this a hard error — game devs need to notice when
	// their patch isn't being codegen'd.
	if len(project.instruments) == 0 {
		fmt.eprintf(
			"Error: input contains no instruments. Wrap nodes in an Instrument (Sidebar → Create Instrument) before generating.\n",
		)
		os.exit(1)
	}

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

	// Editor-preview support: also emit the wasm export shim (same package,
	// separate file) when asked. Game-facing generation never passes this.
	if wasm_shim_file != "" {
		shim_code := core.generate_wasm_shim_code(&project, package_name)
		if !os.write_entire_file(wasm_shim_file, transmute([]byte)shim_code) {
			fmt.eprintf("Error writing wasm shim file: %s\n", wasm_shim_file)
			os.exit(1)
		}
	}

	// Stdout used to carry just the literal "Package generated audio" status
	// line, which the Electron renderer was treating as the displayed code
	// preview (BUG-CODE-PREVIEW-WRONG). The renderer is now patched to read
	// the output file directly; this status line is kept for shell scripts
	// piping codegen output.
	fmt.printf("Codegen OK: %d instrument(s) -> %s\n", len(project.instruments), target_file)
}
