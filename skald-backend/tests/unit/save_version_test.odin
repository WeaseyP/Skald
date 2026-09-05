package skald_unit_tests

// =====================================================================
// Roadmap packet C1 — the backend half of the save-file schema version.
//
// The editor stamps `version` on every save and migrates older files
// forward; build_project_from_json mirrors SAVE_FORMAT_VERSION and refuses
// a NEWER version with a message instead of half-reading a shape it does
// not know. Absent (pre-C1) and current are both accepted unchanged.
// =====================================================================

import core "../../core"
import "core:strings"
import "core:testing"

graph_with_version :: proc(version_field: string) -> string {
	return strings.concatenate({
		`{ `, version_field, ` "nodes": [
		  { "id": "osc", "type": "oscillator", "data": { "label": "Osc", "waveform": "Sine", "amplitude": 0.4 } },
		  { "id": "out", "type": "output", "data": { "label": "Out" } } ],
		  "edges": [ { "source": "osc", "sourceHandle": "output", "target": "out", "targetHandle": "input" } ],
		  "session": { "bpm": 120, "patternSteps": 16, "masterVolume": 0.8 } }`,
	})
}

@(test)
test_save_version_absent_and_current_are_accepted :: proc(t: ^testing.T) {
	_, err_absent := core.build_project_from_json(transmute([]byte)graph_with_version(""))
	testing.expect(t, err_absent == "", err_absent)
	_, err_current := core.build_project_from_json(transmute([]byte)graph_with_version(`"version": 1,`))
	testing.expect(t, err_current == "", err_current)
	testing.expect_value(t, core.SAVE_FORMAT_VERSION, 2)
}

@(test)
test_save_version_newer_is_refused_with_a_message :: proc(t: ^testing.T) {
	_, err := core.build_project_from_json(transmute([]byte)graph_with_version(`"version": 99,`))
	testing.expect(t, err != "", "a file from a newer editor must be refused, not half-read")
	testing.expect(t, strings.contains(err, "newer Skald"), err)
	testing.expect(t, strings.contains(err, "99"), "the message must name the version it saw")
}
