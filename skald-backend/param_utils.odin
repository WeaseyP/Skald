package skald_codegen

import "core:fmt"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================
get_output_var :: proc(node_id: int) -> string {
	return fmt.tprintf("node_%d_out", node_id)
}

get_f32_param :: proc(graph: ^Graph, node: Node, param_name: string, input_port: string, default_val: f32) -> string {
	if graph != nil {
		if id, ok := find_input_for_port(graph, node.id, input_port); ok {
			return get_output_var(id)
		}
	}
	if val, ok := node.parameters[param_name]; ok {
		if f, ok2 := val.(f64); ok2 do return fmt.tprintf("%f", f)
		if i, ok2 := val.(i64); ok2 do return fmt.tprintf("%f", f64(i))
	}
	return fmt.tprintf("%f", default_val)
}

get_string_param :: proc(node: Node, param_name: string, default_val: string) -> string {
	if val, ok := node.parameters[param_name]; ok {
		if s, ok2 := val.(string); ok2 do return s
	}
	return default_val
}

get_int_param :: proc(graph: ^Graph, node: Node, param_name: string, input_port: string, default_val: int) -> string {
	if graph != nil {
		if id, ok := find_input_for_port(graph, node.id, input_port); ok {
			return get_output_var(id)
		}
	}
	if val, ok := node.parameters[param_name]; ok {
		if i, ok2 := val.(i64); ok2 do return fmt.tprintf("%d", i)
		if f, ok2 := val.(f64); ok2 do return fmt.tprintf("%d", int(f))
	}
	return fmt.tprintf("%d", default_val)
}
