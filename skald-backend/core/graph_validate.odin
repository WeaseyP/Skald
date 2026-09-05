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
// C5: FmOperator gained input_amp (F-A02-7) and Wavetable input_pulseWidth
// (F-A01-7), each mirroring the get_f32_param port its generator reads.
@(private = "file") FM_INPUTS := [?]string{"input_mod", "input_carrier", "input_freq", "input_amp"}
@(private = "file") WAVETABLE_INPUTS := [?]string{"input_freq", "input_pos", "input_amp", "input_pulseWidth"}
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
	case "LFO", "SampleHold", "MidiInput", "GraphInput":
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

// =================================================================================
// Preflight structural rules (roadmap packet B9-1 / B9-2).
//
// Each rule is a FINDER that returns what it found plus a caller that turns the
// finding into a hard error. The split exists so `odin test tests\unit` can
// exercise the rule (tests/unit/preflight_test.odin): every other hard-error
// path in the codegen calls os.exit(1) inline and therefore has no in-process
// test at all — the exit would take the test binary with it.
// =================================================================================

/// SKB-028 (packet B9-1). An Instrument node inside an instrument's graph.
/// build_graph_from_raw parses it faithfully — it recurses into the inner
/// subgraph — but there is no generator for the type, so the emission dispatch
/// fell through to its "unknown node type" branch. That branch printed an
/// error and did not exit: the file was written, "Codegen OK" was printed, and
/// the inner instrument's nodes were simply absent from the export with its
/// output variable stuck at 0.0. Sorted by id so two nested instruments name
/// the same offender on every run (the error text is part of the output the
/// determinism gate would otherwise see vary).
find_nested_instrument :: proc(graph: ^Graph) -> (Node, bool) {
	sorted := nodes_sorted_by_id(graph)
	defer delete(sorted)
	for node in sorted {
		if node.type == "Instrument" do return node, true
	}
	return Node{}, false
}

validate_no_nested_instruments :: proc(graph: ^Graph, inst_name: string) {
	inner, found := find_nested_instrument(graph)
	if !found do return
	inner_name := get_string_param(inner, "name", inner.raw_id)
	fmt.eprintf(
		"Error: instrument %q contains another Instrument (%q, node id %s). Skald has no generator for an instrument inside an instrument: its nodes would be left out of the export and its output would sit at 0.0 for the whole asset. In the editor, select the inner instrument and use Explode Instrument so its nodes join this graph, or move it onto the canvas as a top-level instrument of its own, then regenerate.\n",
		inst_name, inner_name, inner.raw_id,
	)
	os.exit(1)
}

/// The two raw ids that collapsed to one identifier. `first_raw == second_raw`
/// is a literal duplicate in the JSON; otherwise the two differ only in bytes
/// sanitize_identifier maps to `_` ("osc-1" vs "osc_1") — a collision the
/// author cannot see by eye, which is why the message spells the reduced form.
Duplicate_Node_Id :: struct {
	first_raw:  string,
	second_raw: string,
	sanitized:  string,
}

/// SKB-021 (packet B9-2). Node ids are the key connections and step overrides
/// address a node by, and they are spliced into generated identifiers after
/// sanitize_identifier. Two nodes with the same key used to be renamed
/// (`<id>_dup2`) with a warning that admitted "connections still target the
/// first node" — the mis-wire the rename was meant to prevent survived it,
/// because a renamed node is a node nothing in the file can reach.
///
/// Types that normalize to "" (React Flow groups, the legacy polyphonicWrapper)
/// never enter the node map and cannot shadow anything, so they are skipped.
/// `instrument_only` is the graph-shape top level's scope: there only
/// Instrument nodes are keyed and every other node is discarded, so a helper
/// node sharing an instrument's id is not something the generated code can
/// observe.
find_duplicate_node_id :: proc(nodes: []Node_Raw, instrument_only := false) -> (Duplicate_Node_Id, bool) {
	seen := make(map[string]string)
	defer delete(seen)
	for raw in nodes {
		node_type := normalize_node_type(raw.type)
		if node_type == "" do continue
		if instrument_only && node_type != "Instrument" do continue
		id := sanitize_identifier(raw.id, true)
		if first, taken := seen[id]; taken {
			return Duplicate_Node_Id{first_raw = first, second_raw = raw.id, sanitized = id}, true
		}
		seen[id] = raw.id
	}
	return Duplicate_Node_Id{}, false
}

/// `owner` reads as a noun phrase in the message: `instrument "Kick"` or
/// `the top-level graph`.
validate_unique_node_ids :: proc(nodes: []Node_Raw, owner: string, instrument_only := false) {
	dup, found := find_duplicate_node_id(nodes, instrument_only)
	if !found do return
	if dup.first_raw == dup.second_raw {
		fmt.eprintf(
			"Error: %s has two nodes with the same id %q. Connections and step overrides address a node by its id, so only one of them could ever be wired and the other would silently take or lose wires meant for it. Give every node a unique id and regenerate.\n",
			owner, dup.first_raw,
		)
	} else {
		fmt.eprintf(
			"Error: %s has node ids %q and %q that become the same identifier %q in the generated code (ids are reduced to letters, digits and underscores). Connections and step overrides would then address one node when they meant the other. Rename one so they differ in a letter, digit or underscore, and regenerate.\n",
			owner, dup.first_raw, dup.second_raw, dup.sanitized,
		)
	}
	os.exit(1)
}
