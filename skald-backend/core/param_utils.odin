package skald_core

import "core:fmt"
import "core:strings"
import json "core:encoding/json"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================

// Map an arbitrary string (node id, label, instrument name — all user- or
// UI-controlled) onto a chunk that is safe to embed in an Odin identifier.
// Every non [A-Za-z0-9_] byte becomes '_'. When the result would start with
// a digit and the caller embeds it at the START of an identifier
// (allow_leading_digit=false), it gets an 'n' prefix — `2_pulseWidth` is a
// syntax error, `n2_pulseWidth` is not. Empty input yields "n".
sanitize_identifier :: proc(s: string, allow_leading_digit := false) -> string {
	sb := strings.builder_make()
	for i in 0 ..< len(s) {
		c := s[i]
		ok := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
		if ok {
			strings.write_byte(&sb, c)
		} else {
			strings.write_byte(&sb, '_')
		}
	}
	out := strings.to_string(sb)
	if len(out) == 0 {
		return "n"
	}
	if !allow_leading_digit && out[0] >= '0' && out[0] <= '9' {
		return fmt.tprintf("n%s", out)
	}
	return out
}

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

    // Fallback for callers that pass `nil` for graph. No node generator
    // does this anymore (they must not: the bare name breaks the moment
    // the collision resolver renames the struct field), but keep the path
    // as defense-in-depth for future call sites.
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

	// input_port == "" means "this param has no modulation port". Skipping
	// the lookup matters: a connection whose to_port is empty (corrupt or
	// hand-edited JSON) would otherwise match EVERY such param and get
	// summed into all of them (the mixer ring-mod bug).
	if graph != nil && input_port != "" {
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
