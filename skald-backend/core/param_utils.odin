package skald_core

import "core:fmt"
import json "core:encoding/json"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================
get_output_var :: proc(node_id: int) -> string {
	return fmt.tprintf("node_%d_out", node_id)
}

get_f32_param :: proc(graph: ^Graph, node: Node, param_name: string, input_port: string, default_val: f32) -> string {
	base_str := fmt.tprintf("%f", default_val)
	if val, ok := node.parameters[param_name]; ok {
        #partial switch v in val {
        case json.Float:
            base_str = fmt.tprintf("%f", v)
		case json.Integer:
            base_str = fmt.tprintf("%f", f64(v))
        }
	}

	if graph != nil {
		if id, ok := find_input_for_port(graph, node.id, input_port); ok {
			input_str := get_output_var(id)
			return fmt.tprintf("(%s) + (%s)", base_str, input_str)
		}
	}
	
	return base_str
}

get_string_param :: proc(node: Node, param_name: string, default_val: string) -> string {
	if val, ok := node.parameters[param_name]; ok {
        #partial switch v in val {
		case json.String: 
             return v
        }
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
        #partial switch v in val {
		case json.Integer:
            return fmt.tprintf("%d", v)
		case json.Float:
            return fmt.tprintf("%d", int(v))
        }
	}
	return fmt.tprintf("%d", default_val)
}
