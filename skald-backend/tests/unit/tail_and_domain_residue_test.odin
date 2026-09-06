#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap B7 residue — B7-x3, B7-x1, B7-x2, B7-3-followup.
//
//   B7-x3  the skald_feedback_tail_seconds helper is emitted only when some
//          asset has a Delay/Reverb tail; every export used to carry it.
//   B7-x1  compute_bus_tail_seconds counts only Delay/Reverb nodes with a
//          path to the output; an orphaned Delay inflated the bound.
//   B7-x2  a Panner whose consumers are all mono inputs discards its pan
//          (the mono fallback is a pass-through since SKB-013) — warn.
//   B7-3-followup  a bus-domain (hoisted) modulator fed by a per-voice source
//          reads the voice SUM; SKB-017 survived one node upstream, silently.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

// --- B7-x3 ----------------------------------------------------------------

NO_TAIL_JSON :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [ { "from_node": "osc", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`

WITH_TAIL_JSON :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
    { "id": "dly", "type": "Delay", "parameters": { "delayTime": 0.25, "feedback": 0.5, "mix": 0.5 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [
    { "from_node": "osc", "from_port": "output", "to_node": "dly", "to_port": "input" },
    { "from_node": "dly", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`

@(test)
test_tail_helper_emitted_only_when_an_asset_has_a_tail :: proc(t: ^testing.T) {
	no_tail, err1 := core.build_project_from_json(transmute([]byte)string(NO_TAIL_JSON))
	testing.expect(t, err1 == "", err1)
	code := core.generate_project_code(&no_tail, "T", "generated_audio")
	testing.expect(t, !strings.contains(code, "skald_feedback_tail_seconds :: proc"), "a patch with no Delay/Reverb must not carry the tail helper")

	with_tail, err2 := core.build_project_from_json(transmute([]byte)string(WITH_TAIL_JSON))
	testing.expect(t, err2 == "", err2)
	code2 := core.generate_project_code(&with_tail, "T", "generated_audio")
	testing.expect(t, strings.contains(code2, "skald_feedback_tail_seconds :: proc"), "a patch with a Delay needs the helper its _bus_tail_seconds calls")
	testing.expect(t, strings.contains(code2, "skald_feedback_tail_seconds("), "and the per-asset tail proc calls it")
}

// --- B7-x1 ----------------------------------------------------------------

@(test)
test_orphaned_delay_does_not_count_toward_the_tail :: proc(t: ^testing.T) {
	// osc -> out, plus a Delay wired from the osc but feeding NOTHING.
	dly_params := json.Object{"delayTime" = json.Float(0.5), "feedback" = json.Float(0.9), "mix" = json.Float(0.5)}
	defer delete(dly_params)
	nodes := []core.Node{
		{id = "dly", raw_id = "dly", type = "Delay", parameters = dly_params},
		{id = "osc", raw_id = "osc", type = "Oscillator"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "out", to_port = "input"},
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
	}
	plan: core.Instrument_Plan
	all := core.nodes_sorted_by_id(&g)
	defer delete(all)
	testing.expect_value(t, core.compute_bus_tail_seconds(&g, all, &plan), 0.0)

	// The same Delay wired INTO the output counts.
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
		{from_node = "dly", from_port = "output", to_node = "out", to_port = "input"},
	}
	testing.expect(t, core.compute_bus_tail_seconds(&g, all, &plan) > 0.0, "a Delay on the way to the output has a tail")
}

@(test)
test_tail_with_no_graph_output_is_unchanged :: proc(t: ^testing.T) {
	// No GraphOutput at all: nothing sounds, and the already-warned shape's
	// behaviour (every Delay counted) must not change under B7-x1.
	dly_params := json.Object{"delayTime" = json.Float(0.5), "feedback" = json.Float(0.9), "mix" = json.Float(0.5)}
	defer delete(dly_params)
	nodes := []core.Node{{id = "dly", raw_id = "dly", type = "Delay", parameters = dly_params}}
	g := graph_of(nodes)
	defer delete(g.nodes)
	plan: core.Instrument_Plan
	all := core.nodes_sorted_by_id(&g)
	defer delete(all)
	testing.expect(t, core.compute_bus_tail_seconds(&g, all, &plan) > 0.0, "without an output every Delay still counts, as before")
}

// --- B7-x2 ----------------------------------------------------------------

@(test)
test_panner_stereo_consumer_detection :: proc(t: ^testing.T) {
	nodes := []core.Node{
		{id = "pan", raw_id = "pan", type = "Panner"},
		{id = "gain", raw_id = "gain", type = "Gain"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	pan := g.nodes["pan"]

	g.connections = []core.Connection{
		{from_node = "pan", from_port = "output", to_node = "gain", to_port = "input"},
		{from_node = "gain", from_port = "output", to_node = "out", to_port = "input"},
	}
	testing.expect(t, !core.panner_has_stereo_consumer(&g, pan), "Panner -> Gain -> Output: only the mono pass-through is read; pan is discarded")

	g.connections = []core.Connection{
		{from_node = "pan", from_port = "output_left", to_node = "out", to_port = "input"},
		{from_node = "pan", from_port = "output_right", to_node = "out", to_port = "input"},
	}
	testing.expect(t, core.panner_has_stereo_consumer(&g, pan), "Panner -> Output reads left/right")
}

// --- B7-3-followup ---------------------------------------------------------

@(test)
test_adsr_into_hoisted_mapper_is_a_conflict :: proc(t: ^testing.T) {
	// ADSR -> Mapper -> Filter.cutoff, Filter after a Delay (bus). The Mapper
	// hoists into the bus; the ADSR cannot, so the Mapper would read the
	// voice-summed envelope.
	nodes := []core.Node{
		{id = "osc", raw_id = "osc", type = "Oscillator"},
		{id = "env", raw_id = "env", type = "ADSR"},
		{id = "map", raw_id = "map", type = "Mapper"},
		{id = "dly", raw_id = "dly", type = "Delay"},
		{id = "flt", raw_id = "flt", type = "Filter"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
		{from_node = "dly", from_port = "output", to_node = "flt", to_port = "input"},
		{from_node = "flt", from_port = "output", to_node = "out", to_port = "input"},
		{from_node = "env", from_port = "output", to_node = "map", to_port = "input"},
		{from_node = "map", from_port = "output", to_node = "flt", to_port = "input_cutoff"},
	}
	sorted, is_dag := core.topological_sort(&g)
	defer delete(sorted)
	testing.expect(t, is_dag, "fixture must be a DAG")
	bus := core.seed_bus_domain(&g, sorted)
	defer delete(bus)
	_, cross := core.hoist_bus_modulators(&g, sorted, &bus)
	testing.expect(t, !cross, "no cross-domain conflict: the Mapper feeds only the bus")
	testing.expect(t, bus["map"], "the Mapper is hoisted")

	up, found := core.find_voice_source_into_bus_modulator(&g, sorted, &bus)
	testing.expect(t, found, "a per-voice ADSR feeding a bus-domain Mapper must be reported")
	testing.expect_value(t, up.modulator_id, "map")
	testing.expect_value(t, up.source_id, "env")
}

@(test)
test_lfo_into_hoisted_mapper_is_fine :: proc(t: ^testing.T) {
	// LFO -> Mapper -> bus Filter: the LFO hoists too (sinks-first pass), so
	// the whole chain is bus-domain and nothing is summed.
	nodes := []core.Node{
		{id = "osc", raw_id = "osc", type = "Oscillator"},
		{id = "lfo", raw_id = "lfo", type = "LFO"},
		{id = "map", raw_id = "map", type = "Mapper"},
		{id = "dly", raw_id = "dly", type = "Delay"},
		{id = "flt", raw_id = "flt", type = "Filter"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
		{from_node = "dly", from_port = "output", to_node = "flt", to_port = "input"},
		{from_node = "flt", from_port = "output", to_node = "out", to_port = "input"},
		{from_node = "lfo", from_port = "output", to_node = "map", to_port = "input"},
		{from_node = "map", from_port = "output", to_node = "flt", to_port = "input_cutoff"},
	}
	sorted, _ := core.topological_sort(&g)
	defer delete(sorted)
	bus := core.seed_bus_domain(&g, sorted)
	defer delete(bus)
	core.hoist_bus_modulators(&g, sorted, &bus)
	testing.expect(t, bus["lfo"] && bus["map"], "the whole chain hoists")
	_, found := core.find_voice_source_into_bus_modulator(&g, sorted, &bus)
	testing.expect(t, !found, "a bus-domain chain has no per-voice source to report")
}

@(test)
test_voice_audio_into_bus_delay_is_not_a_modulator_conflict :: proc(t: ^testing.T) {
	// The ordinary audio path: per-voice Oscillator summed INTO a bus Delay.
	// That sum is the point of the bus; only bus-domain MODULATORS are judged.
	nodes := []core.Node{
		{id = "osc", raw_id = "osc", type = "Oscillator"},
		{id = "dly", raw_id = "dly", type = "Delay"},
		{id = "out", raw_id = "out", type = "GraphOutput"},
	}
	g := graph_of(nodes)
	defer delete(g.nodes)
	g.connections = []core.Connection{
		{from_node = "osc", from_port = "output", to_node = "dly", to_port = "input"},
		{from_node = "dly", from_port = "output", to_node = "out", to_port = "input"},
	}
	sorted, _ := core.topological_sort(&g)
	defer delete(sorted)
	bus := core.seed_bus_domain(&g, sorted)
	defer delete(bus)
	core.hoist_bus_modulators(&g, sorted, &bus)
	_, found := core.find_voice_source_into_bus_modulator(&g, sorted, &bus)
	testing.expect(t, !found, "voice audio into a bus effect is the normal path, not a conflict")
}
