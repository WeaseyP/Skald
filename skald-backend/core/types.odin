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
	subgraph:   json.Object,
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

Graph :: struct {
	nodes:            map[string]Node,
	connections:      []Connection,
	events:           []Note_Event,
	sequencer_tracks: []Sequencer_Track,
}

Graph_Raw :: struct {
	nodes:            []Node_Raw,
	connections:      []Connection,
	events:           []Note_Event,
	sequencer_tracks: []Sequencer_Track,
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
	midi_config: Midi_Config,
	audio_graph: Graph_Raw,
}

Project_Data_Raw :: struct {
	bpm:           f32,
	master_volume: f32,
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
	midi_config: Midi_Config,
	graph:       Graph,
}

Project :: struct {
	bpm:           f32,
	master_volume: f32,
	instruments:   []Project_Instrument,
	sequencer_tracks: []Sequencer_Track,
}
