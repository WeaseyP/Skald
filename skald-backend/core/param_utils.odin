package skald_core

import "core:fmt"
import "core:strings"
import json "core:encoding/json"

// =================================================================================
// SECTION C: Type-Safe Parameter Fetching System
// =================================================================================

// Format a numeric parameter as an *explicitly f32-typed* constant string,
// e.g. 440.0 -> "f32(440.000000000)".
//
// This is the structural fix for a bug class that was patched three times at
// individual sites (Mapper in_range, Distortion dist_in/dist_k/mix, ADSR
// math.max denominators): a bare literal like "440.000000000" is an *untyped*
// Odin constant. Pasted behind ':=' it defaults the local to f64, and folded
// into an all-literal initializer it silently makes the whole expression f64 —
// which then fails to compile against the f32 signal path. Wrapping every
// literal in f32(...) makes that untyped state unrepresentable at the source,
// so no current or future generator can reintroduce it via get_f32_param.
f32_literal :: proc(v: f64) -> string {
	return fmt.tprintf("f32(%.9f)", v)
}

// Emit a param-derived local with an explicit `: f32` type:
//   <indent><name>: f32 = <expr>;
// Generators MUST use this (never a bare `name := <param-expr>`) for any local
// whose initializer embeds a parameter/input expression. It carries the "this
// local is f32" invariant in one place instead of relying on each author to
// remember the annotation — the per-site vigilance contract that failed 3+
// times. See f32_literal for the companion source-side guard.
emit_f32_local :: proc(sb: ^strings.Builder, indent: string, name: string, expr: string) {
	fmt.sbprintf(sb, "%s%s: f32 = %s;\n", indent, name, expr)
}

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
    base_str := f32_literal(f64(default_val))

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
                base_str = f32_literal(f64(v))
            case json.Integer:
                base_str = f32_literal(f64(v))
            }
        } else if param_name == "mix" && (node.type == "Delay" || node.type == "Reverb") {
            if val, ok := node.parameters["wetDryMix"]; ok {
                #partial switch v in val {
                case json.Float:
                    base_str = f32_literal(f64(v))
                case json.Integer:
                    base_str = f32_literal(f64(v))
                }
            }
        } else if param_name == "delayTime" && node.type == "Delay" {
            if val, ok := node.parameters["time"]; ok {
                #partial switch v in val {
                case json.Float:
                    base_str = f32_literal(f64(v) / 1000.0)
                case json.Integer:
                    base_str = f32_literal(f64(v) / 1000.0)
                }
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
            // Accumulate through the temp allocator (fmt.tprintf) rather than a
            // builder we destroy on return: strings.to_string() aliases the
            // builder's buffer, so returning it after `defer builder_destroy`
            // handed back a dangling pointer. Callers that immediately pasted
            // it into one sbprintf survived by luck; a caller that reads it a
            // second time (e.g. through emit_f32_local's nested tprintf) got
            // freed memory. Temp strings live for the whole one-shot run.
            result := fmt.tprintf("(%s)", base_str)
            for src in sources {
                input_str := get_output_var(src.id, src.port)
                result = fmt.tprintf("%s + (%s)", result, input_str)
            }
            return result
        }
	}
	
	return base_str
}

// Sum every connection into a port: "(a + b + c)". One convention for all
// audio inputs — nodes that used find_input_for_port kept only the FIRST
// edge and silently dropped the rest (the editor preview plays them all).
sum_port_inputs :: proc(graph: ^Graph, node_id: string, port: string, default_str: string) -> string {
	if graph == nil do return default_str
	sources := find_inputs_for_port(graph, node_id, port)
	defer delete(sources)
	if len(sources) == 0 do return default_str
	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)
	for src, i in sources {
		v := get_output_var(src.id, src.port)
		if i == 0 do fmt.sbprint(&sb, v)
		else do fmt.sbprintf(&sb, " + %s", v)
	}
	return fmt.tprintf("(%s)", strings.to_string(sb))
}

get_bool_param :: proc(node: Node, param_name: string, default_val: bool) -> bool {
	if val, ok := node.parameters[param_name]; ok {
		if b, is_b := val.(json.Boolean); is_b do return bool(b)
	}
	return default_val
}

get_string_param :: proc(node: Node, param_name: string, default_val: string) -> string {
	if val, ok := node.parameters[param_name]; ok {
        #partial switch v in val {
		case json.String: 
             return v
        }
	}
	if param_name == "type" && node.type == "Filter" {
		if val, ok := node.parameters["filterType"]; ok {
			#partial switch v in val {
			case json.String:
				return v
			}
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
