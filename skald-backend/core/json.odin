package skald_core

import "core:encoding/json"
import "core:fmt"

// =================================================================================
// SECTION F: Main Execution & JSON Parsing (Refactored for correctness)
// =================================================================================

normalize_node_type :: proc(t: string) -> string {
	switch t {
	case "Instrument", "instrument": return "Instrument"
	case "oscillator", "Oscillator": return "Oscillator"
	case "filter", "Filter": return "Filter"
	case "noise", "Noise": return "Noise"
	case "adsr", "ADSR": return "ADSR"
	case "delay", "Delay": return "Delay"
	case "reverb", "Reverb": return "Reverb"
	case "distortion", "Distortion": return "Distortion"
	case "mixer", "Mixer": return "Mixer"
	case "panner", "Panner": return "Panner"
	case "gain", "Gain": return "Gain"
	case "lfo", "LFO": return "LFO"
	case "mapper", "Mapper": return "Mapper"
	case "fmOperator", "FmOperator": return "FmOperator"
	case "wavetable", "Wavetable": return "Wavetable"
	case "sampleHold", "sample-hold", "SampleHold": return "SampleHold"
	case "midiInput", "MidiInput": return "MidiInput"
	case "output", "GraphOutput", "InstrumentOutput": return "GraphOutput"
	case "InstrumentInput", "GraphInput": return "GraphInput"
	case "group", "Group", "polyphonicWrapper": return ""
	}
	return t
}

normalize_port :: proc(port: string) -> string {
	switch port {
	case "frequency": return "input_freq"
	case "amplitude": return "input_amp"
	case "pulseWidth": return "input_pulseWidth"
	case "cutoff": return "input_cutoff"
	case "resonance", "input_resonance": return "input_res"
	case "gain": return "input_gain"
	case "pan": return "input_pan"
	case "position": return "input_pos"
	case "mod", "modIndex": return "input_mod"
	}
	return port
}

normalize_legacy_parameters :: proc(node_type: string, params: json.Object) {
	// Legacy aliases are resolved in get_f32_param/get_string_param. Keep this
	// hook so build_graph_from_raw documents where shape normalization happens
	// without mutating core:encoding/json.Object values.
}
extract_graph_raw_from_object :: proc(obj: json.Object) -> (Graph_Raw, bool) {
	graph_raw: Graph_Raw
	found := false

	if nodes_val, ok := obj["nodes"]; ok {
		nodes_bytes, err := json.marshal(nodes_val)
		if err == nil {
			defer delete(nodes_bytes)
			if json.unmarshal(nodes_bytes, &graph_raw.nodes) == nil do found = true
		}
	}
	if conns_val, ok := obj["connections"]; ok {
		conns_bytes, err := json.marshal(conns_val)
		if err == nil {
			defer delete(conns_bytes)
			json.unmarshal(conns_bytes, &graph_raw.connections)
		}
	}
	if edges_val, ok := obj["edges"]; ok {
		edges_bytes, err := json.marshal(edges_val)
		if err == nil {
			defer delete(edges_bytes)
			json.unmarshal(edges_bytes, &graph_raw.edges)
		}
	}
	if tracks_val, ok := obj["sequencerTracks"]; ok {
		tracks_bytes, err := json.marshal(tracks_val)
		if err == nil {
			defer delete(tracks_bytes)
			json.unmarshal(tracks_bytes, &graph_raw.sequencerTracks)
		}
	}
	if tracks_val, ok := obj["sequencer_tracks"]; ok {
		tracks_bytes, err := json.marshal(tracks_val)
		if err == nil {
			defer delete(tracks_bytes)
			json.unmarshal(tracks_bytes, &graph_raw.sequencer_tracks)
		}
	}

	return graph_raw, found
}

// Fold the editor's camelCase Note_Event keys onto the snake_case fields the
// codegen actually reads. Today that is exactly one key — `patchOverrides` —
// because the graph shape is a raw dump of the editor's own objects while the
// project shape is a deliberate translation (see Note_Event.patchOverrides).
//
// Mutates in place: `events` aliases the array the unmarshaller allocated, and
// every caller wants the folded view. Idempotent, and a file that spells the
// key snake_case already wins (an explicit `patch_overrides` is never
// overwritten), so a file carrying both is read the same as a project-shaped
// export of it.
resolve_note_event_aliases :: proc(events: []Note_Event) {
	for i in 0 ..< len(events) {
		if len(events[i].patch_overrides) == 0 && len(events[i].patchOverrides) > 0 {
			events[i].patch_overrides = events[i].patchOverrides
		}
	}
}

connections_from_raw :: proc(graph_raw: ^Graph_Raw) -> []Connection {
	if len(graph_raw.connections) > 0 {
		connections := make([]Connection, len(graph_raw.connections))
		for conn, i in graph_raw.connections {
			connections[i] = Connection{
				from_node = sanitize_identifier(conn.from_node, true),
				from_port = normalize_port(conn.from_port),
				to_node   = sanitize_identifier(conn.to_node, true),
				to_port   = normalize_port(conn.to_port),
			}
		}
		return connections
	}

	connections := make([]Connection, len(graph_raw.edges))
	for edge, i in graph_raw.edges {
		connections[i] = Connection{
			from_node = sanitize_identifier(edge.source, true),
			from_port = normalize_port(edge.sourceHandle),
			to_node   = sanitize_identifier(edge.target, true),
			to_port   = normalize_port(edge.targetHandle),
		}
	}
	return connections
}

sequencer_tracks_from_raw :: proc(graph_raw: ^Graph_Raw) -> []Sequencer_Track {
	if len(graph_raw.sequencer_tracks) > 0 {
		tracks := make([]Sequencer_Track, len(graph_raw.sequencer_tracks))
		for track, i in graph_raw.sequencer_tracks {
			tracks[i] = track
			tracks[i].target_node_id = sanitize_identifier(track.target_node_id, true)
		}
		return tracks
	}

	tracks := make([]Sequencer_Track, len(graph_raw.sequencerTracks))
	for track, i in graph_raw.sequencerTracks {
		tracks[i] = Sequencer_Track{
			target_node_id = sanitize_identifier(track.targetNodeId, true),
			name           = track.name,
			events         = track.notes,
			mute           = track.isMuted,
			solo           = track.isSolo,
			num_steps      = track.steps,
		}
	}
	return tracks
}

// build_graph_from_raw recursively constructs the main graph and any nested instrument subgraphs.
//
// Node ids (and every reference to them: connections, sequencer targets) are
// passed through sanitize_identifier here, once, because ids are spliced
// into generated Odin identifiers all over the codegen. UI ids like
// "osc-1" or a raw uuid would otherwise emit `node_osc-1_out` - a syntax
// error in every generated file.
build_graph_from_raw :: proc(graph_raw: ^Graph_Raw) -> Graph {
	// Resolve the camelCase Note_Event aliases before anything downstream
	// reads an event. Done here rather than in sequencer_tracks_from_raw so
	// all three places Note_Events arrive are covered from one site — the
	// top-level `events` array and both sequencer-track spellings — and so the
	// recursion below covers instrument subgraphs for free.
	resolve_note_event_aliases(graph_raw.events)
	for i in 0 ..< len(graph_raw.sequencer_tracks) {
		resolve_note_event_aliases(graph_raw.sequencer_tracks[i].events)
	}
	for i in 0 ..< len(graph_raw.sequencerTracks) {
		resolve_note_event_aliases(graph_raw.sequencerTracks[i].notes)
	}

	graph: Graph
	graph.nodes = make(map[string]Node)
	graph.connections = connections_from_raw(graph_raw)
	graph.events = graph_raw.events
	graph.sequencer_tracks = sequencer_tracks_from_raw(graph_raw)

	for raw_node in graph_raw.nodes {
		node_type := normalize_node_type(raw_node.type)
		if node_type == "" do continue

		params := raw_node.parameters
		if len(params) == 0 && len(raw_node.data) > 0 {
			params = raw_node.data
		}
		normalize_legacy_parameters(node_type, params)

		node := Node {
			id = sanitize_identifier(raw_node.id, true),
			raw_id = raw_node.id,
			type = node_type,
			parameters = params,
			subgraph = nil,
		}

		// Duplicate ids (either genuinely duplicated in the JSON, or two
		// distinct ids that collapse to one after sanitization) used to
		// silently overwrite each other in the map. Rename loudly instead:
		// the asset still compiles, and the warning names the problem.
		if _, exists := graph.nodes[node.id]; exists {
			base := node.id
			suffix := 2
			for {
				candidate := fmt.aprintf("%s_dup%d", base, suffix)
				if _, taken := graph.nodes[candidate]; !taken {
					node.id = candidate
					break
				}
				suffix += 1
			}
			fmt.eprintf(
				"Warning: duplicate node id %q - renamed to %q. Connections still target the first node with this id.\n",
				base,
				node.id,
			)
		}

		if node.type == "Instrument" {
			subgraph_raw: Graph_Raw
			has_subgraph := false
			if len(raw_node.subgraph) > 0 {
				subgraph_raw, has_subgraph = extract_graph_raw_from_object(raw_node.subgraph)
			}
			if !has_subgraph {
				if subgraph_val, ok := params["subgraph"]; ok {
					if subgraph_obj, is_obj := subgraph_val.(json.Object); is_obj {
						subgraph_raw, has_subgraph = extract_graph_raw_from_object(subgraph_obj)
					}
				}
			}

			if has_subgraph {
				subgraph_obj := build_graph_from_raw(&subgraph_raw)
				node.subgraph = new(Graph)
				node.subgraph^ = subgraph_obj
			}
		}
		graph.nodes[node.id] = node
	}

	// Drop edges to unsupported legacy helper nodes (for example
	// polyphonicWrapper) after node normalization. Keeping them would emit
	// references to undeclared node_<id>_out variables.
	filtered := make([dynamic]Connection)
	for conn in graph.connections {
		if _, ok := graph.nodes[conn.from_node]; !ok do continue
		if _, ok := graph.nodes[conn.to_node]; !ok do continue
		append(&filtered, conn)
	}
	graph.connections = filtered[:]

	return graph
}

build_project_from_raw :: proc(project_raw: ^Project_Raw) -> Project {
	project: Project
	project.bpm = project_raw.project.bpm
	// bpm <= 0 means the field was absent or null (older/hand-written JSON,
	// or a UI NaN serialized as null). A raw 0 reached the generated
	// `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)` as a
	// division by zero — the sequence never advanced and every note duration
	// went infinite. Default to 120, matching build_project_from_graph and
	// the param_ranges table. Valid projects (bpm > 0) are never touched, so
	// no existing save is retimed.
	if project.bpm <= 0 do project.bpm = 120.0
	project.master_volume = project_raw.project.master_volume
	project.pattern_steps = project_raw.project.pattern_steps
	project.instruments = make([]Project_Instrument, len(project_raw.project.instruments))

	for raw_inst, i in project_raw.project.instruments {
		raw_graph_copy := raw_inst.audio_graph

		// Same defaults/clamps as build_project_from_graph: a project JSON
		// that omits voice_count or unison must not generate a zero-voice
		// processor or a zero-iteration unison loop (permanently silent asset).
		voice_count := raw_inst.voice_count
		if voice_count <= 0 do voice_count = 1
		unison := raw_inst.unison
		if unison <= 0 do unison = 1
		// volume 0 = field absent (pre-volume JSONs) -> unity. The UI never
		// writes a true 0 (it floors at 0.001); mute is the mute flag's job.
		volume := raw_inst.volume
		if volume <= 0 do volume = 1.0

		project.instruments[i] = Project_Instrument {
			id = sanitize_identifier(raw_inst.id, true),
			name = raw_inst.name,
			mute = raw_inst.mute,
			solo = raw_inst.solo,
			voice_count = voice_count,
			glide = raw_inst.glide,
			unison = unison,
			detune = raw_inst.detune,
			volume = volume,
			midi_config = raw_inst.midi_config,
			graph = build_graph_from_raw(&raw_graph_copy),
		}
	}

	// Project-level sequencer tracks reference instruments by id; keep them
	// consistent with the sanitized instrument ids above.
	for i in 0 ..< len(project.sequencer_tracks) {
		project.sequencer_tracks[i].target_node_id = sanitize_identifier(project.sequencer_tracks[i].target_node_id, true)
	}

	return project
}


/// Did this file carry a usable `session` block at all? Odin's unmarshaller
/// cannot report which keys were present, so presence is inferred from the
/// values: if not one of the three is authored, there was no block (or an empty
/// one, which means the same thing). A partial block — say bpm only — counts as
/// present, and the missing fields take their documented defaults silently;
/// only the total absence is worth shouting about, because that is the case
/// where the export is at no authored tempo whatsoever.
session_has_values :: proc(session: Session_Raw) -> bool {
	return session.bpm > 0 || session.masterVolume > 0 || session.patternSteps > 0
}

/// The warning that should have existed since the beginning. Silence is what
/// let SKB-002 survive a full audit pass and certify a 101-file example corpus
/// through a path that retimed all of it to 120 BPM: the CLI exited 0 and said
/// "Codegen OK".
///
/// fmt.eprint, not eprintf: the message names a JSON literal, and Odin's
/// formatter reads `{` as the start of a format verb (an eprintf here printed
/// "%!(MISSING ARGUMENT)%!(MISSING CLOSE BRACE)bpm" in place of the example).
/// There are no arguments to interpolate, so the verbless printer is both
/// correct and the one that cannot be broken by editing the text.
warn_legacy_session_defaults :: proc() {
	fmt.eprint(
		"Warning: this input has no `session` block, so the legacy graph-path defaults were assumed: bpm = 120, masterVolume = 1.0, patternSteps = 0 (loop length falls back to the longest active sequencer track). If this patch was composed at any other tempo or master level, THIS EXPORT IS NOT AT THAT TEMPO OR LEVEL.\n" +
		"         The editor writes the authored tempo, master volume and pattern length into a top-level \"session\" object on every Save, shaped {\"bpm\": 140, \"patternSteps\": 16, \"masterVolume\": 0.7}. A file without one is hand-written, predates the block, or was produced by a tool that dropped it. Add the block, or generate from a project-shaped file, to export at the authored values. (BUGS.md SKB-002 / roadmap packet A4.)\n",
	)
}

/// Build a Project from a bare graph save — the shape every editor Save
/// writes and 100 of 101 shipped examples under examples/ have. `session` is
/// the save's top-level `session` block (Graph_Raw.session); pass a zeroed
/// Session_Raw for a file that has none, and the legacy defaults below apply
/// with a warning.
build_project_from_graph :: proc(graph: ^Graph, session: Session_Raw) -> Project {
    project: Project

    // A4 / SKB-002 / F-C3-2. These three used to be hardcoded right here —
    // `project.bpm = 120.0`, `project.master_volume = 1.0`, pattern_steps
    // never assigned at all — while the editor wrote all three into a
    // top-level `session` block that no struct had a field for. This is the
    // path 100 of 101 shipped examples take, so a 140 BPM patch exported at
    // 120 and every BPM-derived expression in the emitted file (the sequencer
    // step clock, every note duration, every tempo-synced LFO and S&H) came
    // out off by the tempo ratio, with exit code 0 and no warning.
    //
    // The defaults and clamps mirror build_project_from_raw exactly, and are
    // written in the same order, so a reader can diff the two by eye. They
    // must not drift again before step 2 collapses this proc into a normalizer
    // that hands a Project_Raw to the single build_project_from_raw.
    if !session_has_values(session) {
        warn_legacy_session_defaults()
    }

    project.bpm = session.bpm
    // Same guard, same reason as build_project_from_raw: bpm <= 0 means the
    // field was absent or null, and a raw 0 reaches the generated
    // `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)` as a
    // division by zero.
    if project.bpm <= 0 do project.bpm = 120.0
    project.master_volume = session.masterVolume
    // masterVolume <= 0 means the field was absent (no `session` block, or a
    // hand-written one that omits it) -> unity, which is what this path
    // hardcoded before, so no session-less file changes emission. Applied here
    // and not left to the codegen's own `master_vol <= 0.0 -> 1.0` guard
    // because absence is only knowable at parse time: SKB-004 / packet B1 has
    // to make an explicit 0 mean silence, and when it does, a legacy save with
    // no session must still export at unity rather than go silent. B1 needs a
    // presence signal to tell the two apart — see the note in Session_Raw.
    if project.master_volume <= 0 do project.master_volume = 1.0
    // 0 = "fall back to the longest active track", handled in the codegen
    // (generate_sequencer_code's `global_steps <= 0` branch). Passed through
    // unclamped, same as build_project_from_raw.
    project.pattern_steps = session.patternSteps

    // SKB-003 / F-B04-1: both loops below used to iterate `graph.nodes` (a
    // map[string]Node) directly. Odin map iteration order is unspecified and
    // varies run-to-run, so `project.instruments[idx]` was filled in hash
    // order — the same input file produced six distinct outputs across 14
    // runs, and the wasm shim's integer asset index permuted with it, so
    // `skald_note_on(asset, ...)` addressed a different instrument on each
    // regeneration. Iterate the sorted-by-id view (graph_utils.odin) instead;
    // node ids are unique within a graph, so this is a total order.
    sorted_nodes := nodes_sorted_by_id(graph)
    defer delete(sorted_nodes)

    // Count instruments
    inst_count := 0
    for node in sorted_nodes {
        if node.type == "Instrument" || node.type == "instrument" {
            inst_count += 1
        }
    }

	// Legacy loose graphs have no Instrument wrapper. Treat the whole graph as
	// one SFX named Asset so the old examples still codegen and can be loaded
	// by the acceptance harness.
	if inst_count == 0 && len(graph.nodes) > 0 {
		project.instruments = make([]Project_Instrument, 1)
		project.instruments[0] = Project_Instrument {
			id = "Asset",
			name = "Asset",
			voice_count = 1,
			glide = 0.0,
			unison = 1,
			detune = 0.0,
			volume = 1.0,
			graph = graph^,
		}
		project.sequencer_tracks = graph.sequencer_tracks
		return project
	}

    project.instruments = make([]Project_Instrument, inst_count)

    idx := 0
    for node in sorted_nodes {
        if node.type == "Instrument" || node.type == "instrument" {
            // Extract Instrument parameters from Node Data
            name := get_string_param(node, "name", "Untitled")
            voice_count := int(get_f32_param_val(node, "voiceCount", 1.0))
            if voice_count <= 0 do voice_count = 1
            glide := get_f32_param_val(node, "glide", 0.0)
            unison := int(get_f32_param_val(node, "unison", 1.0))
            if unison <= 0 do unison = 1
            detune := get_f32_param_val(node, "detune", 0.0)
            volume := get_f32_param_val(node, "volume", 1.0)
            if volume <= 0 do volume = 1.0

            inst_graph := Graph{}
            if node.subgraph != nil {
                inst_graph = node.subgraph^
            }

            project.instruments[idx] = Project_Instrument {
                id = node.id,
                name = name,
                voice_count = voice_count,
                glide = glide,
                unison = unison,
                detune = detune,
                volume = volume,
                graph = inst_graph,
            }
            idx += 1
        }
    }
    
    // Copy sequencer tracks from the main graph to the project
    project.sequencer_tracks = graph.sequencer_tracks
    
    return project
}

// Helper to get raw float value from parameters map without generating code string
get_f32_param_val :: proc(node: Node, param_name: string, default_val: f32) -> f32 {
	if val, ok := node.parameters[param_name]; ok {
        #partial switch v in val {
        case json.Float:
            return f32(v)
		case json.Integer:
            return f32(v)
        }
	}
	return default_val
}
