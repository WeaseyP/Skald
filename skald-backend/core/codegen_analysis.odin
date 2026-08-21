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

// The beat fraction a bpmSync'd node's time base resolves to. Split out of
// bpm_sync_seconds_expr so the tail-length analysis (SKB-016) can read the
// NUMBER instead of re-parsing the expression string that is emitted from it —
// two parsers of the same syncRate spelling is one too many.
bpm_sync_beats :: proc(node: Node) -> (f64, bool) {
	synced := false
	if v, ok := node.parameters["bpmSync"]; ok {
		if b, is_b := v.(json.Boolean); is_b do synced = bool(b)
	}
	if !synced do return 0.0, false

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
	return beats, true
}

bpm_sync_seconds_expr :: proc(node: Node) -> (string, bool) {
	beats, synced := bpm_sync_beats(node)
	if !synced do return "", false
	return fmt.tprintf("((60.0 / p.bpm) * %.9f)", beats), true
}

// =====================================================================
// BUS TAIL LENGTH  (roadmap packet B7 / BUGS.md SKB-016)
//
// A Delay or Reverb keeps producing output long after the last voice released,
// and <Asset>_is_playing reported only `p.playing || any(voice.active)`. A game
// polling it to decide when to free the asset therefore cut every echo and
// every reverb tail off mid-ring — the asset went away while it was still
// audible.
//
// The tail length is knowable without running the DSP, so it is computed here
// and baked into the emission as a per-asset seconds constant that _process
// counts down. WHICH value each parameter contributes is the decision worth
// stating:
//
//   * a parameter nothing can change at runtime contributes its AUTHORED value
//   * an exposed (or P-locked) parameter contributes its RANGE MAXIMUM
//
// The second rule is deliberately pessimistic. Baking the authored value would
// make the constant a lower BOUND, so the first time a game raised an exposed
// feedback the countdown would expire while the delay was still ringing — the
// same bug back again, and now invisible, because it only reproduces for
// values that never appear in the project file. Erring long merely delays the
// asset's release; erring short is audible. The consequence is worth knowing:
// exposing both delayTime and feedback over their full ranges bakes a 270s
// tail (2.0s per pass, 135 passes to -60dB at feedback 0.95), so an author who
// wants a tight is_playing should not expose them — or should narrow the range.
//
// Tails SUM rather than max: a Delay feeding a Reverb rings for the Delay's
// tail and then the Reverb's, and a sum is still an upper bound when the two
// are in parallel instead.
// =====================================================================

// Seconds for a feedback delay line to fall 60 dB. -60 dB is not an arbitrary
// pick: the Reverb generator already defines its `decay` parameter through
// `pow(0.001, 0.075/decay)`, so measuring Delay the same way means both node
// types answer to one definition of "over".
feedback_tail_seconds :: proc(delay_seconds: f64, gain: f64) -> f64 {
	if delay_seconds <= 0.0 do return 0.0
	// 0.95 is the DSP's own feedback ceiling (chosen for stability — at or
	// above 1.0 the line diverges and NaN-latches the processor), so no
	// authored or runtime value can ring longer than this.
	g := clamp(gain, 0.0, 0.95)
	if g <= 0.0 do return delay_seconds
	passes := math.ceil(math.ln(f64(0.001)) / math.ln(g))
	return delay_seconds * passes
}

// The value a tail computation has to assume for `param`: its range maximum
// when a setter or a P-lock can move it while the asset plays, its authored
// value otherwise.
tail_param_worst_case :: proc(node: Node, plan: ^Instrument_Plan, param: string, fallback: f64) -> f64 {
	if plan != nil {
		if res, found := plan.exposed_resolutions[fmt.tprintf("%s::%s", node.id, param)]; found {
			return f64(res.range_max)
		}
	}
	if val, ok := node.parameters[param]; ok {
		#partial switch v in val {
		case json.Float:   return f64(v)
		case json.Integer: return f64(v)
		}
	}
	return fallback
}

// Delay/Reverb wet level. A fully dry node has no tail at all, so an authored
// `mix: 0` must not bake a multi-second countdown onto a bypassed effect. The
// `wetDryMix` fallback mirrors get_f32_param's alias handling; -1.0 is the
// "neither key exists anywhere" sentinel, which a 0..1 mix can never be.
tail_mix_worst_case :: proc(node: Node, plan: ^Instrument_Plan) -> f64 {
	m := tail_param_worst_case(node, plan, "mix", -1.0)
	if m < 0.0 do m = tail_param_worst_case(node, plan, "wetDryMix", 0.5)
	return m
}

// Longest delay time this node can ever be asked for, in seconds.
tail_delay_time_worst_case :: proc(node: Node, plan: ^Instrument_Plan) -> f64 {
	// bpmSync replaces delayTime entirely with a fraction of the LIVE tempo,
	// and p.bpm is settable, so the longest legal time is that beat value at
	// the slowest legal tempo — the bpm range row's 20.
	if beats, synced := bpm_sync_beats(node); synced {
		return (60.0 / 20.0) * beats
	}
	// The legacy millisecond spelling, converted exactly as get_f32_param does.
	if _, has := node.parameters["delayTime"]; !has {
		if val, ok := node.parameters["time"]; ok {
			#partial switch v in val {
			case json.Float:   return f64(v) / 1000.0
			case json.Integer: return f64(v) / 1000.0
			}
		}
	}
	return tail_param_worst_case(node, plan, "delayTime", 0.5)
}

tail_seconds_for_delay :: proc(node: Node, plan: ^Instrument_Plan) -> f64 {
	if tail_mix_worst_case(node, plan) <= 0.0 do return 0.0
	return feedback_tail_seconds(
		tail_delay_time_worst_case(node, plan),
		tail_param_worst_case(node, plan, "feedback", 0.5),
	)
}

tail_seconds_for_reverb :: proc(node: Node, plan: ^Instrument_Plan) -> f64 {
	if tail_mix_worst_case(node, plan) <= 0.0 do return 0.0
	decay := tail_param_worst_case(node, plan, "decay", 0.5)
	pre := clamp(tail_param_worst_case(node, plan, "preDelay", 0.02), 0.0, 0.25)
	// Literally the expression generate_reverb_code emits for decay_gain, so
	// the analysis and the DSP cannot disagree about how fast the comb decays
	// (including at the top of the decay range, where the 0.95 ceiling bites
	// and the real tail saturates around 10s rather than growing with decay).
	gain := math.pow(f64(0.001), f64(0.075) / math.max(decay, f64(0.01)))
	return pre + feedback_tail_seconds(0.075, gain)
}

// Worst-case seconds the whole instrument's effect bus keeps sounding after
// its last voice goes inactive. 0 means the patch has no tail and _is_playing
// needs no countdown at all.
compute_bus_tail_seconds :: proc(all_nodes: []Node, plan: ^Instrument_Plan) -> f64 {
	total := 0.0
	for node in all_nodes {
		switch node.type {
		case "Delay":
			total += tail_seconds_for_delay(node, plan)
		case "Reverb":
			total += tail_seconds_for_reverb(node, plan)
		}
	}
	return total
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

// A modulation source that is not voice-coupled: it has no note, no envelope
// stage and no per-voice pitch, so evaluating one once per sample in the bus
// block is meaningful in a way that evaluating an Oscillator or an ADSR there
// is not. These are the types that get hoisted by hoist_bus_modulators.
is_hoistable_modulator_type :: proc(t: string) -> bool {
	switch t {
	case "LFO", "SampleHold", "Noise", "Mapper":
		return true
	}
	return false
}

// A modulation source wired into BOTH domains at once. Reported as a value
// rather than printed-and-exited so hoist_bus_modulators stays pure and the
// rule can be exercised in `odin test tests\unit` — the hard-error paths in
// this file that call os.exit directly have no in-process test at all, which
// is how their exact wording drifts.
Cross_Domain_Conflict :: struct {
	node_id:        string,
	node_type:      string,
	voice_consumer: string,
	bus_consumer:   string,
}

// Seed the bus domain with the nodes that DEFINE it and propagate downstream.
// `sorted_nodes` must be in topological order so one pass suffices.
seed_bus_domain :: proc(graph: ^Graph, sorted_nodes: []Node) -> map[string]bool {
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
	return bus_nodes
}

// =====================================================================
// SKB-017 — a modulator that feeds the bus has to LIVE in the bus.
//
// The domains are not a labelling convenience, they are two different clocks:
// a voice-domain node's state advances once per ACTIVE VOICE per sample, a
// bus-domain node's once per sample. Nothing checked what happened when a
// modulation source sat in the voice domain and was wired into a bus node, and
// the answer was worse than "picks one":
//
//   * the per-voice values were SUMMED into the cross-domain accumulator, so
//     an LFO with amplitude 600 modulating a post-Delay filter cutoff swung
//     ±2400 Hz while four notes were held and ±600 with one — the modulation
//     depth was a function of how many keys were down
//   * every voice ran its own phase, so the "LFO" the bus saw was the sum of
//     four detuned copies beating against each other
//   * with no voice active the accumulator was 0, so the modulation switched
//     OFF mid-delay-tail, discontinuously
//
// The fix is to hoist the source into the bus domain, where it is evaluated
// once per sample and keeps running through the tail. Hoisting is not a local
// edit — the node's state fields move from the per-voice struct to the
// processor struct and its update moves from the voice loop to the bus block —
// but every emission site already keys off this map, so doing it HERE, before
// anything reads the map, is what makes the rest fall out for free (including
// the `!bus_nodes[node.id]` gate on _init's per-voice PRNG seeding).
//
// A source that feeds both domains is a HARD ERROR rather than a hoist. It
// cannot be evaluated on two clocks, and silently picking one is precisely how
// this bug class survived: the wiring stayed legal, the emission stayed
// plausible, and the modulation was wrong in a way you have to hold four notes
// to notice. Duplicating the modulator is the fix, and only the author knows
// whether the two copies should share a rate.
// =====================================================================
//
// Iterates sinks-first (reverse topological order) so a chain — LFO into a
// Mapper into a bus Filter — hoists all the way up in one pass.
hoist_bus_modulators :: proc(
	graph: ^Graph,
	sorted_nodes: []Node,
	bus_nodes: ^map[string]bool,
) -> (Cross_Domain_Conflict, bool) {
	#reverse for node in sorted_nodes {
		if bus_nodes[node.id] do continue
		if !is_hoistable_modulator_type(node.type) do continue

		voice_consumer := ""
		bus_consumer := ""
		for conn in graph.connections {
			if conn.from_node != node.id do continue
			consumer, ok := graph.nodes[conn.to_node]
			if !ok do continue
			// GraphOutput belongs to neither domain: generate_graph_output_adds
			// runs in both passes and filters its sources by the domain each
			// one actually landed in, so it follows this node either way and
			// must not be read as a vote for one clock or the other.
			if consumer.type == "GraphOutput" do continue
			label := fmt.tprintf("%s(%s)", consumer.type, consumer.id)
			if bus_nodes[conn.to_node] {
				if bus_consumer == "" do bus_consumer = label
			} else {
				if voice_consumer == "" do voice_consumer = label
			}
		}

		if bus_consumer == "" do continue
		if voice_consumer != "" {
			return Cross_Domain_Conflict{
				node_id        = node.id,
				node_type      = node.type,
				voice_consumer = voice_consumer,
				bus_consumer   = bus_consumer,
			}, true
		}
		bus_nodes[node.id] = true
	}
	return Cross_Domain_Conflict{}, false
}

compute_bus_domain :: proc(graph: ^Graph, sorted_nodes: []Node, inst_name: string) -> map[string]bool {
	bus_nodes := seed_bus_domain(graph, sorted_nodes)
	if conflict, found := hoist_bus_modulators(graph, sorted_nodes, &bus_nodes); found {
		fmt.eprintf(
			"Error: instrument %q wires %s node (%s) into both a per-voice node (%s) and a post-effect node (%s). A modulator runs once per voice or once per sample, never both, and Skald will not pick one for you — the per-voice copy would be summed across held notes and the bus would see whichever voice ran last. Duplicate the %s: leave one copy feeding %s and give %s its own.\n",
			inst_name,
			conflict.node_type,
			conflict.node_id,
			conflict.voice_consumer,
			conflict.bus_consumer,
			conflict.node_type,
			conflict.voice_consumer,
			conflict.bus_consumer,
		)
		os.exit(1)
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
