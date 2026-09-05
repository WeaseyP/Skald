package skald_unit_tests

// =====================================================================
// Roadmap E5 — DC blocker + un-bypassable limiter + overflow warnings.
//
// The DSP itself (skald_dc_block, skald_soft_limit's NaN/Inf guard) is only
// ever emitted as TEXT by codegen_project.odin — there is no compiled copy
// in the skald_core package to call directly, the way there is for the
// analysis procs the rest of tests/unit exercises. Two kinds of test here:
//
//   test_dc_blocker_and_nonfinite_guard_emitted_for_every_asset  structural:
//     asserts generate_project_code/generate_wasm_shim_code actually emit
//     the shapes E5 depends on. The REAL behavioural proof — that a
//     DC-heavy patch's rendered audio comes out near-zero-mean — is the
//     dc_offset_pulse acceptance fixture (tests/fixtures/dc_offset_pulse.json,
//     assertion in acceptance/main.odin), which runs the actual compiled
//     generated code through real audio, not a text scan.
//
//   test_dc_block_math_pulls_a_dc_step_to_near_zero and
//   test_soft_limit_math_flushes_nonfinite_and_counts  exercise the exact
//     formulas emit_dc_block_proc / emit_soft_limit_proc print (both in
//     codegen_project.odin), copied here verbatim with a comment saying so
//     (CLAUDE.md's "mirror case-by-case against the source") because the
//     emitted code cannot be compiled and called from a test in this
//     package. Keep these two procs' bodies byte-identical to what the
//     emitters print if either one changes.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:math"
import "core:strings"
import "core:testing"

ONE_ASSET_JSON :: `{ "project": { "bpm": 120, "instruments": [ { "id": "a", "name": "Asset", "voice_count": 1, "unison": 1,
  "audio_graph": { "nodes": [
    { "id": "osc", "type": "Oscillator", "parameters": { "frequency": 440, "waveform": "Sine", "amplitude": 0.4 } },
    { "id": "out", "type": "GraphOutput", "parameters": {} } ],
  "connections": [ { "from_node": "osc", "from_port": "output", "to_node": "out", "to_port": "input" } ], "sequencer_tracks": [] } } ] } }`

@(test)
test_dc_blocker_and_nonfinite_guard_emitted_for_every_asset :: proc(t: ^testing.T) {
	project, err := core.build_project_from_json(transmute([]byte)string(ONE_ASSET_JSON))
	testing.expect(t, err == "", err)

	code := core.generate_project_code(&project, "T", "generated_audio")
	testing.expect(t, strings.contains(code, "Skald_Dc_Block_State :: struct"), "the DC-blocker filter memory type must be emitted")
	testing.expect(t, strings.contains(code, "skald_dc_block :: proc"), "the DC-blocker proc must be emitted")
	testing.expect(t, strings.contains(code, "nonfinite_count: i32,"), "every asset's _Processor struct carries its own attributable count")
	testing.expect(t, strings.contains(code, "p.nonfinite_count = 0"), "an asset's own _init must reset the count (SKB-018 double-init contract)")
	testing.expect(t, !strings.contains(code, "dc: Skald_Dc_Block_State,\n\tnonfinite_count"), "the DC blocker must NOT live on the per-asset _Processor — it rings on note onset, which would break the panner_center_unity/panner_mono_sum exact-gain fixtures")
	testing.expect(t, strings.contains(code, "\tdc: Skald_Dc_Block_State,\n}"), "Project_State (the master bus) carries the DC-blocker memory instead")
	testing.expect(t, strings.contains(code, "p.dc = {}"), "project_init must reset the master bus's filter memory")
	testing.expect(t, strings.contains(code, "mixed_left, mixed_right = skald_dc_block(&p.dc, mixed_left, mixed_right)"), "project_process must run the summed mix through the blocker, after volume and before the limiter")
	testing.expect(t, strings.contains(code, "skald_master_flush_count"), "the master-bus backstop counter must be emitted")

	shim := core.generate_wasm_shim_code(&project, "generated_audio")
	testing.expect(t, strings.contains(shim, "wasm_dc: Skald_Dc_Block_State"), "the wasm shim's master bus carries its own DC-blocker memory")
	testing.expect(t, strings.contains(shim, "wasm_dc = {}"), "skald_init must reset it")
	testing.expect(t, strings.contains(shim, "dcb_left, dcb_right := skald_dc_block(&wasm_dc, vol_left, vol_right)"), "skald_process must run the summed mix through the blocker too")
	testing.expect(t, strings.contains(shim, "skald_get_nonfinite_count :: proc \"c\""), "the editor needs a total-count export for the transport warning")
	testing.expect(t, strings.contains(shim, "skald_get_asset_nonfinite_count :: proc \"c\""), "the editor needs a per-asset export for the canvas warning")
	testing.expect(t, strings.contains(shim, "wasm_Asset.nonfinite_count"), "the per-asset getter must read that asset's own counter")
}

// Mirrors skald_dc_block's body (codegen_project.odin::emit_dc_block_proc)
// verbatim: y = x - x1 + R*y1, R = 0.995. If that emitter's formula changes,
// this copy must change with it.
mirror_dc_block :: proc(x1_l, y1_l, x1_r, y1_r: ^f32, l, r: f32) -> (f32, f32) {
	yl := l - x1_l^ + 0.995 * y1_l^
	yr := r - x1_r^ + 0.995 * y1_r^
	x1_l^, y1_l^ = l, yl
	x1_r^, y1_r^ = r, yr
	return yl, yr
}

@(test)
test_dc_block_math_pulls_a_dc_step_to_near_zero :: proc(t: ^testing.T) {
	x1_l, y1_l, x1_r, y1_r: f32
	// A pure +0.8 DC step, held for a full second at 48kHz — no AC content
	// at all, the worst case for a DC blocker (a real patch's own AC energy
	// only helps the average settle faster).
	yl, yr: f32
	for i in 0 ..< 48000 {
		yl, yr = mirror_dc_block(&x1_l, &y1_l, &x1_r, &y1_r, 0.8, 0.8)
	}
	testing.expect(t, abs(yl) < 0.001, "a full second at R=0.995 must settle a DC step under 0.001 residual")
	testing.expect(t, abs(yr) < 0.001, "right channel must settle identically (same math, same input)")
}

// Mirrors skald_soft_limit's guard (codegen_project.odin::emit_soft_limit_proc)
// verbatim: flush non-finite input to silence and count it, THEN tanh.
mirror_soft_limit :: proc(flush_count: ^i32, l, r: f32) -> (f32, f32) {
	lf, rf := l, r
	if math.is_nan(lf) || math.is_inf(lf) || math.is_nan(rf) || math.is_inf(rf) {
		lf, rf = 0.0, 0.0
		flush_count^ += 1
	}
	return math.tanh(lf), math.tanh(rf)
}

@(test)
test_soft_limit_math_flushes_nonfinite_and_counts :: proc(t: ^testing.T) {
	count: i32 = 0
	nan_val := math.nan_f32()
	inf_val := math.inf_f32(1)

	// A NaN in ONE channel flushes BOTH: a broken stereo pair is treated as
	// one bad sample, not repaired channel-by-channel.
	l, r := mirror_soft_limit(&count, nan_val, 0.2)
	testing.expect_value(t, l, f32(0.0))
	testing.expect_value(t, r, f32(0.0))
	testing.expect_value(t, count, i32(1))

	l2, r2 := mirror_soft_limit(&count, 0.1, 0.1)
	testing.expect(t, l2 != 0.0 && r2 != 0.0, "an ordinary finite pair must pass through tanh unflushed")
	testing.expect_value(t, count, i32(1))

	l3, r3 := mirror_soft_limit(&count, inf_val, inf_val)
	testing.expect_value(t, l3, f32(0.0))
	testing.expect_value(t, r3, f32(0.0))
	testing.expect_value(t, count, i32(2))
}
