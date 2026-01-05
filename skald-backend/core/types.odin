package skald_core

import json "core:encoding/json"

// =================================================================================
// SECTION A: Core Data Structures & JSON Contract
// =================================================================================
Note_Event :: struct {
	note:       u8,
	velocity:   f32,
	start_time: f32,
	duration:   f32,
}

Node :: struct {
	id:         int,
	type:       string,
	parameters: json.Object,
	subgraph:   ^Graph,
}

Node_Raw :: struct {
	id:         int,
	type:       string,
	parameters: json.Object,
	subgraph:   json.Object,
}

Connection :: struct {
	from_node: int,
	from_port: string,
	to_node:   int,
	to_port:   string,
}

Sequencer_Track :: struct {
	target_node_id: int,
	name:           string,
	events:         []Note_Event,
	mute:           bool,
	solo:           bool,
}

Graph :: struct {
	nodes:            map[int]Node,
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
}
