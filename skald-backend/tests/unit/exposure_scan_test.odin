#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet B2 / BUGS.md SKB-006, SKB-059 — exposure honesty.
//
// Three things are under test:
//
//   core.param_is_reachable / core.param_dead_reason — the MidiInput case.
//       SKB-059: the editor's default MIDI Input node shipped
//       exposedParameters: ["device", "useMpe"], neither of which any
//       generator reads. The predicate had no MidiInput case, returned
//       true, and every new MIDI Input minted two dead setters.
//
//   core.exposed_field_is_read(code, field)
//       The safety net under the predicate: a text scan of the emitted
//       processor for a READ of `p.<field>`. Writes (init, setter, P-lock)
//       and the mechanical `return p.<field>, true` of _get_param do not
//       count; anything else does.
//
//   core.generate_project_code end to end
//       A hand-edited file that exposes Filter `type` — a string the
//       generator bakes at codegen time and never reads at runtime — gets
//       its `_set_type` pruned from the body AND from the header listing,
//       while its live sibling `cutoff` keeps both.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

// --- MidiInput reachability ----------------------------------------------

@(test)
test_midi_input_params_are_never_reachable :: proc(t: ^testing.T) {
	params := json.Object{"device" = json.String("All"), "useMpe" = json.Boolean(false)}
	defer delete(params)
	n := node_with("MidiInput", params)
	testing.expect(t, !core.param_is_reachable(n, "device"), "MidiInput `device` is routing config the DSP never reads")
	testing.expect(t, !core.param_is_reachable(n, "useMpe"), "MidiInput `useMpe` is routing config the DSP never reads")
	testing.expect(t, strings.contains(core.param_dead_reason(n, "device"), "MIDI Input"), "the reason must name the node type so the message reads as a rule, not a mystery")
}

@(test)
test_midi_input_exposure_is_dropped_from_the_plan :: proc(t: ^testing.T) {
	exposed := json.Array{json.String("device"), json.String("useMpe")}
	defer delete(exposed)
	params := json.Object{"device" = json.String("All"), "useMpe" = json.Boolean(false), "exposedParameters" = exposed}
	defer delete(params)
	n := node_with_id("midi", "MidiInput", params)
	names := core.effective_exposed_params(n, nil)
	defer delete(names)
	testing.expect_value(t, len(names), 0)
}

// --- exposed_field_is_read -------------------------------------------------

@(test)
test_write_only_field_is_not_read :: proc(t: ^testing.T) {
	code := "\tp.cutoff = 800.000000000\n" +
		"Asset_set_cutoff :: proc(p: ^Asset_Processor, value: f32) {\n\tp.cutoff = v\n}\n" +
		"\tcase \"cutoff\":\n\t\treturn p.cutoff, true\n"
	testing.expect(t, !core.exposed_field_is_read(code, "cutoff"), "init write + setter write + get_param read-back are the mechanical sites; none is a DSP read")
}

@(test)
test_dsp_read_counts :: proc(t: ^testing.T) {
	code := "\tp.cutoff = 800.0\n\t\t\t\tcutoff_hz: f32 = p.cutoff;\n"
	testing.expect(t, core.exposed_field_is_read(code, "cutoff"), "a use on the right-hand side is a read")
	compound := "\tp.phase += 0.1\n"
	testing.expect(t, core.exposed_field_is_read(compound, "phase"), "a compound assignment consumes the field")
	compare := "\tif p.gate == 1.0 {\n"
	testing.expect(t, core.exposed_field_is_read(compare, "gate"), "a comparison is a read, not an assignment")
}

@(test)
test_longer_identifiers_are_not_this_field :: proc(t: ^testing.T) {
	code := "\tx := p.cutoff_smoothed\n\ty := wasm_p.cutoff\n"
	testing.expect(t, !core.exposed_field_is_read(code, "cutoff"), "p.cutoff_smoothed and wasm_p.cutoff are other identifiers")
}

// --- end to end: a string exposure is pruned from body and header ---------

FILTER_TYPE_EXPOSED_JSON :: `{
  "project": {
    "bpm": 120,
    "instruments": [
      {
        "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
        "audio_graph": {
          "nodes": [
            { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Saw", "amplitude": 0.4 } },
            { "id": "flt", "type": "Filter", "parameters": { "type": "Lowpass", "cutoff": 800, "resonance": 1, "exposedParameters": ["type", "cutoff"] } },
            { "id": "out", "type": "GraphOutput", "parameters": {} }
          ],
          "connections": [
            { "from_node": "osc", "from_port": "output", "to_node": "flt", "to_port": "input" },
            { "from_node": "flt", "from_port": "output", "to_node": "out", "to_port": "input" }
          ],
          "sequencer_tracks": []
        }
      }
    ]
  }
}`

@(test)
test_unread_string_exposure_is_pruned_from_body_and_header :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(transmute([]byte)string(FILTER_TYPE_EXPOSED_JSON))
	testing.expect(t, err == "", err)
	code := core.generate_project_code(&project, "Test", "generated_audio")

	testing.expect(t, strings.contains(code, "Asset_set_cutoff :: proc("), "the live sibling keeps its setter")
	testing.expect(t, !strings.contains(code, "Asset_set_type :: proc("), "a setter for a field the DSP never reads must not be emitted")
	testing.expect(t, !strings.contains(code, "{\"type\","), "no _PARAMS row for the pruned field")

	header := code[:strings.index(code, "import \"core:math\"")]
	testing.expect(t, strings.contains(header, "Asset_set_cutoff"), "header lists the live field")
	testing.expect(t, !strings.contains(header, "Asset_set_type"), "header must not advertise the pruned field")
}

// --- Oscillator pulseWidth (found by the scan, moved into the table) -------

@(test)
test_oscillator_pulsewidth_dead_unless_square :: proc(t: ^testing.T) {
	sine_params := json.Object{"waveform" = json.String("Sine")}
	defer delete(sine_params)
	sine := node_with("Oscillator", sine_params)
	testing.expect(t, !core.param_is_reachable(sine, "pulseWidth"), "a Sine oscillator never reads pulseWidth")
	testing.expect(t, strings.contains(core.param_dead_reason(sine, "pulseWidth"), "Square"), "the reason must name the one waveform that makes it live")

	absent := node_with("Oscillator", json.Object{})
	testing.expect(t, !core.param_is_reachable(absent, "pulseWidth"), "an absent waveform defaults to Sine in the generator, so pulseWidth is dead")

	square_params := json.Object{"waveform" = json.String("Square")}
	defer delete(square_params)
	square := node_with("Oscillator", square_params)
	testing.expect(t, core.param_is_reachable(square, "pulseWidth"), "a Square oscillator reads pulseWidth every sample")

	// Exact match, like the generator's switch: "square" is not "Square".
	lower_params := json.Object{"waveform" = json.String("square")}
	defer delete(lower_params)
	lower := node_with("Oscillator", lower_params)
	testing.expect(t, !core.param_is_reachable(lower, "pulseWidth"), "the generator's switch is case-sensitive, so the predicate must be too")
}

@(test)
test_wavetable_has_no_pulsewidth_rule :: proc(t: ^testing.T) {
	// Over-pruning guard: the Oscillator rule must not leak into the shared
	// case arm. A Wavetable exposing an unknown name stays "reachable" here
	// and is the scan's business, not the table's.
	n := node_with("Wavetable", json.Object{})
	testing.expect(t, core.param_is_reachable(n, "pulseWidth"), "Wavetable is not governed by the Oscillator pulseWidth rule")
}
