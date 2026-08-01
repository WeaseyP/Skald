package skald_core

import json "core:encoding/json"

// =================================================================================
// SECTION A: Core Data Structures & JSON Contract
// =================================================================================
Note_Event :: struct {
	note:       u8,
	velocity:   f32,
	start_time: f32, // Kept for compatibility, might be unused if step is used
    step:       int,
	duration:   f32,
	// 0..1 chance the step fires each loop; <=0 (absent in old fixtures)
	// means "always" - the UI serializes explicit values from 0.001 up.
	probability: f32,
	// Per-step parameter changes (P-locks): exposed-param name -> value,
	// applied via set_param just before the step's note_on. This is the ONLY
	// spelling the codegen reads.
	patch_overrides: map[string]f32,
	// The same P-locks under the editor's own key. A save file is
	// `reactFlowInstance.toObject()` plus the live SequencerTrack objects
	// (useFileIO.ts handleSave), so its notes carry the UI field name
	// `patchOverrides` (definitions/types.ts NoteEvent); only the
	// project-shaped export built by projectSerializer.ts converts it to
	// snake_case. Odin's unmarshaller matches a field name (or a `json:` tag)
	// exactly and has no alias mechanism, so the camelCase key needs its own
	// field; resolve_note_event_aliases folds it into `patch_overrides` at
	// parse time. Until this existed, every P-lock in every editor save was
	// silently dropped on the graph path — the path 100 of 101 shipped
	// examples take (BUGS.md SKB-002, findings F-C2-7 / F-C1-5).
	patchOverrides: map[string]f32,
}

Node :: struct {
	id:         string,
	// The id exactly as it appears in the project JSON, BEFORE
	// sanitize_identifier (and before duplicate-id renaming). The editor's
	// live preview addresses params as "<raw_id>::<param>" — it only knows
	// the ids it wrote, so the set/get_param aliases must be keyed by this,
	// not by the identifier-safe `id`.
	raw_id:     string,
	type:       string,
	parameters: json.Object,
	subgraph:   ^Graph,
}

Node_Raw :: struct {
	id:         string,
	type:       string,
	parameters: json.Object,
	// React Flow saves store node parameters under `data`; Project JSON uses
	// `parameters`. The parser normalizes either shape into Node.parameters.
	data:       json.Object,
	subgraph:   json.Object,
}

React_Flow_Edge_Raw :: struct {
	source:       string,
	sourceHandle: string,
	target:       string,
	targetHandle: string,
}

Sequencer_Track_Raw :: struct {
	targetNodeId: string,
	name:         string,
	notes:        []Note_Event,
	isMuted:      bool,
	isSolo:       bool,
	steps:        int,
}

Connection :: struct {
	from_node: string,
	from_port: string,
	to_node:   string,
	to_port:   string,
}

Sequencer_Track :: struct {
	target_node_id: string,
	name:           string,
	events:         []Note_Event,
	mute:           bool,
	solo:           bool,
	num_steps:      int,
}

// Per-instrument exposed-parameter resolution computed at codegen time.
// `field_name` is the resolved name on the processor struct (collision-free,
// possibly node-label-prefixed). `param_name` is the original UI-side name.
Exposed_Resolution :: struct {
	field_name:  string,
	param_name:  string,
	node_id:     string,
	// Raw (unsanitized) node id — see Node.raw_id. Keys the node-scoped
	// "<raw_id>::<param>" alias in the generated set/get_param dispatch.
	node_raw_id: string,
	default:     f32,
	range_min:   f32,
	range_max:   f32,
	unit:        string,
}

Graph :: struct {
	nodes:            map[string]Node,
	connections:      []Connection,
	events:           []Note_Event,
	sequencer_tracks: []Sequencer_Track,
	// In-memory only; populated by the codegen, not parsed from JSON.
	// Flat lookup keyed by `<node_id>::<param_name>` -> resolution. Flat
	// because Odin maps don't allow nested-map element assignment, and the
	// codegen needs a fast lookup from (node_id, param_name) pairs. Build
	// keys via `fmt.tprintf("%s::%s", node_id, param_name)` consistently.
	exposed_resolutions: map[string]Exposed_Resolution,
}

// The song-level settings a save file carries alongside the graph. The editor
// writes them as a top-level `session` object on every Save (useFileIO.ts
// `handleSave` spreads `session: sessionSettings`, whose type is
// `SessionSettings = { bpm, patternSteps, masterVolume }`), and the field names
// below are those keys verbatim — camelCase, not the snake_case that
// Project_Data_Raw uses for the same three quantities.
//
// Nothing in the backend had a field for this block until roadmap packet A4:
// build_project_from_graph hardcoded bpm 120 and master_volume 1.0 and never
// assigned pattern_steps, so a 140 BPM save exported at 120 with exit code 0
// and no warning (BUGS.md SKB-002, finding F-C3-2).
//
// Every field is optional. Odin's unmarshaller cannot report which keys were
// present, so an absent block and a `"session": {}` both arrive as zeroes —
// which mean the same thing, "not authored". build_project_from_graph applies
// the defaults.
//
// This struct deliberately covers only the three quantities that reach emitted
// code, not everything SessionSettings carries — the editor also keeps
// editor-only preferences there (`packageName` at time of writing), and unknown
// keys are skipped by the unmarshaller. Add a field here only when the backend
// actually needs to read it.
Session_Raw :: struct {
	bpm:          f32,
	patternSteps: int,
	masterVolume: f32,
}

Graph_Raw :: struct {
	nodes:            []Node_Raw,
	connections:      []Connection,
	// React Flow save files use `edges` with source/target field names.
	edges:            []React_Flow_Edge_Raw,
	events:           []Note_Event,
	sequencer_tracks: []Sequencer_Track,
	// React Flow save files use camelCase `sequencerTracks`.
	sequencerTracks:  []Sequencer_Track_Raw,
	// Tempo / master volume / pattern length. See Session_Raw.
	session:          Session_Raw,
}

// --- Project Level Structures (New for UI Integration) ---
Midi_Config :: struct {
	device:  string,
	channel: int,
}

Project_Instrument_Raw :: struct {
	id:          string,
	name:        string,
	mute:        bool,
	solo:        bool,
	voice_count: int,
	glide:       f32,
	unison:      int,
	detune:      f32,
	volume:      f32,
	midi_config: Midi_Config,
	audio_graph: Graph_Raw,
}

Project_Data_Raw :: struct {
	bpm:           f32,
	master_volume: f32,
	// Global loop length in steps (the UI's Pattern Steps control). Tracks
	// shorter than this wrap polyrhythmically. 0 = fall back to track length.
	pattern_steps: int,
	instruments:   []Project_Instrument_Raw,
}

Project_Raw :: struct {
	project: Project_Data_Raw,
}

Project_Instrument :: struct {
	id:          string,
	name:        string,
	mute:        bool,
	solo:        bool,
	voice_count: int,
	glide:       f32,
	unison:      int,
	detune:      f32,
	// Instrument output level, 0..1, baked into the generated process proc.
	// 0 means "absent from the JSON" and defaults to 1.0 at parse time (the
	// UI serializes an explicit floor of 0.001 instead of a true 0; muting
	// is the `mute` flag's job).
	volume:      f32,
	midi_config: Midi_Config,
	graph:       Graph,
}

Project :: struct {
	bpm:           f32,
	master_volume: f32,
	pattern_steps: int,
	instruments:   []Project_Instrument,
	sequencer_tracks: []Sequencer_Track,
}

// SFX = one-shot, fired explicitly via <Foo>_trigger.
// Music_Layer = looping pattern, started via <Foo>_start, sequencer auto-fires notes.
// Detection: an instrument with a sequencer track attached is a Music_Layer; without, SFX.
Asset_Type :: enum {
	SFX,
	Music_Layer,
}
