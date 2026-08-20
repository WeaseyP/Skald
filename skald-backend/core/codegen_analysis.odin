package skald_core

import "core:fmt"
import "core:math"
import "core:os"
import "core:slice"
import "core:strings"
import "core:strconv"
import json "core:encoding/json"

MAX_DELAY_SAMPLES :: 96000
MAX_REVERB_PREDELAY_SAMPLES :: 48000

bpm_sync_seconds_expr :: proc(node: Node) -> (string, bool) {
	synced := false
	if v, ok := node.parameters["bpmSync"]; ok {
		if b, is_b := v.(json.Boolean); is_b do synced = bool(b)
	}
	if !synced do return "", false

	rate := get_string_param(node, "syncRate", "1/4")
	triplet := strings.has_suffix(rate, "t")
	core_str := rate
	if triplet do core_str = rate[:len(rate)-1]

	denom := 4
	if strings.has_prefix(core_str, "1/") {
		if n, ok := strconv.parse_int(core_str[2:]); ok && n > 0 {
			denom = n
		}
	} else if core_str == "1" {
		denom = 1
	}
	beats := 4.0 / f64(denom) // whole note = 4 beats
	if triplet do beats *= 2.0 / 3.0
	return fmt.tprintf("((60.0 / p.bpm) * %.9f)", beats), true
}

is_voice_coupled_type :: proc(t: string) -> bool {
	switch t {
	case "Oscillator", "ADSR", "FmOperator", "Wavetable", "MidiInput":
		return true
	}
	return false
}

warn_graph_output_count :: proc(all_nodes: []Node, inst_name: string) {
	count := 0
	for node in all_nodes {
		if node.type == "GraphOutput" do count += 1
	}
	if count == 0 {
		fmt.eprintf(
			"Warning: instrument %q has no GraphOutput node — it will generate but produce silence.\n",
			inst_name)
	} else if count > 1 {
		fmt.eprintf(
			"Warning: instrument %q has %d GraphOutput nodes — all of them sum into the same stereo output, there is no separate destination for each.\n",
			inst_name, count)
	}
}

warn_unreachable_nodes :: proc(graph: ^Graph, all_nodes: []Node, inst_name: string) {
	has_output := false
	for node in all_nodes {
		if node.type == "GraphOutput" {
			has_output = true
			break
		}
	}
	if !has_output do return

	live := make(map[string]bool)
	defer delete(live)
	queue := make([dynamic]string)
	defer delete(queue)
	for node in all_nodes {
		if node.type == "GraphOutput" {
			live[node.id] = true
			append(&queue, node.id)
		}
	}
	for len(queue) > 0 {
		id := pop(&queue)
		for conn in graph.connections {
			if conn.to_node == id && !live[conn.from_node] {
				live[conn.from_node] = true
				append(&queue, conn.from_node)
			}
		}
	}
	for node in all_nodes {
		if !live[node.id] {
			fmt.eprintf(
				"Warning: instrument %q: node %s(%s) has no path to any GraphOutput — it will still be emitted and run every sample, contributing nothing to the output.\n",
				inst_name, node.type, node.id)
		}
	}
}

warn_dead_exposed_params :: proc(all_nodes: []Node, inst_name: string) {
	for node in all_nodes {
		params_val, ok := node.parameters["exposedParameters"]
		if !ok do continue
		arr, is_arr := params_val.(json.Array)
		if !is_arr do continue
		for p_val in arr {
			p_name, is_str := p_val.(json.String)
			if !is_str do continue
			if param_is_reachable(node, string(p_name)) do continue
			fmt.eprintf(
				"Warning: instrument %q: %s(%s) exposes %q, but %s — the generated struct field, setter and _PARAMS row for it are omitted.\n",
				inst_name, node.type, node.id, p_name, param_dead_reason(node, string(p_name)),
			)
		}
	}
}

compute_bus_domain :: proc(graph: ^Graph, sorted_nodes: []Node, inst_name: string) -> map[string]bool {
	bus_nodes := make(map[string]bool)
	for node in sorted_nodes {
		if node.type == "Delay" || node.type == "Reverb" || node.type == "GraphInput" {
			bus_nodes[node.id] = true
			continue
		}
		for conn in graph.connections {
			if conn.to_node == node.id && bus_nodes[conn.from_node] {
				bus_nodes[node.id] = true
				break
			}
		}
	}
	for node in sorted_nodes {
		if bus_nodes[node.id] && is_voice_coupled_type(node.type) {
			fmt.eprintf(
				"Error: instrument %q wires a %s node (%s) downstream of a Delay/Reverb/instrument-input. Envelopes, oscillators and MIDI nodes are per-voice and cannot process the post-voice effect bus. Move the %s before the effect.\n",
				inst_name, node.type, node.id, node.type,
			)
			os.exit(1)
		}
	}
	for conn in graph.connections {
		if bus_nodes[conn.to_node] && !bus_nodes[conn.from_node] {
			if src, ok := graph.nodes[conn.from_node]; ok && src.type == "MidiInput" {
				fmt.eprintf(
					"Error: instrument %q wires MidiInput %s into a post-effect node (%s). Route MIDI signals through per-voice nodes before any Delay/Reverb.\n",
					inst_name, src.id, conn.to_node,
				)
				os.exit(1)
			}
		}
	}
	return bus_nodes
}

detect_asset_type :: proc(instrument: ^Project_Instrument, project: ^Project) -> Asset_Type {
	active := active_sequencer_tracks(instrument, project)
	defer delete(active)
	if len(active) > 0 {
		return .Music_Layer
	}
	return .SFX
}

active_sequencer_tracks :: proc(
	instrument: ^Project_Instrument,
	project: ^Project,
) -> [dynamic]^Sequencer_Track {
	all: [dynamic]^Sequencer_Track
	defer delete(all)
	if len(instrument.graph.sequencer_tracks) > 0 {
		for i in 0 ..< len(instrument.graph.sequencer_tracks) {
			append(&all, &instrument.graph.sequencer_tracks[i])
		}
	} else {
		for i in 0 ..< len(project.sequencer_tracks) {
			if project.sequencer_tracks[i].target_node_id == instrument.id {
				append(&all, &project.sequencer_tracks[i])
			}
		}
	}
	any_solo := false
	for t in all {
		if t.solo && !t.mute && len(t.events) > 0 {
			any_solo = true
		}
	}
	active: [dynamic]^Sequencer_Track
	for t in all {
		if t.mute || len(t.events) == 0 do continue
		if any_solo && !t.solo do continue
		append(&active, t)
	}
	return active
}

Plock_Target :: struct {
	node_id: string,
	param:   string,
}

plock_node_label :: proc(node: Node) -> string {
	return get_string_param(node, "label", node.type)
}

resolve_plock_targets :: proc(all_nodes: []Node, key: string) -> [dynamic]Plock_Target {
	targets: [dynamic]Plock_Target

	label_part := ""
	param_part := key
	if idx := strings.index_byte(key, ':'); idx >= 0 {
		label_part = key[:idx]
		param_part = key[idx + 1:]
	}
	if len(param_part) == 0 do return targets

	for node in all_nodes {
		if len(label_part) > 0 {
			if !strings.equal_fold(plock_node_label(node), label_part) do continue
		}
		has_param := false
		if _, ok := node.parameters[param_part]; ok {
			has_param = true
		} else if exposed_val, ok2 := node.parameters["exposedParameters"]; ok2 {
			if arr, is_arr := exposed_val.(json.Array); is_arr {
				for v in arr {
					if s, is_str := v.(json.String); is_str && s == param_part {
						has_param = true
						break
					}
				}
			}
		}
		if has_param {
			append(&targets, Plock_Target{node_id = node.id, param = param_part})
		}
	}
	return targets
}

collect_plock_targets :: proc(
	instrument: ^Project_Instrument,
	project: ^Project,
) -> [dynamic]Plock_Target {
	targets: [dynamic]Plock_Target
	tracks := active_sequencer_tracks(instrument, project)
	defer delete(tracks)
	if len(tracks) == 0 do return targets

	all_nodes := nodes_sorted_by_id(&instrument.graph)
	defer delete(all_nodes)

	node_by_id := make(map[string]Node)
	defer delete(node_by_id)
	for node in all_nodes do node_by_id[node.id] = node

	seen := make(map[string]bool)
	defer delete(seen)
	for track in tracks do for event in track.events {
		for key, _ in event.patch_overrides {
			if seen[key] do continue
			seen[key] = true
			resolved := resolve_plock_targets(all_nodes, key)
			defer delete(resolved)
			if len(resolved) == 0 {
				fmt.eprintf(
					"Error: instrument %q has a step parameter override (P-lock) %q that matches no node in the patch. Valid targets:",
					instrument.name,
					key,
				)
				for node in all_nodes {
					fmt.eprintf(" %q", plock_node_label(node))
				}
				fmt.eprintf(
					"\nThe node was probably renamed or deleted after the override was created. Remove the override in the step editor (or restore the node's label) and regenerate.\n",
				)
				os.exit(1)
			}
			for t in resolved {
				node, ok := node_by_id[t.node_id]
				if !ok do continue
				if param_is_reachable(node, t.param) do continue
				fmt.eprintf(
					"Error: instrument %q has a step parameter override (P-lock) %q targeting %s(%s)'s %q parameter, but %s — the generated DSP never reads it, so the override would silently do nothing.\n",
					instrument.name,
					key,
					node.type,
					node.id,
					t.param,
					param_dead_reason(node, t.param),
				)
				if t.param == "syncRate" {
					fmt.eprintf(
						"No node configuration makes `syncRate` live — remove this override in the step editor, then regenerate.\n",
					)
				} else {
					fmt.eprintf(
						"Change the node's configuration so the parameter is live (toggle BPM Sync / fixedPitch as appropriate), or remove this override in the step editor, then regenerate.\n",
					)
				}
				os.exit(1)
			}
			for t in resolved do append(&targets, t)
		}
	}
	return targets
}

clean_instrument_name :: proc(inst: ^Project_Instrument) -> string {
	if len(inst.name) == 0 {
		return fmt.tprintf("Instrument_%s", sanitize_identifier(inst.id, true))
	}
	sanitized := sanitize_identifier(inst.name)
	if !has_usable_identifier_chars(sanitized) {
		return fmt.tprintf("Instrument_%s", sanitize_identifier(inst.id, true))
	}
	return sanitized
}

param_is_reachable :: proc(node: Node, param: string) -> bool {
	switch node.type {
	case "LFO":
		if param == "syncRate" do return false
		if param != "frequency" do return true
		_, synced := bpm_sync_seconds_expr(node)
		return !synced
	case "SampleHold":
		if param == "syncRate" do return false
		if param != "rate" do return true
		_, synced := bpm_sync_seconds_expr(node)
		return !synced
	case "Delay":
		if param == "syncRate" do return false
		if param != "delayTime" do return true
		_, synced := bpm_sync_seconds_expr(node)
		return !synced
	case "Oscillator", "Wavetable":
		if param != "frequency" do return true
		return get_bool_param(node, "fixedPitch", false)
	}
	return true
}

param_dead_reason :: proc(node: Node, param: string) -> string {
	if param == "syncRate" {
		return "syncRate is only ever read at codegen time via get_string_param, straight off the authored parameter — never through an exposed struct field — so no bpmSync/fixedPitch toggle or any other configuration ever makes it live"
	}
	switch node.type {
	case "LFO", "SampleHold", "Delay":
		return "bpmSync is on, so its time base comes from syncRate instead"
	case "Oscillator", "Wavetable":
		return "fixedPitch is off, so the played note drives pitch instead"
	}
	return "the current node configuration never reads it"
}

effective_exposed_params :: proc(node: Node, plock_targets: []Plock_Target) -> [dynamic]string {
	names: [dynamic]string
	seen := make(map[string]bool)
	defer delete(seen)

	if params_val, ok := node.parameters["exposedParameters"]; ok {
		if arr, is_arr := params_val.(json.Array); is_arr {
			for p_val in arr {
				if p_name, is_str := p_val.(json.String); is_str {
					if !seen[p_name] && param_is_reachable(node, string(p_name)) {
						seen[p_name] = true
						append(&names, string(p_name))
					}
				}
			}
		}
	}
	for t in plock_targets {
		if t.node_id != node.id do continue
		if !seen[t.param] && param_is_reachable(node, t.param) {
			seen[t.param] = true
			append(&names, t.param)
		}
	}
	return names
}

node_key_emittable :: proc(id: string) -> bool {
	if len(id) == 0 do return false
	for i in 0 ..< len(id) {
		c := id[i]
		if c < 0x20 || c > 0x7e || c == '"' || c == '\\' do return false
	}
	return true
}

build_instrument_plan :: proc(graph: ^Graph, instrument: ^Project_Instrument, plock_targets: []Plock_Target) -> Instrument_Plan {
	all_nodes := nodes_sorted_by_id(graph)
	defer delete(all_nodes)

	resolutions := make(map[string]Exposed_Resolution)
	counts := make(map[string]int)
	defer delete(counts)
	for node in all_nodes {
		names := effective_exposed_params(node, plock_targets)
		defer delete(names)
		for p_name in names {
			counts[p_name] += 1
		}
	}

	used_fields := make(map[string]bool)
	defer delete(used_fields)
	for node in all_nodes {
		names := effective_exposed_params(node, plock_targets)
		defer delete(names)
		for p_name in names {
			rng := lookup_param_range(p_name, node.type)
			def_val := exposed_param_default(node, p_name, rng.default)

			field_name := p_name
			if counts[p_name] > 1 {
				label := sanitize_identifier_with_fallback(get_string_param(node, "label", node.id), node.id)
				field_name = fmt.tprintf("%s_%s", label, p_name)
			}
			if used_fields[field_name] {
				base := field_name
				n := 2
				for used_fields[field_name] {
					field_name = fmt.tprintf("%s_%d", base, n)
					n += 1
				}
			}
			used_fields[field_name] = true

			key := fmt.aprintf("%s::%s", node.id, p_name)
			resolutions[key] = Exposed_Resolution{
				field_name  = field_name,
				param_name  = p_name,
				node_id     = node.id,
				node_raw_id = node.raw_id,
				default     = def_val,
				range_min   = rng.min,
				range_max   = rng.max,
				unit        = rng.unit,
			}
		}
	}

	stable_resolutions: [dynamic]Exposed_Resolution
	stable_seen := make(map[string]bool)
	defer delete(stable_seen)
	for _, res in resolutions {
		if !stable_seen[res.field_name] {
			stable_seen[res.field_name] = true
			append(&stable_resolutions, res)
		}
	}
	slice.sort_by(stable_resolutions[:], proc(a, b: Exposed_Resolution) -> bool {
		return a.field_name < b.field_name
	})

	return Instrument_Plan{
		exposed_resolutions = resolutions,
		stable_resolutions = stable_resolutions,
	}
}
