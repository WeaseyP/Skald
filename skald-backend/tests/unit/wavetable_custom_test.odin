#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap G4 (9.20) — wavetable import: an imported single-cycle table
// compiles into a static Odin float array, sampled with linear
// interpolation instead of the four-shape analytic morph.
//
// skald_wavetable_sample_custom and its backing arrays are only ever
// emitted as TEXT by codegen_project.odin — the same situation
// dc_blocker_and_nonfinite_test.odin's header describes for
// skald_dc_block/skald_soft_limit. Three kinds of test here:
//
//   test_custom_table_emitted_only_when_selected  structural: an untouched
//     Wavetable's emitted text is unchanged (gate-on-non-default, the same
//     contract every any_X block in generate_project_code shares), and a
//     node that DOES select an imported table gets the helper proc, its own
//     array under the digest-derived name, and a call site that names it.
//
//   test_custom_wavetable_sample_math_interpolates_and_wraps mirrors
//     emit_custom_wavetable_sample_proc's body verbatim (CLAUDE.md's "mirror
//     case-by-case against the source") because the emitted proc cannot be
//     compiled and called from this package.
//
//   decode_custom_wavetable / custom_wavetable_digest / custom_wavetable_ident
//     and param_is_reachable ARE real skald_core procs, not emitted text, so
//     they are exercised directly.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/base64"
import "core:encoding/json"
import "core:fmt"
import "core:math"
import "core:strings"
import "core:testing"

// Little-endian float32 x N -> base64 — exactly the byte layout
// skald-ui/src/audio/wavReader.ts::tableToBase64 produces on the editor
// side, transcribed here (not shared code — see param_utils.odin's own
// decode_custom_wavetable comment on why there are two implementations of
// this shape) so tests can build a well-formed blob without an 11KB string
// literal in the source.
encode_table_for_test :: proc(table: [core.CUSTOM_WAVETABLE_SAMPLES]f32) -> string {
	bytes := make([]byte, core.CUSTOM_WAVETABLE_SAMPLES * 4)
	defer delete(bytes)
	for v, i in table {
		bits := transmute(u32)v
		o := i * 4
		bytes[o] = byte(bits & 0xff)
		bytes[o + 1] = byte((bits >> 8) & 0xff)
		bytes[o + 2] = byte((bits >> 16) & 0xff)
		bytes[o + 3] = byte((bits >> 24) & 0xff)
	}
	encoded, _ := base64.encode(bytes)
	return encoded
}

ramp_table_for_test :: proc() -> [core.CUSTOM_WAVETABLE_SAMPLES]f32 {
	table: [core.CUSTOM_WAVETABLE_SAMPLES]f32
	for i in 0 ..< core.CUSTOM_WAVETABLE_SAMPLES {
		table[i] = f32(i) / f32(core.CUSTOM_WAVETABLE_SAMPLES)
	}
	return table
}

// Split around the interpolated string so fmt.tprintf's %s substitutes the
// base64 as an opaque argument — Odin's fmt requires literal braces in a
// FORMAT STRING to be doubled (`{{`/`}}`), and this JSON is full of them.
JSON_PREFIX_NO_CUSTOM :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "wt", "type": "Wavetable", "parameters": { "position": 0 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [ { "from_node": "wt", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`

JSON_PREFIX_CUSTOM :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "wt", "type": "Wavetable", "parameters": { "useCustomTable": true, "customTable": "`

JSON_SUFFIX_CUSTOM :: `" } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [ { "from_node": "wt", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`

@(test)
test_custom_table_emitted_only_when_selected :: proc(t: ^testing.T) {
	table := ramp_table_for_test()
	b64 := encode_table_for_test(table)
	ident := core.custom_wavetable_ident(b64)

	{
		project, err := core.build_project_from_json(transmute([]byte)string(JSON_PREFIX_NO_CUSTOM))
		testing.expect(t, err == "", err)
		code := core.generate_project_code(&project, "T", "generated_audio")
		testing.expect(t, !strings.contains(code, "skald_wavetable_sample_custom"), "an untouched Wavetable (no useCustomTable) must not emit the custom-table helper at all")
		testing.expect(t, !strings.contains(code, ident), "no array should exist when nothing selected it")
		testing.expect(t, strings.contains(code, "unison_out += skald_wavetable_sample("), "the analytic path must still call skald_wavetable_sample when useCustomTable is absent")
	}

	custom_json := fmt.tprintf("%s%s%s", JSON_PREFIX_CUSTOM, b64, JSON_SUFFIX_CUSTOM)
	{
		project, err := core.build_project_from_json(transmute([]byte)custom_json)
		testing.expect(t, err == "", err)
		code := core.generate_project_code(&project, "T", "generated_audio")
		testing.expect(t, strings.contains(code, "skald_wavetable_sample_custom :: proc"), "a Wavetable that selected a decodable table must emit the helper proc")
		testing.expect(t, strings.contains(code, fmt.tprintf("%s : [%d]f32 = {{", ident, core.CUSTOM_WAVETABLE_SAMPLES)), "the array must be declared under the digest-derived identifier both call sites compute the same way")
		testing.expect(t, strings.contains(code, fmt.tprintf("skald_wavetable_sample_custom(%s[:], f32(", ident)), "the node's sample call must name that same array")
		testing.expect(t, !strings.contains(code, "unison_out += skald_wavetable_sample("), "the custom-table path must not ALSO call the analytic sampler for the same node")
	}
}

@(test)
test_custom_table_dedupes_by_digest_across_two_nodes :: proc(t: ^testing.T) {
	table := ramp_table_for_test()
	b64 := encode_table_for_test(table)
	ident := core.custom_wavetable_ident(b64)

	prefix := `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "wt1", "type": "Wavetable", "parameters": { "useCustomTable": true, "customTable": "`
	middle := `" } },
    { "id": "wt2", "type": "Wavetable", "parameters": { "useCustomTable": true, "customTable": "`
	suffix := `" } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [ { "from_node": "wt1", "from_port": "output", "to_node": "out", "to_port": "input" }, { "from_node": "wt2", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`
	two_node_json := fmt.tprintf("%s%s%s%s%s", prefix, b64, middle, b64, suffix)

	project, err := core.build_project_from_json(transmute([]byte)two_node_json)
	testing.expect(t, err == "", err)
	code := core.generate_project_code(&project, "T", "generated_audio")
	array_decl := fmt.tprintf("%s : [%d]f32 = {{", ident, core.CUSTOM_WAVETABLE_SAMPLES)
	first := strings.index(code, array_decl)
	testing.expect(t, first >= 0, "the array must be declared at least once")
	second := strings.index(code[first + 1:], array_decl)
	testing.expect(t, second < 0, "two Wavetable nodes importing the SAME table must share one array declaration, not emit it twice")
}

// Mirrors skald_wavetable_sample_custom's body (codegen_project.odin::
// emit_custom_wavetable_sample_proc) verbatim: if either changes, so must
// this copy.
mirror_wavetable_sample_custom :: proc(table: []f32, ph: f32) -> f32 {
	p := ph - math.floor(ph)
	pos := p * f32(len(table))
	i1 := int(pos) % len(table)
	i2 := (i1 + 1) % len(table)
	frac := pos - f32(i1)
	return table[i1] + (table[i2] - table[i1]) * frac
}

@(test)
test_custom_wavetable_sample_math_interpolates_and_wraps :: proc(t: ^testing.T) {
	table := []f32{0.0, 1.0, 2.0, 3.0}

	r0 := mirror_wavetable_sample_custom(table, 0.0)
	testing.expect(t, abs(r0 - 0.0) < 0.0001, "phase 0 must read the first sample exactly")

	r_half := mirror_wavetable_sample_custom(table, 0.125) // pos = 0.5 -> halfway between table[0] and table[1]
	testing.expect(t, abs(r_half - 0.5) < 0.0001, "phase 0.125 over a 4-sample table (pos=0.5) must interpolate halfway between samples 0 and 1")

	r_wrap := mirror_wavetable_sample_custom(table, 0.99) // pos = 3.96 -> blends table[3] toward table[0]
	expected_wrap := f32(3.0) + (f32(0.0) - f32(3.0)) * 0.96
	testing.expect(t, abs(r_wrap - expected_wrap) < 0.001, "the last sample must interpolate toward the FIRST sample, not clamp or read out of bounds — this is one period, not a finite clip")

	r_over_one := mirror_wavetable_sample_custom(table, 1.25) // wraps to 0.25 -> pos = 1.0
	testing.expect(t, abs(r_over_one - 1.0) < 0.0001, "a phase beyond 1.0 must wrap (voice.wavetable_*_phase is already kept in 0..1, but sample_phase's own +phase/360 offset is not, so the sampler must not assume its input is pre-wrapped)")
}

@(test)
test_decode_custom_wavetable_roundtrips_known_bytes :: proc(t: ^testing.T) {
	table: [core.CUSTOM_WAVETABLE_SAMPLES]f32
	for i in 0 ..< core.CUSTOM_WAVETABLE_SAMPLES {
		table[i] = f32(i) - 1000.0 // distinguishable, includes negatives, non-repeating
	}
	b64 := encode_table_for_test(table)
	decoded, ok := core.decode_custom_wavetable(b64)
	testing.expect(t, ok, "a well-formed base64 blob of exactly CUSTOM_WAVETABLE_SAMPLES floats must decode")
	mismatch_at := -1
	for i in 0 ..< core.CUSTOM_WAVETABLE_SAMPLES {
		if decoded[i] != table[i] {
			mismatch_at = i
			break
		}
	}
	testing.expect(t, mismatch_at == -1, fmt.tprintf("decoded[%d] does not round-trip the encoded value — little-endian byte order or count is wrong", mismatch_at))
}

@(test)
test_decode_custom_wavetable_fails_closed_on_wrong_length :: proc(t: ^testing.T) {
	short, _ := base64.encode([]byte{1, 2, 3, 4})
	_, ok := core.decode_custom_wavetable(short)
	testing.expect(t, !ok, "a blob that is not exactly CUSTOM_WAVETABLE_SAMPLES*4 bytes must fail closed (a corrupt or hand-edited save falls back to the analytic shapes), not read past the end or zero-pad")

	_, ok2 := core.decode_custom_wavetable("not valid base64 !!! ###")
	testing.expect(t, !ok2, "undecodable base64 must also fail closed")
}

@(test)
test_custom_wavetable_digest_is_deterministic_and_distinct :: proc(t: ^testing.T) {
	table_a := ramp_table_for_test()
	table_b: [core.CUSTOM_WAVETABLE_SAMPLES]f32
	for i in 0 ..< core.CUSTOM_WAVETABLE_SAMPLES {
		table_b[i] = f32(i) * 2.0
	}
	b64_a := encode_table_for_test(table_a)
	b64_b := encode_table_for_test(table_b)

	testing.expect_value(t, core.custom_wavetable_digest(b64_a), core.custom_wavetable_digest(b64_a))
	testing.expect(t, core.custom_wavetable_digest(b64_a) != core.custom_wavetable_digest(b64_b), "two distinct tables must not collide")
	testing.expect_value(t, core.custom_wavetable_ident(b64_a), core.custom_wavetable_ident(b64_a))
}

@(test)
test_param_is_reachable_position_and_pulsewidth_dead_under_custom_table :: proc(t: ^testing.T) {
	table := ramp_table_for_test()
	b64 := encode_table_for_test(table)

	node := core.Node{
		id = "wt", type = "Wavetable",
		parameters = json.Object{"useCustomTable" = json.Boolean(true), "customTable" = json.String(b64)},
	}

	testing.expect(t, !core.param_is_reachable(node, "position"), "an imported table replaces the four-shape morph — position must be dead")
	testing.expect(t, !core.param_is_reachable(node, "pulseWidth"), "an imported table has no duty cycle — pulseWidth must be dead")
	testing.expect(t, core.param_is_reachable(node, "amplitude"), "amplitude is applied identically on both paths and must stay live")

	analytic_node := core.Node{id = "wt2", type = "Wavetable", parameters = json.Object{}}
	testing.expect(t, core.param_is_reachable(analytic_node, "position"), "position must stay live on an ordinary (non-custom-table) Wavetable")
	testing.expect(t, core.param_is_reachable(analytic_node, "pulseWidth"), "pulseWidth must stay live on an ordinary Wavetable")
}
