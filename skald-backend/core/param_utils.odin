package skald_core

import "core:fmt"
import "core:strings"
import json "core:encoding/json"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================
get_output_var :: proc(node_id: int, port_name: string = "") -> string {
    if port_name == "pitch" do return fmt.tprintf("node_%d_out_pitch", node_id)
    if port_name == "gate" do return fmt.tprintf("node_%d_out_gate", node_id)
    if port_name == "velocity" do return fmt.tprintf("node_%d_out_velocity", node_id)
    if port_name == "output_left" do return fmt.tprintf("node_%d_out_left", node_id)
    if port_name == "output_right" do return fmt.tprintf("node_%d_out_right", node_id)
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
		sources := find_inputs_for_port(graph, node.id, input_port)
        defer delete(sources)
        if len(sources) > 0 {
            sb := strings.builder_make()
            defer strings.builder_destroy(&sb)
            fmt.sbprintf(&sb, "(%s)", base_str)
            for src, i in sources {
                input_str := get_output_var(src.id, src.port)
                fmt.sbprintf(&sb, " + (%s)", input_str)
            }
            return strings.to_string(sb)
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
		if id, port, ok := find_input_for_port(graph, node.id, input_port); ok {
			return get_output_var(id, port)
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
