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

Graph :: struct {
	nodes:       map[int]Node,
	connections: []Connection,
	events:      []Note_Event,
}

Graph_Raw :: struct {
	nodes:       []Node_Raw,
	connections: []Connection,
	events:      []Note_Event,
}
