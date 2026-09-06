#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet B2 / BUGS.md SKB-006 — reachability-aware exposure.
//
// Two procs are under test:
//
//   core.param_is_reachable(node, param) -> bool
//       Whether the node's generated DSP, under its CURRENT bpmSync/
//       fixedPitch configuration, actually reads `param` as a runtime
//       `p.<field>` reference. LFO `frequency`, SampleHold `rate` and Delay
//       `delayTime` are baked over by bpm_sync_seconds_expr's seconds
//       expression the instant bpmSync is on; Oscillator/Wavetable
//       `frequency` is read only when fixedPitch is explicitly on. Every
//       other (node type, param) pair must stay reachable regardless of
//       either flag — the risk in this fix is over-pruning a param that IS
//       read, which is a worse bug than the one it closes.
//
//   core.effective_exposed_params(node, plock_targets) -> [dynamic]string
//       The exposure pass itself. Must drop a dead param sourced from the
//       UI's exposedParameters array, AND must not let a P-lock resurrect
//       one — a P-lock unioning into the same list is exactly how BUGS.md's
//       reproduction happens ("a user can mint dead public API from the
//       step editor without ever clicking expose").
//
// The P-lock HARD ERROR half of SKB-006 (collect_plock_targets exiting on a
// P-lock that resolves to an unreachable param) calls os.exit(1) directly
// and so cannot run inside `odin test` without killing the test binary —
// same as every other hard-error path in codegen.odin (the feedback-cycle
// check, the unresolvable-P-lock check), none of which have an in-process
// test either. That call site was instead verified end-to-end by building
// codegen.exe and running it against a crafted fixture; see the packet's
// report for the exact stderr.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:strings"
import "core:testing"

// --- helpers ---------------------------------------------------------

// Same shape as param_ranges_test.odin's node_with, but also takes an id so
// the P-lock union tests below can address a specific node (effective_exposed_params
// filters plock_targets by exact node_id match).
node_with_id :: proc(id: string, node_type: string, params: json.Object) -> core.Node {
	return core.Node{id = id, raw_id = id, type = node_type, parameters = params}
}

contains_string :: proc(haystack: []string, needle: string) -> bool {
	for s in haystack {
		if s == needle do return true
	}
	return false
}

// =====================================================================
// param_is_reachable — LFO frequency
// =====================================================================

@(test)
test_lfo_frequency_dead_when_synced :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	n := node_with("LFO", params)
	testing.expect(
		t,
		!core.param_is_reachable(n, "frequency"),
		"a synced LFO's `frequency` is overwritten by bpm_sync_seconds_expr before emission and must read as unreachable",
	)
}

@(test)
test_lfo_frequency_live_when_not_synced :: proc(t: ^testing.T) {
	// Explicit false and the absent-key default must agree — bpmSync's own
	// default (get_bool_param(..., false)) is what a brand-new LFO node ships.
	explicit_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(explicit_params)
	explicit := node_with("LFO", explicit_params)
	testing.expect(t, core.param_is_reachable(explicit, "frequency"), "bpmSync=false must leave `frequency` live")

	absent := node_with("LFO", json.Object{})
	testing.expect(t, core.param_is_reachable(absent, "frequency"), "an absent bpmSync (new-node default) must leave `frequency` live")
}

@(test)
test_lfo_amplitude_always_reachable :: proc(t: ^testing.T) {
	// Over-pruning guard: bpmSync only ever gates `frequency` on an LFO.
	// `amplitude` must stay reachable whichever way bpmSync goes.
	synced_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(synced_params)
	synced := node_with("LFO", synced_params)
	testing.expect(t, core.param_is_reachable(synced, "amplitude"), "LFO amplitude must be reachable even while synced")

	unsynced_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(unsynced_params)
	unsynced := node_with("LFO", unsynced_params)
	testing.expect(t, core.param_is_reachable(unsynced, "amplitude"), "LFO amplitude must be reachable while unsynced")
}

// =====================================================================
// param_is_reachable — SampleHold rate (BUGS.md: "exposed by default")
// =====================================================================

@(test)
test_samplehold_rate_dead_when_synced :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	n := node_with("SampleHold", params)
	testing.expect(t, !core.param_is_reachable(n, "rate"), "a synced Sample & Hold's `rate` must read as unreachable")
}

@(test)
test_samplehold_rate_live_when_not_synced :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(params)
	n := node_with("SampleHold", params)
	testing.expect(t, core.param_is_reachable(n, "rate"), "an unsynced Sample & Hold's `rate` must stay live")

	absent := node_with("SampleHold", json.Object{})
	testing.expect(t, core.param_is_reachable(absent, "rate"), "the default (bpmSync absent) Sample & Hold ships with `rate` exposed and must stay live")
}

@(test)
test_samplehold_amplitude_always_reachable :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	synced := node_with("SampleHold", params)
	testing.expect(t, core.param_is_reachable(synced, "amplitude"), "Sample & Hold amplitude must be reachable even while synced")
}

// =====================================================================
// param_is_reachable — Delay delayTime
// =====================================================================

@(test)
test_delay_delaytime_dead_when_synced :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	n := node_with("Delay", params)
	testing.expect(t, !core.param_is_reachable(n, "delayTime"), "a synced Delay's `delayTime` is replaced outright by the seconds expression and must read as unreachable")
}

@(test)
test_delay_delaytime_live_when_not_synced :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(params)
	n := node_with("Delay", params)
	testing.expect(t, core.param_is_reachable(n, "delayTime"), "an unsynced Delay's `delayTime` must stay live")
}

@(test)
test_delay_feedback_and_mix_always_reachable :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	synced := node_with("Delay", params)
	testing.expect(t, core.param_is_reachable(synced, "feedback"), "Delay feedback must be reachable even while synced")
	testing.expect(t, core.param_is_reachable(synced, "mix"), "Delay mix must be reachable even while synced")
}

// =====================================================================
// param_is_reachable — Oscillator / Wavetable frequency
// =====================================================================

@(test)
test_oscillator_frequency_dead_by_default :: proc(t: ^testing.T) {
	// fixedPitch absent is the shape every new Oscillator ships in
	// (node-definitions.ts's defaultOscillatorParams has no fixedPitch key at
	// all) — note-wins is the documented default, so `frequency` is never
	// referenced by generate_oscillator_code unless fixedPitch is turned on.
	absent := node_with("Oscillator", json.Object{})
	testing.expect(t, !core.param_is_reachable(absent, "frequency"), "an Oscillator with no fixedPitch key must read `frequency` as unreachable (note-wins default)")

	false_params := json.Object{"fixedPitch" = json.Boolean(false)}
	defer delete(false_params)
	explicit_false := node_with("Oscillator", false_params)
	testing.expect(t, !core.param_is_reachable(explicit_false, "frequency"), "fixedPitch=false must leave `frequency` unreachable")
}

@(test)
test_oscillator_frequency_live_with_fixed_pitch :: proc(t: ^testing.T) {
	params := json.Object{"fixedPitch" = json.Boolean(true)}
	defer delete(params)
	n := node_with("Oscillator", params)
	testing.expect(t, core.param_is_reachable(n, "frequency"), "fixedPitch=true must make `frequency` live — generate_oscillator_code reads it in exactly this branch")
}

@(test)
test_oscillator_other_params_always_reachable :: proc(t: ^testing.T) {
	note_wins := node_with("Oscillator", json.Object{})
	testing.expect(t, core.param_is_reachable(note_wins, "amplitude"), "Oscillator amplitude must be reachable regardless of fixedPitch")
	testing.expect(t, core.param_is_reachable(note_wins, "phase"), "Oscillator phase must be reachable regardless of fixedPitch")
	// pulseWidth is governed by `waveform`, not fixedPitch (packet B2 —
	// exposure_scan_test.odin has the full rule). This test used to assert it
	// reachable on a node with NO waveform, i.e. the generator's Sine default,
	// whose emitted body never reads p.pulseWidth: the assertion was against a
	// state the generator never agreed with. Pinned on a Square node instead.
	square_params := json.Object{"waveform" = json.String("Square")}
	defer delete(square_params)
	square := node_with("Oscillator", square_params)
	testing.expect(t, core.param_is_reachable(square, "pulseWidth"), "Square oscillator pulseWidth must be reachable regardless of fixedPitch")
}

@(test)
test_wavetable_frequency_dead_by_default_live_with_fixed_pitch :: proc(t: ^testing.T) {
	absent := node_with("Wavetable", json.Object{})
	testing.expect(t, !core.param_is_reachable(absent, "frequency"), "a Wavetable with no fixedPitch key must read `frequency` as unreachable")

	fixed_params := json.Object{"fixedPitch" = json.Boolean(true)}
	defer delete(fixed_params)
	fixed := node_with("Wavetable", fixed_params)
	testing.expect(t, core.param_is_reachable(fixed, "frequency"), "fixedPitch=true must make a Wavetable's `frequency` live")

	testing.expect(t, core.param_is_reachable(absent, "position"), "Wavetable position must be reachable regardless of fixedPitch")
	testing.expect(t, core.param_is_reachable(absent, "amplitude"), "Wavetable amplitude must be reachable regardless of fixedPitch")
}

// =====================================================================
// param_is_reachable — unrelated node types must be entirely unaffected
// =====================================================================

@(test)
test_unrelated_node_types_always_reachable :: proc(t: ^testing.T) {
	// FmOperator's "frequency" is a carrier:modulator RATIO, not gated by
	// fixedPitch at all (FmOperator has no fixedPitch concept) — must not be
	// mistaken for the Oscillator/Wavetable case above.
	fm := node_with("FmOperator", json.Object{})
	testing.expect(t, core.param_is_reachable(fm, "frequency"), "FmOperator frequency (ratio) is unconditionally reachable")

	// ADSR/Filter never appear in param_is_reachable's switch at all — the
	// default `return true` must cover them.
	adsr := node_with("ADSR", json.Object{})
	testing.expect(t, core.param_is_reachable(adsr, "attack"), "a node type param_is_reachable does not special-case must default to reachable")

	filt_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(filt_params)
	filt := node_with("Filter", filt_params)
	testing.expect(t, core.param_is_reachable(filt, "cutoff"), "an unrelated node type must ignore a stray bpmSync key entirely")
}

// =====================================================================
// effective_exposed_params — the exposure pass itself
// =====================================================================

@(test)
test_effective_exposed_params_drops_dead_checkbox_exposure :: proc(t: ^testing.T) {
	exposed := json.Array{json.String("frequency"), json.String("amplitude")}
	defer delete(exposed)
	params := json.Object{"bpmSync" = json.Boolean(true), "exposedParameters" = exposed}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	names := core.effective_exposed_params(n, nil)
	defer delete(names)
	testing.expectf(t, !contains_string(names[:], "frequency"), "a synced LFO must not expose `frequency`: got %v", names[:])
	testing.expectf(t, contains_string(names[:], "amplitude"), "a synced LFO must still expose `amplitude`: got %v", names[:])
	testing.expect_value(t, len(names), 1)
}

@(test)
test_effective_exposed_params_keeps_live_checkbox_exposure :: proc(t: ^testing.T) {
	exposed := json.Array{json.String("frequency"), json.String("amplitude")}
	defer delete(exposed)
	params := json.Object{"bpmSync" = json.Boolean(false), "exposedParameters" = exposed}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	names := core.effective_exposed_params(n, nil)
	defer delete(names)
	testing.expectf(t, contains_string(names[:], "frequency"), "an unsynced LFO must still expose `frequency`: got %v", names[:])
	testing.expectf(t, contains_string(names[:], "amplitude"), "an unsynced LFO must still expose `amplitude`: got %v", names[:])
	testing.expect_value(t, len(names), 2)
}

@(test)
test_effective_exposed_params_plock_cannot_resurrect_dead_param :: proc(t: ^testing.T) {
	// The checkbox exposure is empty — the ONLY route to exposure here is
	// the P-lock union, which is exactly the backdoor BUGS.md describes
	// ("a user can mint dead public API from the step editor without ever
	// clicking expose").
	params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	plocks := []core.Plock_Target{{node_id = "n1", param = "frequency"}}
	names := core.effective_exposed_params(n, plocks)
	defer delete(names)
	testing.expectf(t, len(names) == 0, "a P-lock on a synced LFO's `frequency` must not resurrect it: got %v", names[:])
}

@(test)
test_effective_exposed_params_plock_keeps_live_param :: proc(t: ^testing.T) {
	params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	plocks := []core.Plock_Target{{node_id = "n1", param = "frequency"}}
	names := core.effective_exposed_params(n, plocks)
	defer delete(names)
	testing.expectf(t, contains_string(names[:], "frequency"), "a P-lock on an unsynced LFO's `frequency` (a live param) must still expose it: got %v", names[:])
	testing.expect_value(t, len(names), 1)
}

@(test)
test_effective_exposed_params_oscillator_fixed_pitch_dead_and_live :: proc(t: ^testing.T) {
	// The default-shipped Oscillator (node-definitions.ts) exposes `frequency`
	// out of the box with no fixedPitch key — this is the "dead by default"
	// instance, exercised here through the full exposure pass rather than
	// param_is_reachable directly.
	dead_exposed := json.Array{json.String("frequency"), json.String("amplitude")}
	defer delete(dead_exposed)
	dead_params := json.Object{"exposedParameters" = dead_exposed}
	defer delete(dead_params)
	dead := node_with_id("n1", "Oscillator", dead_params)
	dead_names := core.effective_exposed_params(dead, nil)
	defer delete(dead_names)
	testing.expectf(t, !contains_string(dead_names[:], "frequency"), "an Oscillator with no fixedPitch must not expose `frequency`: got %v", dead_names[:])
	testing.expectf(t, contains_string(dead_names[:], "amplitude"), "an Oscillator with no fixedPitch must still expose `amplitude`: got %v", dead_names[:])

	live_exposed := json.Array{json.String("frequency"), json.String("amplitude")}
	defer delete(live_exposed)
	live_params := json.Object{"fixedPitch" = json.Boolean(true), "exposedParameters" = live_exposed}
	defer delete(live_params)
	live := node_with_id("n1", "Oscillator", live_params)
	live_names := core.effective_exposed_params(live, nil)
	defer delete(live_names)
	testing.expectf(t, contains_string(live_names[:], "frequency"), "an Oscillator with fixedPitch=true must expose `frequency`: got %v", live_names[:])
	testing.expectf(t, contains_string(live_names[:], "amplitude"), "an Oscillator with fixedPitch=true must still expose `amplitude`: got %v", live_names[:])
}

// =====================================================================
// param_dead_reason — sanity on the shared diagnostic text (used verbatim
// by both the P-lock hard error and warn_dead_exposed_params)
// =====================================================================

@(test)
test_param_dead_reason_matches_the_gating_flag :: proc(t: ^testing.T) {
	lfo_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(lfo_params)
	lfo := node_with("LFO", lfo_params)
	testing.expect(t, core.param_dead_reason(lfo, "frequency") != "", "LFO must have a non-empty dead reason")

	osc := node_with("Oscillator", json.Object{})
	reason := core.param_dead_reason(osc, "frequency")
	testing.expectf(t, reason != core.param_dead_reason(lfo, "frequency"), "Oscillator's reason (fixedPitch) must read differently from LFO's (bpmSync): got %q for both", reason)
}

// =====================================================================
// SKB-007 — `syncRate` is unreachable UNCONDITIONALLY (not gated by
// bpmSync), because bpm_sync_seconds_expr reads it via get_string_param
// straight off node.parameters at codegen time — no generator anywhere
// reads a `p.syncRate` struct field. This is a THIRD case distinct from the
// bpmSync-gated `frequency`/`rate`/`delayTime` on the very same node types:
// those are dead only while synced; `syncRate` is dead whether synced or
// not. param_dead_reason must therefore give `syncRate` a reason that does
// not claim bpmSync is the cause (it isn't — flipping bpmSync off does
// nothing for `syncRate`).
// =====================================================================

@(test)
test_syncrate_dead_regardless_of_bpm_sync :: proc(t: ^testing.T) {
	synced_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(synced_params)
	synced := node_with("LFO", synced_params)
	testing.expect(t, !core.param_is_reachable(synced, "syncRate"), "LFO syncRate must be unreachable while bpmSync is on")

	unsynced_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(unsynced_params)
	unsynced := node_with("LFO", unsynced_params)
	testing.expect(t, !core.param_is_reachable(unsynced, "syncRate"), "LFO syncRate must be unreachable even while bpmSync is off — it is never read as a struct field either way")

	absent := node_with("LFO", json.Object{})
	testing.expect(t, !core.param_is_reachable(absent, "syncRate"), "LFO syncRate must be unreachable with bpmSync entirely absent")
}

@(test)
test_samplehold_syncrate_dead_regardless_of_bpm_sync :: proc(t: ^testing.T) {
	synced_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(synced_params)
	synced := node_with("SampleHold", synced_params)
	testing.expect(t, !core.param_is_reachable(synced, "syncRate"), "SampleHold syncRate must be unreachable while bpmSync is on")

	unsynced_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(unsynced_params)
	unsynced := node_with("SampleHold", unsynced_params)
	testing.expect(t, !core.param_is_reachable(unsynced, "syncRate"), "SampleHold syncRate must be unreachable even while bpmSync is off")
}

@(test)
test_delay_syncrate_dead_regardless_of_bpm_sync :: proc(t: ^testing.T) {
	synced_params := json.Object{"bpmSync" = json.Boolean(true)}
	defer delete(synced_params)
	synced := node_with("Delay", synced_params)
	testing.expect(t, !core.param_is_reachable(synced, "syncRate"), "Delay syncRate must be unreachable while bpmSync is on")

	unsynced_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(unsynced_params)
	unsynced := node_with("Delay", unsynced_params)
	testing.expect(t, !core.param_is_reachable(unsynced, "syncRate"), "Delay syncRate must be unreachable even while bpmSync is off")
}

@(test)
test_syncrate_dead_reason_does_not_blame_bpm_sync :: proc(t: ^testing.T) {
	// The bug this guards against: reusing the "bpmSync is on..." wording for
	// `syncRate` would be actively wrong, since `syncRate` is dead
	// UNCONDITIONALLY — turning bpmSync off does not revive it, but the
	// bpmSync-gated reason string implies the opposite (that some flag flip
	// fixes it).
	unsynced_params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(unsynced_params)
	n := node_with("LFO", unsynced_params)
	reason := core.param_dead_reason(n, "syncRate")
	testing.expectf(t, reason != core.param_dead_reason(n, "frequency"), "syncRate's dead reason must not be the same string as frequency's bpmSync-gated reason: got %q for both", reason)

	testing.expectf(t, !strings.contains(reason, "bpmSync is on"), "syncRate's dead reason must not imply bpmSync is the cause (it is dead regardless): got %q", reason)
}

@(test)
test_effective_exposed_params_drops_dead_syncrate_checkbox_exposure :: proc(t: ^testing.T) {
	// The (now largely closed-off, per BUGS.md SKB-007) checkbox route: a
	// saved patch with a stray `syncRate` in exposedParameters must still be
	// pruned by the backend regardless of the UI-side scrub.
	exposed := json.Array{json.String("syncRate"), json.String("amplitude")}
	defer delete(exposed)
	params := json.Object{"bpmSync" = json.Boolean(true), "exposedParameters" = exposed}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	names := core.effective_exposed_params(n, nil)
	defer delete(names)
	testing.expectf(t, !contains_string(names[:], "syncRate"), "a checkbox-exposed syncRate must be dropped: got %v", names[:])
	testing.expectf(t, contains_string(names[:], "amplitude"), "amplitude must still be exposed: got %v", names[:])
	testing.expect_value(t, len(names), 1)
}

@(test)
test_effective_exposed_params_plock_cannot_resurrect_syncrate :: proc(t: ^testing.T) {
	// SKB-007's live bug: StepPropertiesEditor ignores isExposable and still
	// offers a syncRate P-lock. Unlike the checkbox route (dropped silently
	// with a warning), collect_plock_targets hard-errors on this — but
	// effective_exposed_params itself must still refuse to resurrect the
	// param regardless, as defense-in-depth (see its own comment at :1219).
	// This is the P-lock-specific regression guard the checkbox-only tests
	// above do not cover.
	params := json.Object{"bpmSync" = json.Boolean(false)}
	defer delete(params)
	n := node_with_id("n1", "LFO", params)
	plocks := []core.Plock_Target{{node_id = "n1", param = "syncRate"}}
	names := core.effective_exposed_params(n, plocks)
	defer delete(names)
	testing.expectf(t, len(names) == 0, "a P-lock on syncRate must never resurrect it, synced or not: got %v", names[:])
}
