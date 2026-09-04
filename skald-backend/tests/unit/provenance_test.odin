package skald_unit_tests

// =====================================================================
// Roadmap packet B12 — the generated-API contract header.
//
// Three things are under test:
//
//   core.fnv1a64 / core.input_digest
//       The digest algorithm the header prints and the TypeScript mirror
//       (skald-ui/src/main/codegenStamp.ts) recomputes. Pinned against the
//       published FNV-1a test vectors so neither side can drift silently.
//       input_digest must ignore CR bytes: the same committed file is CRLF in
//       a Windows working tree and LF in a `git archive` export, and a digest
//       that saw the difference would turn every golden red in
//       verify-baseline.ps1 while green in the tree.
//
//   core.generate_project_code(..., provenance)
//       The header must carry: the AUTO-GENERATED banner, the generator
//       stamp and input digest it was handed, the thread rule, and every
//       asset's exposed parameters with both setter styles — emitted from
//       the same Instrument_Plan the setters and _PARAMS come from, so the
//       header cannot advertise a setter the body does not have.
//
//   core.generate_wasm_shim_code(..., provenance)
//       The second shape from the same analysis (CLAUDE.md) carries the
//       same banner and stamp.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:strings"
import "core:testing"

// --- digests -----------------------------------------------------------

@(test)
test_fnv1a64_matches_published_vectors :: proc(t: ^testing.T) {
	// From the FNV reference implementation's test suite.
	testing.expect_value(t, core.fnv1a64(transmute([]byte)string("")), u64(0xcbf29ce484222325))
	testing.expect_value(t, core.fnv1a64(transmute([]byte)string("a")), u64(0xaf63dc4c8601ec8c))
	testing.expect_value(t, core.fnv1a64(transmute([]byte)string("foobar")), u64(0x85944171f73967e8))
}

@(test)
test_input_digest_ignores_carriage_returns :: proc(t: ^testing.T) {
	lf := transmute([]byte)string("{\n  \"nodes\": []\n}\n")
	crlf := transmute([]byte)string("{\r\n  \"nodes\": []\r\n}\r\n")
	testing.expect_value(t, core.input_digest(crlf), core.input_digest(lf))
	// ...and is otherwise the plain FNV-1a of the bytes, so an LF file's
	// digest can be recomputed by any FNV-1a implementation.
	testing.expect_value(t, core.input_digest(lf), core.fnv1a64(lf))
}

@(test)
test_input_digest_sees_content_changes :: proc(t: ^testing.T) {
	a := transmute([]byte)string("{\"bpm\": 120}")
	b := transmute([]byte)string("{\"bpm\": 121}")
	testing.expect(t, core.input_digest(a) != core.input_digest(b), "a one-character content change must change the digest")
}

// --- the header --------------------------------------------------------

// A project-shaped input with one exposed parameter and one asset with none,
// so the listing has both a populated and an empty case to show.
HEADER_PROJECT_JSON :: `{
  "project": {
    "bpm": 120,
    "master_volume": 0.8,
    "instruments": [
      {
        "id": "lead_id", "name": "Lead", "voice_count": 2, "unison": 1,
        "audio_graph": {
          "nodes": [
            { "id": "osc1", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4, "exposedParameters": ["amplitude"] } },
            { "id": "out", "type": "GraphOutput", "parameters": {} }
          ],
          "connections": [ { "from_node": "osc1", "from_port": "output", "to_node": "out", "to_port": "input" } ],
          "sequencer_tracks": []
        }
      },
      {
        "id": "pad_id", "name": "Pad", "voice_count": 1, "unison": 1,
        "audio_graph": {
          "nodes": [
            { "id": "n1", "type": "Noise", "parameters": { "amplitude": 0.2 } },
            { "id": "out", "type": "GraphOutput", "parameters": {} }
          ],
          "connections": [ { "from_node": "n1", "from_port": "output", "to_node": "out", "to_port": "input" } ],
          "sequencer_tracks": []
        }
      }
    ]
  }
}`

header_project :: proc(t: ^testing.T) -> core.Project {
	project, err := core.build_project_from_json(transmute([]byte)string(HEADER_PROJECT_JSON))
	testing.expect(t, err == "", err)
	return project
}

STAMP :: "skald_codegen fnv1a64:00000000deadbeef"
INPUT :: "fnv1a64:0123456789abcdef"

@(test)
test_header_carries_banner_stamp_and_input_digest :: proc(t: ^testing.T) {
	project := header_project(t)
	code := core.generate_project_code(&project, "Test", "generated_audio", core.Provenance{generator = STAMP, input = INPUT})
	testing.expect(t, strings.contains(code, "AUTO-GENERATED"), "header must carry the AUTO-GENERATED banner")
	testing.expect(t, strings.contains(code, "generator: " + STAMP), "header must print the generator stamp it was handed")
	testing.expect(t, strings.contains(code, "input:     " + INPUT), "header must print the input digest it was handed")
}

@(test)
test_header_says_unstamped_rather_than_omitting_the_line :: proc(t: ^testing.T) {
	project := header_project(t)
	code := core.generate_project_code(&project, "Test", "generated_audio")
	testing.expect(t, strings.contains(code, "generator: unstamped"), "an absent stamp must be visible, not a missing line")
	testing.expect(t, strings.contains(code, "input:     unstamped"), "an absent input digest must be visible, not a missing line")
}

@(test)
test_header_states_the_thread_rule :: proc(t: ^testing.T) {
	project := header_project(t)
	code := core.generate_project_code(&project, "Test", "generated_audio")
	testing.expect(t, strings.contains(code, "THREADING:"), "header must carry the thread rule (F-B05-3)")
	testing.expect(t, strings.contains(code, "thread that"), "the rule must name the thread that calls _process")
}

@(test)
test_header_lists_each_assets_exposed_params_and_both_setter_styles :: proc(t: ^testing.T) {
	project := header_project(t)
	code := core.generate_project_code(&project, "Test", "generated_audio")
	header := code[:strings.index(code, "import \"core:math\"")]

	testing.expect(t, strings.contains(header, "_set_<field>(p, value)"), "typed setter style must be documented")
	testing.expect(t, strings.contains(header, "_set_param(p, \"<field>\", value)"), "string setter style must be documented")
	testing.expect(t, strings.contains(header, "::"), "the editor's <nodeId>::<param> alias must be documented")
	// The listing names the asset prefix a caller actually types, then each
	// field with its range, default and unit. Asset "Lead" exposes amplitude.
	testing.expect(t, strings.contains(header, "//   Lead\n"), "the asset line must use the emitted asset prefix")
	testing.expect(t, strings.contains(header, "Lead_set_amplitude"), "the listing must spell the concrete typed setter for the exposed field")
	testing.expect(t, strings.contains(header, "//   Pad: (no exposed parameters)"), "an asset with nothing exposed must say so")
	// And the header cannot advertise what the body lacks: the setter it
	// names exists.
	testing.expect(t, strings.contains(code, "Lead_set_amplitude :: proc("), "the advertised setter must be emitted in the body")
}

@(test)
test_shim_carries_the_same_banner_and_stamp :: proc(t: ^testing.T) {
	project := header_project(t)
	shim := core.generate_wasm_shim_code(&project, "generated_audio", core.Provenance{generator = STAMP, input = INPUT})
	testing.expect(t, strings.contains(shim, "AUTO-GENERATED"), "the preview shim is the second emitted shape and must carry the banner too")
	testing.expect(t, strings.contains(shim, "generator: " + STAMP), "shim must print the same generator stamp")
	testing.expect(t, strings.contains(shim, "input:     " + INPUT), "shim must print the same input digest")
}
