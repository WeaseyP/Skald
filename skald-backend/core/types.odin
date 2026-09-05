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
}

Instrument_Plan :: struct {
	exposed_resolutions: map[string]Exposed_Resolution,
	stable_resolutions: [dynamic]Exposed_Resolution,
}

// The song-level settings a save file carries alongside the graph. The editor
// writes them as a top-level `session` object on every Save (useFileIO.ts
// `handleSave` spreads `session: sessionSettings`, whose type is
// `SessionSettings = { bpm, patternSteps, masterVolume }`), and the field names
// below are those keys verbatim — camelCase, not the snake_case that
// Project_Data_Raw uses for the same three quantities.
//
// Nothing in the backend had a field for this block until roadmap packet A4:
// the old graph-path constructor hardcoded bpm 120 and master_volume 1.0 and
// never assigned pattern_steps, so a 140 BPM save exported at 120 with exit
// code 0 and no warning (BUGS.md SKB-002, finding F-C3-2).
//
// Every field is optional, and PRESENCE IS PART OF THE CONTRACT: an authored
// `"masterVolume": 0` means the author pulled the master fader to silence
// (SKB-004 / packet B1), while an absent key means "not authored" and takes
// the documented default (unity master, 120 bpm). Odin's unmarshaller cannot
// report which keys were present through a plain f32 — absent and authored-0
// both arrive as 0 — so every field is a Maybe: the unmarshaller treats a
// single-variant union as its variant, assigns it only when the key is
// present with a usable value, and leaves it nil for an absent key OR an
// explicit `null` (a UI NaN serializes as null, and "not a number" and "not
// authored" must mean the same thing). resolved_master_volume and
// build_project_from_graph_raw collapse the Maybes into final values in
// exactly one place each.
//
// This struct deliberately covers only the three quantities that reach emitted
// code, not everything SessionSettings carries — the editor also keeps
// editor-only preferences there (`packageName` at time of writing), and unknown
// keys are skipped by the unmarshaller. Add a field here only when the backend
// actually needs to read it.
Session_Raw :: struct {
	bpm:          Maybe(f32),
	patternSteps: Maybe(int),
	masterVolume: Maybe(f32),
}

// The save-file schema version this reader understands (packet C1). Mirrors
// CURRENT_SAVE_VERSION in skald-ui/src/utils/saveMigrations.ts — bump both.
//   2 (C3): Instrument nodes carry `exportId` and `assetType`.
SAVE_FORMAT_VERSION :: 2

Graph_Raw :: struct {
	// Stamped by the editor's Save since C1; absent (pre-C1) unmarshals as 0.
	version:          int,
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
	// Per-asset output soft limit (packet B1, roadmap §3.7). Maybe because the
	// default is TRUE and a plain bool zero-values to false: an absent key must
	// mean "limited", so that the per-asset path — the one games link against,
	// measured peaking at 3.93 on the manual's own canonical patch — can never
	// exceed ±1 unless the author explicitly opts out.
	limit:       Maybe(bool),
	// C3 (F-B05-4, F-A09-7): the symbol prefix the game compiles against,
	// decoupled from the display name. Empty = not set (pre-C3 files), and
	// the prefix is derived from `name` exactly as it always was.
	export_id:   string,
	// C3 (F-A09-8): "sfx" | "music". Empty = infer from the tracks, the
	// pre-C3 rule. See parse_asset_type_setting.
	asset_type:  string,
	midi_config: Midi_Config,
	audio_graph: Graph_Raw,
}

Project_Data_Raw :: struct {
	bpm:           f32,
	// Maybe, not f32, for the same reason as Session_Raw.masterVolume: an
	// authored 0 is silence (SKB-004 / packet B1) while an absent key is
	// unity, and only the unmarshaller can tell them apart. bpm stays a plain
	// f32 because 0 is not a legal tempo either way — absent and authored-0
	// both take the 120 default (an authored bpm of 0 reached the generated
	// step clock as a division by zero).
	master_volume: Maybe(f32),
	// Global loop length in steps (the UI's Pattern Steps control). Tracks
	// shorter than this wrap polyrhythmically. 0 = fall back to track length.
	pattern_steps: int,
	instruments:   []Project_Instrument_Raw,
	// Project-level sequencer tracks, referencing instruments by id. The
	// editor's project export never writes these (its tracks travel inside
	// each instrument's audio_graph — the refuted F-B09b-2 confirmed that),
	// but the GRAPH shape carries its tracks at the top level, and the A4
	// step-2 normaliser funnels them through here so build_project_from_raw
	// is the one constructor for both shapes.
	sequencer_tracks: []Sequencer_Track,
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
	// Instrument output level, 0..1. Since packet B1 this is a real runtime
	// field on the generated processor (initialized to this value, driven by
	// <Foo>_set_volume), not a baked literal. 0 means "absent from the JSON"
	// and defaults to 1.0 at parse time (the UI serializes an explicit floor
	// of 0.001 instead of a true 0; muting is the `mute` flag's job — note
	// this is deliberately NOT the master_volume rule, where an authored 0 IS
	// silence).
	volume:      f32,
	// Resolved from Project_Instrument_Raw.limit (or the Instrument node's
	// `limit` param on the graph path); true when absent. When true, the
	// generated <Foo>_process passes its post-volume output through
	// skald_soft_limit so it can never exceed ±1.
	limit:       bool,
	// See Project_Instrument_Raw.export_id / asset_type.
	export_id:   string,
	asset_type:  Asset_Type_Setting,
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

// C3 (F-A09-8): what the Instrument node SAYS it is. Auto is the pre-C3
// behaviour — detect_asset_type infers Music_Layer from an active sequencer
// track — kept so files that predate the field generate exactly as before.
// The editor's migration 1->2 backfills every instrument with the inferred
// value once, after which the classification is a deliberate setting that
// deleting the last note from a track can no longer flip.
Asset_Type_Setting :: enum {
	Auto,
	SFX,
	Music_Layer,
}

// The editor writes lowercase "sfx" / "music". Anything else — including a
// spelling a future editor might introduce — is Auto: inferring is safer
// than guessing what an unknown value meant.
parse_asset_type_setting :: proc(s: string) -> Asset_Type_Setting {
	switch s {
	case "sfx":   return .SFX
	case "music": return .Music_Layer
	}
	return .Auto
}
