package skald_core

import "core:encoding/json"
import "core:fmt"
import "core:slice"

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
build_graph_from_raw :: proc(graph_raw: ^Graph_Raw, owner := "the graph") -> Graph {
	// SKB-021 / packet B9-2: a duplicate id is a hard error before any node is
	// keyed, so the map below can never silently overwrite. `owner` only
	// names the graph in the message.
	validate_unique_node_ids(graph_raw.nodes, owner)

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
				subgraph_obj := build_graph_from_raw(&subgraph_raw, fmt.tprintf("Instrument node %q's subgraph", raw_node.id))
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

/// Collapse an authored-or-absent master volume into the value the codegen
/// bakes and the generated runtime setter starts from. THE one place the
/// SKB-004 / packet B1 decision lives, for both readers:
///
///   absent (nil)   -> 1.0   a legacy or hand-written file with no master
///                           volume keeps exporting at unity, exactly as both
///                           paths always did;
///   authored 0     -> 0.0   SILENCE. This is the deliberate, changelog-visible
///                           behaviour change: a patch saved at masterVolume 0
///                           used to export at FULL volume, because the old
///                           codegen guard read `<= 0.0` as "field absent"
///                           (codegen.odin, F-A05-1). A muted project now ships
///                           muted — and warns, so it is never silent about
///                           being silent;
///   authored < 0   -> 0.0   clamped to silence with the same warning. No tool
///                           in the repo has ever written one (the dock slider
///                           floors at 0), so a negative is a hand edit, and
///                           "below silence" has no other meaning;
///   authored > 0   -> as authored (the codegen multiplies it into the mix
///                           before the soft limit, so > 1 just drives the
///                           tanh harder — same as it always has).
resolved_master_volume :: proc(authored: Maybe(f32)) -> f32 {
	v, present := authored.?
	if !present do return 1.0
	if v <= 0.0 {
		warn_authored_master_silence(v)
		return 0.0
	}
	return v
}

/// The loud half of the authored-0 contract. SKB-004's fix flips what a saved
/// masterVolume of 0 means (full volume -> silence), so the one case that
/// changes behaviour must announce itself on every generation, not just in the
/// changelog.
warn_authored_master_silence :: proc(v: f32) {
	fmt.eprintf(
		"Warning: this file authors masterVolume = %v, so THIS EXPORT IS SILENT. That is what an authored 0 means as of packet B1 (BUGS.md SKB-004): the master fader was pulled all the way down when the file was saved. Before B1 this exact file exported at FULL volume, because 0 was misread as \"no master volume authored\". If you wanted unity gain, delete the masterVolume key (absent still means 1.0) or set it above 0. The generated project_set_master_volume / skald_set_master_volume can also raise it at runtime.\n",
		v,
	)
}

build_project_from_raw :: proc(project_raw: ^Project_Raw) -> Project {
	project: Project
	project.bpm = project_raw.project.bpm
	// bpm <= 0 means the field was absent or null (older/hand-written JSON,
	// or a UI NaN serialized as null). A raw 0 reached the generated
	// `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)` as a
	// division by zero — the sequence never advanced and every note duration
	// went infinite. Default to 120, matching the param_ranges table (the
	// graph normaliser passes an absent session bpm through as 0 to land in
	// this same guard). Valid projects (bpm > 0) are never touched, so no
	// existing save is retimed.
	if project.bpm <= 0 do project.bpm = 120.0
	project.master_volume = resolved_master_volume(project_raw.project.master_volume)
	project.pattern_steps = project_raw.project.pattern_steps
	project.instruments = make([]Project_Instrument, len(project_raw.project.instruments))

	for raw_inst, i in project_raw.project.instruments {
		raw_graph_copy := raw_inst.audio_graph

		// A project JSON that omits voice_count or unison must not generate a
		// zero-voice processor or a zero-iteration unison loop (permanently
		// silent asset). These guards serve the graph shape too — the
		// normaliser funnels everything through here.
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
			// Absent -> limited: the safe default is the one games get without
			// asking (see Project_Instrument_Raw.limit).
			limit = raw_inst.limit.? or_else true,
			midi_config = raw_inst.midi_config,
			graph = build_graph_from_raw(&raw_graph_copy, fmt.tprintf("instrument %q", raw_inst.name)),
		}
	}

	// Project-level sequencer tracks reference instruments by id; keep them
	// consistent with the sanitized instrument ids above, and fold the
	// editor's camelCase patchOverrides spelling exactly as the per-graph
	// tracks get it inside build_graph_from_raw. Populated by the graph-shape
	// normaliser (build_project_from_graph_raw); the editor's own project
	// export carries its tracks inside each instrument's audio_graph instead.
	project.sequencer_tracks = project_raw.project.sequencer_tracks
	for i in 0 ..< len(project.sequencer_tracks) {
		resolve_note_event_aliases(project.sequencer_tracks[i].events)
		project.sequencer_tracks[i].target_node_id = sanitize_identifier(project.sequencer_tracks[i].target_node_id, true)
	}

	return project
}


/// Did this file carry a usable `session` block at all? Presence is now real,
/// not inferred: every Session_Raw field is a Maybe, so a key that was in the
/// JSON is non-nil even when its value is 0 — which is what lets an authored
/// `"masterVolume": 0` mean silence while a session-less legacy file keeps
/// exporting at unity (SKB-004 / packet B1; this proc's previous version
/// checked `> 0` and could not tell those apart). A partial block — say bpm
/// only — counts as present, and the missing fields take their documented
/// defaults silently; only the total absence is worth shouting about, because
/// that is the case where the export is at no authored tempo whatsoever.
session_has_values :: proc(session: Session_Raw) -> bool {
	return session.bpm != nil || session.masterVolume != nil || session.patternSteps != nil
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
/// writes and nearly every shipped example has. A NORMALISER, not a second
/// constructor (A4 step 2 / SKB-002): it translates the graph envelope into a
/// Project_Raw and hands it to build_project_from_raw, so there is exactly one
/// place defaults, clamps and the master-volume presence rule live. Its
/// previous incarnation duplicated build_project_from_raw's defaulting blocks
/// guard for guard "so a reader can diff the two by eye" — this deletes the
/// need to.
///
/// The graph shape's own knowledge stays here, and only that:
///   * the `session` block is where the graph shape authors bpm/masterVolume/
///     patternSteps (A4 step 1 / F-C3-2 — before it, this path hardcoded
///     bpm 120 / master 1.0 with exit code 0 and no warning), and total
///     session absence is warned about here because only this shape has the
///     legacy-fallback problem;
///   * instrument metadata lives in node params (`data` in a React Flow save);
///   * top-level sequencerTracks target instrument node ids and become
///     project-level tracks;
///   * a graph with no Instrument node at all is a legacy loose graph and is
///     wrapped whole as one SFX named Asset, so the old examples still codegen
///     and the acceptance harness can load them.
build_project_from_graph_raw :: proc(graph_raw: ^Graph_Raw) -> Project {
	session := graph_raw.session
	if !session_has_values(session) {
		warn_legacy_session_defaults()
	}

	project_raw: Project_Raw
	// absent -> 0 -> build_project_from_raw's `<= 0 -> 120` guard; an
	// authored masterVolume passes through as a Maybe so the ONE resolver
	// (resolved_master_volume, inside build_project_from_raw) decides between
	// absent-is-unity and authored-0-is-silence. patternSteps 0 = "fall back
	// to the longest active track" (generate_sequencer_code's
	// `global_steps <= 0` branch).
	project_raw.project.bpm = session.bpm.? or_else 0.0
	project_raw.project.master_volume = session.masterVolume
	project_raw.project.pattern_steps = session.patternSteps.? or_else 0
	// Both track spellings (React Flow's camelCase, project snake_case),
	// normalized and target-sanitized; build_project_from_raw resolves the
	// per-note patchOverrides alias and re-sanitizes (idempotently).
	project_raw.project.sequencer_tracks = sequencer_tracks_from_raw(graph_raw)

	// SKB-021 / packet B9-2: two Instrument nodes sharing a (sanitized) id is a
	// hard error, not a rename — sequencer tracks target instruments by this id
	// and a renamed instrument is one no track can reach. Scoped to instrument
	// nodes: a loose helper node sharing an instrument's id is discarded by the
	// `continue` below, never keyed, so it collides with nothing.
	validate_unique_node_ids(graph_raw.nodes, "the top-level graph", instrument_only = true)

	insts := make([dynamic]Project_Instrument_Raw)
	for raw_node in graph_raw.nodes {
		if normalize_node_type(raw_node.type) != "Instrument" do continue

		params := raw_node.parameters
		if len(params) == 0 && len(raw_node.data) > 0 {
			params = raw_node.data
		}

		id := sanitize_identifier(raw_node.id, true)

		// The subgraph is passed through RAW; build_project_from_raw calls
		// build_graph_from_raw on it exactly as it does for a project file's
		// audio_graph, which is what makes this a normaliser rather than a
		// parallel parser. An instrument with no subgraph normalises to an
		// empty Graph_Raw -> an empty (silent) instrument, as before.
		subgraph_raw: Graph_Raw
		has_subgraph := false
		if len(raw_node.subgraph) > 0 {
			subgraph_raw, has_subgraph = extract_graph_raw_from_object(raw_node.subgraph)
		}
		if !has_subgraph {
			if subgraph_val, ok := params["subgraph"]; ok {
				if subgraph_obj, is_obj := subgraph_val.(json.Object); is_obj {
					subgraph_raw, _ = extract_graph_raw_from_object(subgraph_obj)
				}
			}
		}

		// Node params carry presence natively (the key either is or is not in
		// the json.Object), so the Maybe fields are populated only when
		// authored — same contract as a project-shaped file.
		meta := Node{parameters = params}
		limit: Maybe(bool)
		if _, has_limit := params["limit"]; has_limit {
			limit = get_bool_param(meta, "limit", true)
		}

		append(&insts, Project_Instrument_Raw{
			id          = id,
			name        = get_string_param(meta, "name", "Untitled"),
			voice_count = int(get_f32_param_val(meta, "voiceCount", 1.0)),
			glide       = get_f32_param_val(meta, "glide", 0.0),
			unison      = int(get_f32_param_val(meta, "unison", 1.0)),
			detune      = get_f32_param_val(meta, "detune", 0.0),
			volume      = get_f32_param_val(meta, "volume", 1.0),
			limit       = limit,
			audio_graph = subgraph_raw,
		})
	}

	// Legacy loose graphs have no Instrument wrapper. Wrap the WHOLE envelope
	// (nodes, connections, top-level events and tracks) as one SFX named
	// Asset. volume/limit left at their absent values -> unity, limited.
	if len(insts) == 0 && len(graph_raw.nodes) > 0 {
		append(&insts, Project_Instrument_Raw{
			id          = "Asset",
			name        = "Asset",
			voice_count = 1,
			unison      = 1,
			audio_graph = graph_raw^,
		})
	}

	// SKB-003 / F-B04-1: instrument order = sorted by (sanitized) node id, a
	// total order after the dedup above, matching what nodes_sorted_by_id
	// gave the pre-collapse constructor. File order would also be
	// deterministic, but changing the order changes every wasm shim's integer
	// asset index — the exact wiring hazard A3 fixed.
	slice.sort_by(insts[:], proc(a, b: Project_Instrument_Raw) -> bool {
		return a.id < b.id
	})
	project_raw.project.instruments = insts[:]

	return build_project_from_raw(&project_raw)
}

/// THE reader. Decides the input's shape by its declarative top-level key —
/// `project` (a backend project export) or `nodes` (a React Flow editor save)
/// — the same classification the examples-corpus gate uses
/// (skald-ui/src/tests/corpus/corpusGate.ts listCorpus), then unmarshals with
/// the matching raw struct and funnels BOTH shapes through
/// build_project_from_raw. Replaces the CLI's structural sniffing
/// ("unmarshal as project, and if that yields no instruments, re-unmarshal as
/// graph and see if nodes appeared"), which existed because two independent
/// constructors needed a guess about which one to run (A4 step 2 / roadmap
/// §3.5). Returns an empty error string on success.
build_project_from_json :: proc(input_bytes: []byte) -> (Project, string) {
	root_val, root_err := json.parse(input_bytes)
	if root_err != nil {
		return Project{}, fmt.aprintf("input is not valid JSON: %v", root_err)
	}
	defer json.destroy_value(root_val)
	root, is_obj := root_val.(json.Object)
	if !is_obj {
		return Project{}, "input JSON is not an object; a Skald input has either a top-level \"project\" object or a top-level \"nodes\" array"
	}

	if _, has_project := root["project"]; has_project {
		project_raw: Project_Raw
		if err := json.unmarshal(input_bytes, &project_raw); err != nil {
			return Project{}, fmt.aprintf("project-shaped input failed to parse: %v", err)
		}
		return build_project_from_raw(&project_raw), ""
	}

	if _, has_nodes := root["nodes"]; has_nodes {
		graph_raw: Graph_Raw
		if err := json.unmarshal(input_bytes, &graph_raw); err != nil {
			return Project{}, fmt.aprintf("graph-shaped input failed to parse: %v", err)
		}
		return build_project_from_graph_raw(&graph_raw), ""
	}

	return Project{}, "input JSON is neither project-shaped (top-level \"project\" object) nor graph-shaped (top-level \"nodes\" array)"
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
