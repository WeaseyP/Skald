package skald_unit_tests

// =====================================================================
// Roadmap E8 (9.4 item 2) — ADSR per-stage curve tension.
//
// Same split as dc_blocker_and_nonfinite_test.odin's neighbour: the warp
// formula (skald_adsr_warp, codegen_project.odin::emit_adsr_warp_proc) is
// only ever emitted as TEXT, so its math is mirrored here verbatim (comment
// says so, CLAUDE.md's "mirror case-by-case against the source") and its
// REAL behavioural proof — that an extreme attackCurve moves a rendered
// envelope's half-attack-time level well away from 0.5 — is the adsr_curve
// acceptance fixture (tests/fixtures/adsr_curve.json, assertion in
// acceptance/main.odin), which compiles and runs the generated code.
//
// The structural half below pins the byte-identity contract that makes this
// packet safe to ship: a flat curve (unexposed, absent or authored 0) must
// emit the ORIGINAL pre-E8 line with no skald_adsr_warp call anywhere in the
// text, and skald_adsr_warp itself must not be emitted into a project that
// never needed it (same "no dead helper" discipline as B7-x3's
// skald_feedback_tail_seconds, cited on this packet's own call site).
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:math"
import "core:strings"
import "core:testing"

FLAT_ADSR_JSON :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
    { "id": "env", "type": "ADSR", "parameters": { "attack": 0.02, "decay": 0.05, "sustain": 0.6, "release": 0.2 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [
    { "from_node": "osc", "from_port": "output", "to_node": "env", "to_port": "input" },
    { "from_node": "env", "from_port": "output", "to_node": "out", "to_port": "input" } ],
  "sequencer_tracks": [] } } ] } }`

CURVED_ADSR_JSON :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
    { "id": "env", "type": "ADSR", "parameters": { "attack": 0.02, "decay": 0.05, "sustain": 0.6, "release": 0.2,
      "attackCurve": 0.8, "decayCurve": -0.5, "releaseCurve": 0.3 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [
    { "from_node": "osc", "from_port": "output", "to_node": "env", "to_port": "input" },
    { "from_node": "env", "from_port": "output", "to_node": "out", "to_port": "input" } ],
  "sequencer_tracks": [] } } ] } }`

@(test)
test_flat_adsr_emits_the_original_line_with_no_warp_call :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(transmute([]byte)string(FLAT_ADSR_JSON))
	testing.expect(t, err == "", err)

	code := core.generate_project_code(&project, "T", "generated_audio")
	testing.expect(t, !strings.contains(code, "skald_adsr_warp"), "a project with no curved ADSR node must not mention skald_adsr_warp anywhere — the whole point of adsr_curve_is_flat is that this stays dead code, unemitted, for every patch that predates E8")
	testing.expect(
		t,
		strings.contains(code, "envelope = voice.adsr_env_attack_start + (1.0 - voice.adsr_env_attack_start) * (voice.age / math.max(f32(f32(0.020000000)), 0.000001)); else do envelope = 1.0;"),
		"a flat attack stage must emit EXACTLY the pre-E8 line",
	)
	testing.expect(
		t,
		strings.contains(code, "envelope = 1.0 - (time_in_decay / math.max(f32(f32(0.050000000)), 0.000001)) * (1.0 - (f32(0.600000000))); else do envelope = (f32(0.600000000));"),
		"a flat decay stage must emit EXACTLY the pre-E8 line",
	)
	testing.expect(
		t,
		strings.contains(code, "envelope = voice.adsr_env_release_level * (1.0 - (time_in_release / math.max(f32(f32(0.200000000)), 0.000001))); else do envelope = 0.0;"),
		"a flat release stage must emit EXACTLY the pre-E8 line",
	)
}

@(test)
test_curved_adsr_emits_warp_calls_and_the_shared_proc :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(transmute([]byte)string(CURVED_ADSR_JSON))
	testing.expect(t, err == "", err)

	code := core.generate_project_code(&project, "T", "generated_audio")
	testing.expect(t, strings.contains(code, "skald_adsr_warp :: proc(t: f32, c: f32) -> f32"), "at least one non-flat curve must emit the shared warp proc")
	testing.expect(t, strings.contains(code, "skald_adsr_warp(voice.age / math.max(f32(f32(0.020000000)), 0.000001), f32(f32(0.800000000)))"), "the curved attack stage must call skald_adsr_warp with attackCurve's literal")
	testing.expect(t, strings.contains(code, "skald_adsr_warp(time_in_decay / math.max(f32(f32(0.050000000)), 0.000001), f32(f32(-0.500000000)))"), "the curved decay stage must call skald_adsr_warp with decayCurve's literal")
	testing.expect(t, strings.contains(code, "skald_adsr_warp(time_in_release / math.max(f32(f32(0.200000000)), 0.000001), f32(f32(0.300000000)))"), "the curved release stage must call skald_adsr_warp with releaseCurve's literal")
}

// Mirrors skald_adsr_warp's body (codegen_project.odin::emit_adsr_warp_proc)
// verbatim: (1-exp(-k*t))/(1-exp(-k)), k = c*6.0, c==0 => t. If that
// emitter's formula changes, this copy must change with it.
mirror_adsr_warp :: proc(t: f32, c: f32) -> f32 {
	if c == 0.0 do return t
	k := c * 6.0
	return (1.0 - math.exp(-k * t)) / (1.0 - math.exp(-k))
}

@(test)
test_adsr_warp_math_is_linear_at_zero_and_symmetric_at_the_extremes :: proc(t: ^testing.T) {
	// c == 0 is exactly linear at every t, not just close to it — the whole
	// byte-identity argument for adsr_curve_is_flat depends on this being an
	// EXACT identity, not an approximation that happens to round the same.
	for tv in ([]f32{0.0, 0.25, 0.5, 0.75, 1.0}) {
		testing.expect_value(t, mirror_adsr_warp(tv, 0.0), tv)
	}

	// Extreme curves must land the envelope well away from the linear
	// midpoint at t=0.5 — this is the acceptance fixture's own assertion,
	// pinned here in isolation so a regression in the formula fails fast
	// without needing a full render.
	half_pos := mirror_adsr_warp(0.5, 1.0)
	half_neg := mirror_adsr_warp(0.5, -1.0)
	testing.expect(t, half_pos > 0.9, "warp(0.5, +1) must sit well above the linear 0.5")
	testing.expect(t, half_neg < 0.1, "warp(0.5, -1) must sit well below the linear 0.5")

	// Endpoints always land exactly on 0 and 1 regardless of curve — a
	// curve reshapes the RAMP, it must never change where the stage starts
	// or ends.
	for c in ([]f32{-1.0, -0.4, 0.4, 1.0}) {
		testing.expect(t, abs(mirror_adsr_warp(0.0, c)) < 0.0001, "warp(0, c) must be ~0 for every curve")
		testing.expect(t, abs(mirror_adsr_warp(1.0, c) - 1.0) < 0.0001, "warp(1, c) must be ~1 for every curve")
	}
}

@(test)
test_adsr_curve_is_flat_treats_exposure_as_active_even_at_default_zero :: proc(t: ^testing.T) {
	exposed_json := `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
	  "audio_graph": { "nodes": [
	    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
	    { "id": "env", "type": "ADSR", "parameters": { "attack": 0.02, "decay": 0.05, "sustain": 0.6, "release": 0.2,
	      "exposedParameters": ["attackCurve"] } },
	    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
	  "connections": [
	    { "from_node": "osc", "from_port": "output", "to_node": "env", "to_port": "input" },
	    { "from_node": "env", "from_port": "output", "to_node": "out", "to_port": "input" } ],
	  "sequencer_tracks": [] } } ] } }`

	project, err := core.build_project_from_json(transmute([]byte)string(exposed_json))
	testing.expect(t, err == "", err)

	code := core.generate_project_code(&project, "T", "generated_audio")
	testing.expect(t, strings.contains(code, "skald_adsr_warp"), "exposing attackCurve must emit the warp-capable line even though its authored/default value is 0 — a live edit can move it away from 0 at runtime")
	testing.expect(t, strings.contains(code, "p.attackCurve"), "the exposed field must be what the warp call reads, not a baked literal")
}
