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
	// applied via set_param just before the step's note_on.
	patch_overrides: map[string]f32,
}

Node :: struct {
	id:         string,
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
	field_name: string,
	param_name: string,
	node_id:    string,
	default:    f32,
	range_min:  f32,
	range_max:  f32,
	unit:       string,
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

Graph_Raw :: struct {
	nodes:            []Node_Raw,
	connections:      []Connection,
	// React Flow save files use `edges` with source/target field names.
	edges:            []React_Flow_Edge_Raw,
	events:           []Note_Event,
	sequencer_tracks: []Sequencer_Track,
	// React Flow save files use camelCase `sequencerTracks`.
	sequencerTracks:  []Sequencer_Track_Raw,
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
