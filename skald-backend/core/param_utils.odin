package skald_core

import "core:fmt"
import "core:strings"
import json "core:encoding/json"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================
get_output_var :: proc(node_id: string, port_name: string = "") -> string {
    if port_name == "pitch" do return fmt.tprintf("node_%s_out_pitch", node_id)
    if port_name == "gate" do return fmt.tprintf("node_%s_out_gate", node_id)
    if port_name == "velocity" do return fmt.tprintf("node_%s_out_velocity", node_id)
    if port_name == "output_left" do return fmt.tprintf("node_%s_out_left", node_id)
    if port_name == "output_right" do return fmt.tprintf("node_%s_out_right", node_id)
	return fmt.tprintf("node_%s_out", node_id)
}

get_f32_param :: proc(graph: ^Graph, node: Node, param_name: string, input_port: string, default_val: f32) -> string {
    base_str := fmt.tprintf("%f", default_val)

    // Phase 3: prefer the codegen-computed resolution (which knows the
    // collision-free field name) over the raw exposedParameters list.
    is_exposed := false
    if graph != nil {
        key := fmt.tprintf("%s::%s", node.id, param_name)
        if res, found := graph.exposed_resolutions[key]; found {
            is_exposed = true
            base_str = fmt.tprintf("p.%s", res.field_name)
        }
    }

    // Fallback for callers that pass `nil` for graph (a couple of node
    // generators do this for params that can't be modulated by an input
    // wire). They never hit the resolution path, so just check the raw
    // exposedParameters list and use the bare name — harmless because
    // collision detection only fires when ≥ 2 nodes expose the same name,
    // and in that case the resolver will have rewritten the field anyway.
    if !is_exposed && graph == nil {
        if exposed_val, ok := node.parameters["exposedParameters"]; ok {
            if exposed_arr, is_arr := exposed_val.(json.Array); is_arr {
                for v in exposed_arr {
                    if s, is_str := v.(json.String); is_str && s == param_name {
                        is_exposed = true
                        base_str = fmt.tprintf("p.%s", param_name)
                        break
                    }
                }
            }
        }
    }

    if !is_exposed {
        if val, ok := node.parameters[param_name]; ok {
            #partial switch v in val {
            case json.Float:
                base_str = fmt.tprintf("%f", v)
            case json.Integer:
                base_str = fmt.tprintf("%f", f64(v))
            }
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
