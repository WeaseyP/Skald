package skald_unit_tests

// =====================================================================
// Roadmap packet G5 (roadmap 9.18, KI-018) — configurable voice-steal
// policy and per-trigger pitch/velocity jitter.
//
//   core.parse_steal_mode(s) -> core.Steal_Mode
//       "oldest" | "quietest" | anything else (including absent — the
//       pre-G5 default, since nothing ever wrote this key before now).
//   core.jitter_seed_from_name(name) -> u32
//       The digest generate_processor_code bakes into `_init` as
//       `p.jitter_rng.state`; deterministic in its input, which is what
//       makes a jittered golden reproducible run to run.
//   Project_Instrument.steal_mode / pitch_jitter / velocity_jitter
//       Parsed from both JSON shapes — see json.odin's
//       build_project_from_raw and build_project_from_graph_raw.
//
// The steal-mode BEHAVIOUR itself (which voice actually gets cut) is an
// acceptance-level property of generated DSP, not a unit-testable pure
// function — see tests/fixtures/steal_quietest.json and the "steal_quietest"
// case in acceptance/main.odin. The jitter RANGE (pitch offset must land
// within the authored ±cents window) is similarly pinned by the
// "jitter_pitch" acceptance fixture. This file covers the parsing and the
// seed digest only.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:testing"

@(test)
test_parse_steal_mode_recognises_the_editor_spellings :: proc(t: ^testing.T) {
	testing.expect_value(t, core.parse_steal_mode("oldest"), core.Steal_Mode.Oldest)
	testing.expect_value(t, core.parse_steal_mode("quietest"), core.Steal_Mode.Quietest)
}

@(test)
test_parse_steal_mode_defaults_to_release_first :: proc(t: ^testing.T) {
	// Absent (every file that predates G5), the explicit spelling, and a
	// stale/foreign value (a hand-edited file, or the old dead
	// "oldest"/"newest" field name/values that never populated this key)
	// must all reach the one code path that reproduces C6-1 byte for byte.
	testing.expect_value(t, core.parse_steal_mode(""), core.Steal_Mode.Release_First)
	testing.expect_value(t, core.parse_steal_mode("release-first"), core.Steal_Mode.Release_First)
	testing.expect_value(t, core.parse_steal_mode("newest"), core.Steal_Mode.Release_First)
	testing.expect_value(t, core.parse_steal_mode("Quietest"), core.Steal_Mode.Release_First)
}

@(test)
test_jitter_seed_is_deterministic_in_its_name :: proc(t: ^testing.T) {
	a1 := core.jitter_seed_from_name("Bass")
	a2 := core.jitter_seed_from_name("Bass")
	testing.expect_value(t, a1, a2)
}

@(test)
test_jitter_seed_differs_between_distinct_names :: proc(t: ^testing.T) {
	// Not a mathematical guarantee for an arbitrary hash — just proves this
	// is a real digest of the name, not a constant, for the two names the
	// acceptance fixtures actually use.
	a := core.jitter_seed_from_name("Asset")
	b := core.jitter_seed_from_name("JitterPitchAsset")
	testing.expect(t, a != b, "two different asset names must not collide onto one seed")
}

@(test)
test_raw_project_shape_reads_steal_mode_and_jitter :: proc(t: ^testing.T) {
	src := `{
	  "project": {
	    "bpm": 120,
	    "instruments": [
	      { "id": "a", "name": "Asset", "voice_count": 3, "steal_mode": "quietest",
	        "pitch_jitter": 50, "velocity_jitter": 0.3,
	        "audio_graph": { "nodes": [
	          { "id": "o", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.5 } },
	          { "id": "out", "type": "GraphOutput", "parameters": {} }
	        ], "connections": [
	          { "from_node": "o", "from_port": "output", "to_node": "out", "to_port": "input" }
	        ], "sequencer_tracks": [] } }
	    ]
	  }
	}`
	project, err := core.build_project_from_json(transmute([]byte)src)
	testing.expect(t, err == "", err)
	if err != "" do return
	testing.expect_value(t, len(project.instruments), 1)
	if len(project.instruments) != 1 do return
	inst := &project.instruments[0]
	testing.expect_value(t, inst.steal_mode, core.Steal_Mode.Quietest)
	testing.expect_value(t, inst.pitch_jitter, f32(50))
	testing.expect_value(t, inst.velocity_jitter, f32(0.3))
}

@(test)
test_raw_project_shape_defaults_when_absent :: proc(t: ^testing.T) {
	// No steal_mode/pitch_jitter/velocity_jitter keys at all — every file
	// that predates G5. Must resolve to the byte-identical defaults.
	src := `{
	  "project": {
	    "bpm": 120,
	    "instruments": [
	      { "id": "a", "name": "Asset", "voice_count": 1,
	        "audio_graph": { "nodes": [
	          { "id": "out", "type": "GraphOutput", "parameters": {} }
	        ], "connections": [], "sequencer_tracks": [] } }
	    ]
	  }
	}`
	project, err := core.build_project_from_json(transmute([]byte)src)
	testing.expect(t, err == "", err)
	if err != "" do return
	inst := &project.instruments[0]
	testing.expect_value(t, inst.steal_mode, core.Steal_Mode.Release_First)
	testing.expect_value(t, inst.pitch_jitter, f32(0))
	testing.expect_value(t, inst.velocity_jitter, f32(0))
}

@(test)
test_graph_shape_reads_steal_mode_and_jitter_from_the_instrument_node :: proc(t: ^testing.T) {
	src := `{
	  "version": 2,
	  "nodes": [
	    { "id": "inst1", "type": "instrument", "position": {"x":0,"y":0},
	      "data": { "name": "Bass Synth", "voiceCount": 3, "stealMode": "oldest",
	                "pitchJitter": 25, "velocityJitter": 0.2,
	                "subgraph": { "nodes": [
	                  { "id": "o", "type": "oscillator", "position": {"x":0,"y":0}, "data": { "frequency": 110 } },
	                  { "id": "g", "type": "graphOutput", "position": {"x":0,"y":0}, "data": {} }
	                ], "connections": [ { "from_node": "o", "from_port": "output", "to_node": "g", "to_port": "input" } ] } } }
	  ],
	  "edges": [],
	  "sequencerTracks": []
	}`
	project, err := core.build_project_from_json(transmute([]byte)src)
	testing.expect(t, err == "", err)
	if err != "" do return
	testing.expect_value(t, len(project.instruments), 1)
	if len(project.instruments) != 1 do return
	inst := &project.instruments[0]
	testing.expect_value(t, inst.steal_mode, core.Steal_Mode.Oldest)
	testing.expect_value(t, inst.pitch_jitter, f32(25))
	testing.expect_value(t, inst.velocity_jitter, f32(0.2))
}

@(test)
test_graph_shape_defaults_when_absent :: proc(t: ^testing.T) {
	src := `{
	  "version": 2,
	  "nodes": [
	    { "id": "inst1", "type": "instrument", "position": {"x":0,"y":0},
	      "data": { "name": "Bass Synth",
	                "subgraph": { "nodes": [
	                  { "id": "g", "type": "graphOutput", "position": {"x":0,"y":0}, "data": {} }
	                ], "connections": [] } } }
	  ],
	  "edges": [],
	  "sequencerTracks": []
	}`
	project, err := core.build_project_from_json(transmute([]byte)src)
	testing.expect(t, err == "", err)
	if err != "" do return
	inst := &project.instruments[0]
	testing.expect_value(t, inst.steal_mode, core.Steal_Mode.Release_First)
	testing.expect_value(t, inst.pitch_jitter, f32(0))
	testing.expect_value(t, inst.velocity_jitter, f32(0))
}
