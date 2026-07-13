package skald_core

import "core:fmt"
import "core:os"
import "core:strconv"
import "core:strings"
import json "core:encoding/json"

// =================================================================================
// Connection validation — fail loudly on wires the generators would ignore.
//
// Every generator pulls its inputs with find_inputs_for_port(<exact port name>).
// A connection whose to_port names anything else is simply never asked for:
// codegen prints "OK", exits 0, and ships an asset with that wire missing.
// (Proven in the Phase-3 production trial: a typoed 'input_freq' turned a
// laser sweep into a static 440 Hz tone with no warning.) The same applies to
// dangling node ids and unknown from_ports. This validator is the single
// source of truth for port names; if you add a port to a generator, add it
// here or every graph using it will be rejected.
// =================================================================================

// Valid to_port names per node type, mirroring the find_inputs_for_port /
// get_f32_param calls in each generator. Mixer is handled separately
// (input_1..input_N by inputCount). File-scope arrays: Odin forbids
// returning slice literals backed by the stack frame.
@(private = "file") OSC_INPUTS := [?]string{"input_freq", "input_amp", "input_pulseWidth"}
@(private = "file") ADSR_INPUTS := [?]string{"input", "input_attack", "input_decay", "input_sustain", "input_release"}
@(private = "file") NOISE_INPUTS := [?]string{"input_amp"}
@(private = "file") FILTER_INPUTS := [?]string{"input", "input_cutoff", "input_res"}
@(private = "file") FM_INPUTS := [?]string{"input_mod", "input_freq"}
@(private = "file") WAVETABLE_INPUTS := [?]string{"input_freq", "input_pos", "input_amp"}
@(private = "file") THROUGH_INPUTS := [?]string{"input"}
@(private = "file") PANNER_INPUTS := [?]string{"input", "input_pan"}
@(private = "file") GAIN_INPUTS := [?]string{"input", "input_gain"}
// Returns (allowed ports, whether the node type is known). Unknown types are
// accepted here — the emission dispatch reports them with its own error.
valid_input_ports :: proc(node_type: string) -> ([]string, bool) {
	switch node_type {
	case "Oscillator":
		return OSC_INPUTS[:], true
	case "ADSR":
		return ADSR_INPUTS[:], true
	case "Noise":
		return NOISE_INPUTS[:], true
	case "Filter":
		return FILTER_INPUTS[:], true
	case "FmOperator":
		return FM_INPUTS[:], true
	case "Wavetable":
		return WAVETABLE_INPUTS[:], true
	case "Delay", "Reverb", "Distortion", "Mapper", "GraphOutput":
		return THROUGH_INPUTS[:], true
	case "Panner":
		return PANNER_INPUTS[:], true
	case "Gain":
		return GAIN_INPUTS[:], true
	case "LFO", "SampleHold", "MidiInput":
		return nil, true // sources only — no modulation inputs
	}
	return nil, false
}

// Valid from_port names per source node type. "" and "output" mean the
// default output everywhere.
valid_output_port :: proc(node_type: string, port: string) -> bool {
	if port == "" || port == "output" do return true
	switch node_type {
	case "MidiInput":
		return port == "pitch" || port == "gate" || port == "velocity"
	case "Panner":
		return port == "output_left" || port == "output_right"
	}
	return false
}

@(private = "file")
mixer_input_count :: proc(node: Node) -> int {
	count := 8
	if val, ok := node.parameters["inputCount"]; ok {
		#partial switch v in val {
		case json.Float:   count = int(v)
		case json.Integer: count = int(v)
		}
	}
	if count < 1 do count = 1
	if count > 32 do count = 32
	return count
}

validate_connections :: proc(graph: ^Graph, inst_name: string) {
	for conn in graph.connections {
		from_node, from_ok := graph.nodes[conn.from_node]
		if !from_ok {
			fmt.eprintf(
				"Error: instrument %q has a connection from node id %q, which does not exist in the graph. The wire would be silently dropped — remove or fix it.\n",
				inst_name, conn.from_node)
			os.exit(1)
		}
		to_node, to_ok := graph.nodes[conn.to_node]
		if !to_ok {
			fmt.eprintf(
				"Error: instrument %q has a connection to node id %q, which does not exist in the graph. The wire would be silently dropped — remove or fix it.\n",
				inst_name, conn.to_node)
			os.exit(1)
		}

		if !valid_output_port(from_node.type, conn.from_port) {
			fmt.eprintf(
				"Error: instrument %q: connection from %s(%s) uses unknown output port %q. Valid: \"output\"%s.\n",
				inst_name, from_node.type, from_node.id, conn.from_port,
				from_node.type == "MidiInput" ? ", \"pitch\", \"gate\", \"velocity\"" : from_node.type == "Panner" ? ", \"output_left\", \"output_right\"" : "")
			os.exit(1)
		}

		if to_node.type == "Mixer" {
			ok := false
			if strings.has_prefix(conn.to_port, "input_") {
				if n, parse_ok := strconv.parse_int(conn.to_port[len("input_"):]); parse_ok {
					ok = n >= 1 && n <= mixer_input_count(to_node)
				}
			}
			if !ok {
				fmt.eprintf(
					"Error: instrument %q: connection into Mixer(%s) uses port %q, but this mixer accepts input_1..input_%d. The wire would be silently ignored.\n",
					inst_name, to_node.id, conn.to_port, mixer_input_count(to_node))
				os.exit(1)
			}
			continue
		}

		allowed, known := valid_input_ports(to_node.type)
		if !known do continue // unknown node type — emission dispatch reports it
		found := false
		for p in allowed {
			if conn.to_port == p {
				found = true
				break
			}
		}
		if !found {
			sb := strings.builder_make(context.temp_allocator)
			for p, i in allowed {
				if i > 0 do fmt.sbprint(&sb, ", ")
				fmt.sbprintf(&sb, "%q", p)
			}
			valid_list := len(allowed) > 0 ? strings.to_string(sb) : "(none — this node type has no inputs)"
			fmt.eprintf(
				"Error: instrument %q: connection into %s(%s) uses unknown input port %q — the wire would be silently ignored and the asset would sound wrong. Valid ports for %s: %s.\n",
				inst_name, to_node.type, to_node.id, conn.to_port, to_node.type, valid_list)
			os.exit(1)
		}
	}
}
