package main

import "core:fmt"
import "core:math"
import "core:os"
import "core:strconv"
import "core:strings"
import ga "generated_audio"

// =====================================================================
// Skald acceptance harness (Phase 1). Pure Odin, no audio device, no
// file I/O on the audio path. Reads a fixture name and a few flags,
// imports the sibling generated_audio package, renders N samples into
// a stereo buffer, then runs the assertions registered for that
// fixture name.
//
//   acceptance.exe <fixture_name> [-rate:48000] [-dur:2.0] [-mode:smoke]
//                  [-dump:<features_path>] [-wav:<wav_path>]
//
// Cross-fixture feature comparison (uses files written by -dump:):
//   acceptance.exe __compare_features__ -a:<path> -b:<path>
//                  [-expect-rms:raise|lower] [-expect-peak:raise|lower]
//                  [-expect-centroid:raise|lower] [-min-delta:0.10]
//
// Fixture names map to assertions in the switch below. New fixtures
// require a new case here AND a corresponding seed JSON in
// tests/fixtures/. Seed fixture conventions (instrument naming, etc.)
// are documented in tests/fixtures/SEED_FIXTURE_INSTRUCTIONS.md.
//
// Exit codes:
//   0 — all assertions pass
//   1 — at least one assertion failed (details on stderr)
//   2 — usage error (no fixture name)
//   3 — unknown fixture name
// =====================================================================

main :: proc() {
	fixture := ""
	sample_rate: f32 = 48000.0
	duration_s: f32 = 2.0
	smoke_mode := false
	dump_path := ""
	wav_path := ""
	cmp_a_path := ""
	cmp_b_path := ""
	cmp_expect := Change_Expect{}
	cmp_min_delta: f32 = 0.10

	for arg in os.args[1:] {
		switch {
		case strings.has_prefix(arg, "-rate:"):
			if v, ok := strconv.parse_f32(arg[6:]); ok {
				sample_rate = v
			}
		case strings.has_prefix(arg, "-dur:"):
			if v, ok := strconv.parse_f32(arg[5:]); ok {
				duration_s = v
			}
		case strings.has_prefix(arg, "-mode:"):
			if arg[6:] == "smoke" {
				smoke_mode = true
			}
		case strings.has_prefix(arg, "-dump:"):
			dump_path = arg[6:]
		case strings.has_prefix(arg, "-wav:"):
			wav_path = arg[5:]
		case strings.has_prefix(arg, "-a:"):
			cmp_a_path = arg[3:]
		case strings.has_prefix(arg, "-b:"):
			cmp_b_path = arg[3:]
		case strings.has_prefix(arg, "-expect-rms:"):
			if d, ok := parse_direction(arg[12:]); ok {
				cmp_expect.rms = d
			} else {
				fmt.eprintfln("warning: bad direction in %q", arg)
			}
		case strings.has_prefix(arg, "-expect-peak:"):
			if d, ok := parse_direction(arg[13:]); ok {
				cmp_expect.peak = d
			} else {
				fmt.eprintfln("warning: bad direction in %q", arg)
			}
		case strings.has_prefix(arg, "-expect-centroid:"):
			if d, ok := parse_direction(arg[17:]); ok {
				cmp_expect.centroid = d
			} else {
				fmt.eprintfln("warning: bad direction in %q", arg)
			}
		case strings.has_prefix(arg, "-min-delta:"):
			if v, ok := strconv.parse_f32(arg[11:]); ok {
				cmp_min_delta = v
			}
		case strings.has_prefix(arg, "-"):
			fmt.eprintfln("warning: unknown flag %q", arg)
		case:
			fixture = arg
		}
	}

	if fixture == "" {
		fmt.eprintln(
			"usage: acceptance.exe <fixture_name> [-rate:48000] [-dur:2.0] [-mode:smoke]",
		)
		os.exit(2)
	}

	n := int(sample_rate * duration_s)
	if n < 1024 {
		n = 1024
	}
	buf := make([]Stereo_Sample, n)
	// No `defer delete(buf)` — main exits via os.exit() which doesn't run defers.

	all_pass := true
	did_render := true // false for modes that never fill `buf`

	switch fixture {
	case "__fft_self_test__":
		run_fft_self_test(buf, sample_rate, &all_pass)

	case "__compare_features__":
		// Compare two feature vectors previously written with -dump:.
		// This is how a direction is asserted ACROSS fixtures — the seed
		// fixtures bake oscillator pitch in as a constant, so e.g.
		// "sine_220 → sine_440 raises peak_freq" can only be proven by
		// comparing two separate fixture renders.
		did_render = false
		if cmp_a_path == "" || cmp_b_path == "" {
			fmt.eprintln("usage: acceptance.exe __compare_features__ -a:<path> -b:<path> [-expect-*:raise|lower]")
			os.exit(2)
		}
		fa, ok_a := load_features(cmp_a_path)
		fb, ok_b := load_features(cmp_b_path)
		if !ok_a || !ok_b {
			all_pass = false
		} else {
			label := fmt.tprintf("%s -> %s", cmp_a_path, cmp_b_path)
			all_pass &= assert_features_change(fa, fb, label, cmp_min_delta, cmp_expect)
		}

	case "sine_440":
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 5.0, .Left)
		}

	case "sine_220":
		render_sfx_one_shot(buf, sample_rate, 57, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 220.0, 5.0, .Left)
		}

	case "sine_220_pan_left":
		render_sfx_one_shot(buf, sample_rate, 57, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 220.0, 5.0, .Left)
			all_pass &= assert_stereo_differs(buf, 0.01)
			// Pan -1.0 means hard-left: left RMS should dominate the right by
			// at least 4× (constant-power panner: tan(pi/8) ≈ 0.41 ratio is
			// "near hard-left"; the right channel should be effectively zero).
			rms_l := compute_rms(buf, .Left)
			rms_r := compute_rms(buf, .Right)
			if rms_l < 4.0 * rms_r {
				fmt.eprintfln(
					"FAIL pan_left ratio: L_rms=%.4f, R_rms=%.4f, expected L >= 4×R",
					rms_l,
					rms_r,
				)
				all_pass = false
			}
		}

	case "adsr_sine":
		// Attack 0.1s, Decay 0.1s, Sustain 0.5, Release 0.3s.
		// Trigger with duration 0.6s → release fires at t=0.6, envelope
		// reaches Idle around t≈0.9; require silence after t=1.5.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.6)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_envelope_shape(
				buf,
				sample_rate,
				attack_end_s = 0.10,
				sustain_start_s = 0.30,
				release_start_s = 0.60,
			)
			all_pass &= assert_silence_after(buf, sample_rate, 1.5)
			// The release TAIL must actually ring: release=0.3s from t=0.6,
			// so mid-release (t≈0.7) still has audible energy. Guards the
			// instant-cut regression (release_level clobbered to 0 at
			// note_off/auto-release).
			{
				s := int(0.65 * sample_rate)
				e := int(0.80 * sample_rate)
				tail_rms := compute_rms(buf[s:e], .Left)
				if tail_rms < 0.01 {
					fmt.eprintfln(
						"FAIL adsr_sine release tail: RMS %.6f in [0.65,0.80]s — release is cutting to silence",
						tail_rms,
					)
					all_pass = false
				}
			}
		}

	case "adsr_curve":
		// E8 (roadmap 9.4 item 2). Attack 0.4s with attackCurve=0.9 (near the
		// extreme +1): warp(0.5, 0.9) ~= 0.937 (tests/unit/adsr_curve_test.odin
		// pins the formula in isolation), so a LINEAR attack would sit at
		// exactly half amplitude at half-attack-time (t=0.2s) and this one
		// must sit near full amplitude instead — the curve reshapes the ramp,
		// not merely how long it takes. decay/release stay flat (0) so only
		// the attack-stage warp is under test here. Goes through
		// render_sfx_one_shot (the per-asset path), not the project wrapper —
		// no master-bus stage (limiter, E5's DC blocker) sits between the
		// oscillator and this measurement to muddy it.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 1.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			// A short window (< 2 cycles at 440Hz) centred on t=0.2s: short
			// enough that the envelope itself barely moves across it, so its
			// peak approximates the instantaneous envelope * amplitude (1.0)
			// at that instant rather than smearing across the ramp. Measured
			// empirically (this window, this fixture): attackCurve=0 (linear)
			// peaks ~0.47 here, attackCurve=0.9 peaks ~0.74 — the theoretical
			// 0.5/0.937 softened a little by the window not landing exactly
			// on a sine peak. 0.65 sits with comfortable margin above the
			// linear reading and below the curved one.
			s := int(0.196 * sample_rate)
			e := int(0.204 * sample_rate)
			half_attack_peak := compute_peak(buf[s:e], .Left)
			if half_attack_peak < 0.65 {
				fmt.eprintfln(
					"FAIL adsr_curve: peak %.6f at half-attack-time (0.2s) — attackCurve=0.9 must land well above the linear 0.5, not near it",
					half_attack_peak,
				)
				all_pass = false
			}
		}

	case "dc_offset_pulse":
		// Square wave at pulseWidth 0.02 spends 98% of each cycle at -1 and
		// only 2% at +1 — raw duty-cycle mean ~= 0.02*1 + 0.98*(-1) = -0.96.
		// E5's un-bypassable DC blocker lives on the master bus, not the
		// per-asset processor (see render_project_one_shot's comment), so
		// this renders through project_process. Must pull the mean back near
		// zero well inside the sustain window below, which sits clear of the
		// 0.02s attack/decay and the release at 1.7s.
		render_project_one_shot(buf, sample_rate, 60, 1.0, 1.7)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Both)
			all_pass &= assert_dc_offset_below(buf, sample_rate, 0.3, 1.6, 0.05, .Both)
		}

	case "kick_loop_120bpm":
		// Music Layer: 120 BPM, kicks on steps 0,4,8,12 of a 16-step
		// pattern. Step duration = 60/120/4 = 0.125s. Kicks land at
		// t = 0.0, 0.5, 1.0, 1.5s (±~2ms tolerance, ~96 samples at 48k).
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			// Each kick is short — assert audible energy in a 60ms window
			// around each expected onset, and silence in the gaps would be
			// nice but is patch-dependent (decay tails). Stick with onset
			// energy as the timing check.
			all_pass &= assert_onset_at(buf, sample_rate, 0.000, 0.060)
			all_pass &= assert_onset_at(buf, sample_rate, 0.500, 0.060)
			all_pass &= assert_onset_at(buf, sample_rate, 1.000, 0.060)
			all_pass &= assert_onset_at(buf, sample_rate, 1.500, 0.060)
			// Sound-changes primitive, start-vs-trigger path: one manual
			// kick (trigger) vs the sequenced 4-kick loop (start) must
			// raise total RMS.
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{kind = .Trigger, note = 36, velocity = 1.0, duration = 0.0},
				Render_Spec{kind = .Start},
				"kick_loop trigger-vs-start",
				0.10,
				Change_Expect{rms = .Raise},
			)
		}

	case "filter_sweep":
		// Music Layer: sustained tone with LFO sweeping the filter cutoff.
		// Assert the spectral centroid in the second half is materially
		// different from the first half (2× ratio in either direction).
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_centroid_shifts(buf, sample_rate, 2.0)
		}

	case "param_modulation":
		// SFX with exposed `cutoff`. Trigger a long-sustaining note, then
		// while rendering, sweep the cutoff from 200 → 4000 Hz across the
		// buffer via the string-keyed setter (resolves uniformly regardless
		// of asset type / collision-resolved field name). Spectral centroid
		// in the second half should be at least 2× the first half.
		render_param_sweep(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_centroid_shifts(buf, sample_rate, 2.0)
			// Sound-changes primitive, set_param path: rendering the same
			// asset with cutoff held at 200Hz vs 4000Hz must raise the
			// spectral centroid (filter opening = more high-end energy).
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{
					kind = .Trigger,
					note = 69,
					velocity = 1.0,
					duration = 0.0,
					params = {{name = "cutoff", value = 200.0}},
				},
				Render_Spec{
					kind = .Trigger,
					note = 69,
					velocity = 1.0,
					duration = 0.0,
					params = {{name = "cutoff", value = 4000.0}},
				},
				"param_modulation cutoff 200->4000",
				0.10,
				Change_Expect{centroid = .Raise},
			)
		}

	// --- P0 compile-regression fixtures ---
	// Each of these graph shapes used to generate Odin that failed to build
	// (exposed-param collisions, digit-leading identifiers, duplicate chord
	// switch cases). The load-bearing assertion is that codegen + build
	// succeeded at all; the audibility check proves the signal path works.

	case "dual_osc":
		// Two oscillators, both exposing the UI-default param set (phase
		// collision → renamed struct fields) into a 2-channel mixer.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
		}

	case "mixer_exposed_default":
		// An exposed Mixer level is named `level1`, but its authored fader is
		// nested in the `levels` array. Exposure must initialize both the
		// processor field and its public metadata from that authored 0.25,
		// not from the range table's unity fallback.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			default_rms := compute_rms(buf, .Left)
			if default_rms < 0.01 {
				fmt.eprintfln(
					"FAIL mixer_exposed_default: authored 0.25 level produced RMS %.6f, expected >= 0.01",
					default_rms,
				)
				all_pass = false
			}
			{
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sample_rate)
				if value, ok := ga.Asset_get_param(p, "level1"); !ok || abs(value - 0.25) > 1e-6 {
					fmt.eprintfln(
						"FAIL mixer_exposed_default: initialized level1=%.9f ok=%v, expected authored 0.25",
						value,
						ok,
					)
					all_pass = false
				}
				found_metadata := false
				for info in ga.Asset_PARAMS {
					if info.name == "level1" {
						found_metadata = true
						if abs(info.default - 0.25) > 1e-6 {
							fmt.eprintfln(
								"FAIL mixer_exposed_default: PARAMS default=%.9f, expected authored 0.25",
								info.default,
							)
							all_pass = false
						}
					}
				}
				if !found_metadata {
					fmt.eprintln("FAIL mixer_exposed_default: level1 missing from Asset_PARAMS")
					all_pass = false
				}
			}
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0},
				Render_Spec{
					kind = .Trigger,
					note = 69,
					velocity = 1.0,
					duration = 0.0,
					params = {{name = "level1", value = 1.0}},
				},
				"mixer exposed authored 0.25->runtime 1.0",
				0.50,
				Change_Expect{rms = .Raise},
			)
		}

	case "fm_patch":
		// FM operator (exposed frequency=ratio colliding with the carrier's
		// exposed frequency) modulating an oscillator's input_freq.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
		}

	case "reverb_adsr_exposure":
		// ADSR and Reverb both exposing "decay" — the UI's default exposure
		// set for that node pair.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.5)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
		}

	case "reverb_predelay":
		// Wet-only impulse response: the direct path is deliberately absent
		// from the measurement, so the first non-zero sample is the comb's
		// fixed 75ms tap plus the authored/runtime pre-delay.
		if smoke_mode {
			render_reverb_impulse(buf, sample_rate, 0.02, false)
			all_pass &= run_smoke(buf, fixture)
		} else {
			comb_samples := int(0.075 * sample_rate)

			// Zero pre-delay preserves the old comb timing exactly.
			if !render_reverb_impulse(buf, sample_rate, 0.0, true) {
				fmt.eprintln("FAIL reverb_predelay: runtime setter rejected preDelay=0")
				all_pass = false
			}
			all_pass &= assert_impulse_onset(buf, comb_samples, "reverb pre-delay zero")

			// The fixture's authored 20ms value must create a measurable gap.
			render_reverb_impulse(buf, sample_rate, 0.02, false)
			all_pass &= assert_impulse_onset(
				buf,
				comb_samples + int(0.02 * sample_rate),
				"reverb pre-delay authored 20ms",
			)

			// Change an already-initialized processor through the public API.
			if !render_reverb_impulse(buf, sample_rate, 0.04, true) {
				fmt.eprintln("FAIL reverb_predelay: runtime setter rejected preDelay=0.04")
				all_pass = false
			}
			all_pass &= assert_impulse_onset(
				buf,
				comb_samples + int(0.04 * sample_rate),
				"reverb pre-delay runtime 40ms",
			)

			found_metadata := false
			for info in ga.Asset_PARAMS {
				if info.name == "preDelay" {
					found_metadata = true
					if info.min != 0.0 || info.max != 0.25 ||
					   abs(info.default - 0.02) > 1e-6 || info.unit != "s" {
						fmt.eprintfln(
							"FAIL reverb_predelay metadata: got min=%.3f max=%.3f default=%.3f unit=%q",
							info.min, info.max, info.default, info.unit,
						)
						all_pass = false
					}
				}
			}
			if !found_metadata {
				fmt.eprintln("FAIL reverb_predelay: preDelay missing from Asset_PARAMS")
				all_pass = false
			}
		}

	case "chord_step":
		// Music Layer with a three-note chord on step 0 (used to emit
		// duplicate switch cases) plus a single note on step 4.
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_onset_at(buf, sample_rate, 0.000, 0.060)
			all_pass &= assert_onset_at(buf, sample_rate, 0.500, 0.060)
		}

	case "numeric_ids":
		// Unlabeled numeric-id nodes exposing the same params — the
		// collision field names used to come out digit-leading (`2_pulseWidth`).
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
		}

	case "melody_8step":
		// THE melody gate: C4-E4-G4-C5 on steps 0/2/4/6 at 120 BPM. Every
		// note must come out at its OWN pitch — this is the fixture that
		// fails if the oscillator ever again bakes `frequency` in as a
		// constant and the piano roll collapses to one tone.
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			// Steps 0/2/4/6 at 120 BPM = onsets at 0.0/0.25/0.5/0.75s; each
			// note rings for ~0.175s (1 step + release), so the windows sit
			// inside each note's sustain.
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.010, 0.120, 261.63, 15.0)
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.260, 0.370, 329.63, 15.0)
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.510, 0.620, 392.00, 15.0)
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.760, 0.870, 523.25, 15.0)
		}

	case "hostile_modulation":
		// Stability gate: ±8 octave LFO into the oscillator's exponential
		// FM input, ±30kHz into cutoff, ±40 into resonance, reverb at the
		// UI-default decay=3.0, unison 3 — every historical NaN/blowup
		// trigger at once. The bar: every sample finite, and it's audible
		// (NaN latching silences the whole asset — silence here IS failure).
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		{
			finite := true
			for s, i in buf {
				if !is_finite(s.l) || !is_finite(s.r) {
					fmt.eprintfln(
						"FAIL hostile_modulation: non-finite sample at %d (l=%v r=%v)",
						i, s.l, s.r,
					)
					finite = false
					break
				}
			}
			all_pass &= finite
		}
		all_pass &= assert_audible(buf, .Left)
		// Second half must still be audible: a mid-render NaN latch leaves
		// permanent silence even if early samples were fine.
		{
			tail_rms := compute_rms(buf[len(buf)/2:], .Both)
			if tail_rms < 0.005 {
				fmt.eprintfln(
					"FAIL hostile_modulation: second-half RMS %.6f — voice latched silent mid-render",
					tail_rms,
				)
				all_pass = false
			}
		}

	// --- P3 routing fixtures ---

	case "panner_mono":
		// Panner feeding a mono-input node (Gain). Used to be TOTAL silence:
		// downstream read node_<id>_out, which the Panner never wrote.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.5)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 5.0, .Left)
		}

	case "dual_panner":
		// Two hard-panned sources, BOTH wired into the GraphOutput. Only the
		// first connection used to survive — the right channel was silently
		// dropped from the mix.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.5)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_audible(buf, .Right)
			all_pass &= assert_stereo_differs(buf, 0.01)
		}

	case "delay_tail":
		// 0.5s delay, feedback 0.5, note dies by ~0.35s. The second echo at
		// t≈1.0-1.3s must ring even though every voice is dead — the effect
		// used to be gated behind voice.active and hard-cut the tail.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.25)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			{
				s := int(1.05 * sample_rate)
				e := int(1.30 * sample_rate)
				tail_rms := compute_rms(buf[s:e], .Both)
				if tail_rms < 0.003 {
					fmt.eprintfln(
						"FAIL delay_tail: echo RMS %.6f in [1.05,1.30]s — tail cut when voices died",
						tail_rms,
					)
					all_pass = false
				}
			}
			// SKB-016: the audio kept ringing but _is_playing did not say so —
			// it reported `p.playing || any(voice.active)`, both false by
			// ~0.30s here (0.25s duration + 0.05s release). A game polling it
			// to decide when to free the asset therefore cut the echo off. The
			// baked countdown for this patch is exactly 5.0s: a 0.5s line at
			// 0.5 feedback needs 10 passes to fall 60 dB, and nothing here is
			// exposed, so no range maximum widens it.
			{
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sample_rate)
				ga.Asset_trigger(p, 69, 1.0, 0.25)
				for _ in 0 ..< int(1.0 * sample_rate) do ga.Asset_process(p)
				if !ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL delay_tail: is_playing false at 1.0s, with every voice dead but the echo still ringing",
					)
					all_pass = false
				}
				for _ in 0 ..< int(3.5 * sample_rate) do ga.Asset_process(p)
				if !ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL delay_tail: is_playing false at 4.5s, inside the 5.0s tail",
					)
					all_pass = false
				}
				// ...and it has to expire, or the asset can never be freed at
				// all and the fix is just a different bug.
				for _ in 0 ..< int(1.5 * sample_rate) do ga.Asset_process(p)
				if ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL delay_tail: is_playing still true at 6.0s — the tail countdown never expires",
					)
					all_pass = false
				}
			}
		}

	case "delay_tail_live":
		// B7-2-followup / SKB-016: delayTime and feedback are both exposed, so
		// the OLD baked constant was 270s (delayTime range max 2.0s x 135
		// passes for feedback range max 0.95 to fall 60dB) no matter what is
		// authored. The authored values here (delayTime 0.25, feedback 0.3)
		// give a true live tail of 0.25 x 6 passes = 1.5s. This fixture fails
		// under the old fixed-constant countdown (is_playing is still true at
		// 2.5s — nowhere near its 270s expiry) and passes once the countdown
		// is armed from the live field values instead.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.25)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			{
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sample_rate)
				ga.Asset_trigger(p, 69, 1.0, 0.25)
				// Note dies by ~0.30s (0.25s duration + 0.05s release). At 1.0s
				// the live 1.5s tail is still ringing.
				for _ in 0 ..< int(1.0 * sample_rate) do ga.Asset_process(p)
				if !ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL delay_tail_live: is_playing false at 1.0s, inside the live 1.5s tail",
					)
					all_pass = false
				}
				// By 2.5s the live tail (armed ~0.30s + 1.5s = expires ~1.80s)
				// is long gone. The pre-fix baked constant would keep this true
				// until ~270.3s, so this is the assertion that catches the bug.
				for _ in 0 ..< int(1.5 * sample_rate) do ga.Asset_process(p)
				if ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL delay_tail_live: is_playing still true at 2.5s — the live tail should have expired around 1.8s, not the baked worst-case 270s",
					)
					all_pass = false
				}
			}
		}

	case "wavetable_morph":
		// Wavetable at position 0 (sine) must track the note pitch, and
		// sweeping position toward sawtooth must brighten the spectrum —
		// this node used to discard position entirely and play a fixed
		// 440Hz sine.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 8.0, .Left)
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{
					kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0,
					params = {{name = "position", value = 0.0}},
				},
				Render_Spec{
					kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0,
					params = {{name = "position", value = 2.0}},
				},
				"wavetable position sine->saw",
				0.10,
				Change_Expect{centroid = .Raise},
			)
		}

	case "wavetable_unison_stack":
		// SKB-012: instrument unison=3 / detune=1200 (a full octave spread
		// across the 3-voice stack: i=0 -> -1200 cents, i=1 -> 0, i=2 ->
		// +1200 cents) over a single Wavetable source at position 0 (pure
		// sine). Before this fix the Wavetable generator had no unison
		// reference at all and this instrument rendered as a single 440Hz
		// tone — the two octave-offset partials asserted below would be
		// silent (only FFT window leakage, nowhere near the threshold).
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			spec := fft_channel(buf, .Left)
			defer delete(spec)
			center := magnitude_at_freq(spec, sample_rate, 440.0)
			below := magnitude_at_freq(spec, sample_rate, 220.0)
			above := magnitude_at_freq(spec, sample_rate, 880.0)
			// All three voices are equal-amplitude (linear /N average), so
			// the down- and up-octave voices should sit within the same
			// order of magnitude as the center voice, not down in the noise
			// floor. 15% is comfortably above FFT window leakage from a
			// single undetuned 440Hz sine (checked: leakage alone is <2%).
			if below < center * 0.15 {
				fmt.eprintfln(
					"FAIL wavetable_unison_stack: expected real energy at 220Hz (unison voice i=0, -1200 cents) comparable to the 440Hz center voice; got %.4f vs center %.4f — the unison stack is not detuning this voice",
					below, center,
				)
				all_pass = false
			}
			if above < center * 0.15 {
				fmt.eprintfln(
					"FAIL wavetable_unison_stack: expected real energy at 880Hz (unison voice i=2, +1200 cents) comparable to the 440Hz center voice; got %.4f vs center %.4f — the unison stack is not detuning this voice",
					above, center,
				)
				all_pass = false
			}
		}

	case "fm_unison_stack":
		// SKB-012: same unison=3 / detune=1200 stack as wavetable_unison_stack
		// above, but over an FM Operator carrier (ratio=1.0, modIndex=0 so no
		// modulator sidebands complicate the spectrum — this renders three
		// pure carrier tones). Before this fix generate_fm_operator_code had
		// no unison reference and this instrument rendered as a single
		// 440Hz tone.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			spec := fft_channel(buf, .Left)
			defer delete(spec)
			center := magnitude_at_freq(spec, sample_rate, 440.0)
			below := magnitude_at_freq(spec, sample_rate, 220.0)
			above := magnitude_at_freq(spec, sample_rate, 880.0)
			if below < center * 0.15 {
				fmt.eprintfln(
					"FAIL fm_unison_stack: expected real energy at 220Hz (unison voice i=0, -1200 cents) comparable to the 440Hz center voice; got %.4f vs center %.4f — the unison stack is not detuning this voice",
					below, center,
				)
				all_pass = false
			}
			if above < center * 0.15 {
				fmt.eprintfln(
					"FAIL fm_unison_stack: expected real energy at 880Hz (unison voice i=2, +1200 cents) comparable to the 440Hz center voice; got %.4f vs center %.4f — the unison stack is not detuning this voice",
					above, center,
				)
				all_pass = false
			}
		}

	case "graph_save_roundtrip":
		// Raw React Flow save: instrument metadata and subgraph live under
		// node.data, and internal nodes use UI type names. This used to fall
		// back to Untitled with an empty graph, so the Asset_* harness symbols
		// did not even compile.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.4)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 8.0, .Left)
		}

	case "legacy_loose_graph":
		// Legacy loose graph: top-level nodes/edges with no Instrument wrapper.
		// The importer wraps these as an Asset SFX so the old example library
		// round-trips instead of generating an empty/no-instrument project.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.4)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 8.0, .Left)
		}
	case "dual_track":
		// TWO sequencer tracks on one instrument (plus a muted third).
		// Only tracks[0] used to be read — every extra track silently
		// vanished from the export (the four_bar_song "Pad Third" data
		// loss). Track "Lead": C4@0, E4@8. Track "Counter": C5@4, E5@12.
		// Muted "MutedGhost": note@2 that must NOT sound.
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			// First track's notes (steps 0/8 at 120 BPM = 0.0s/1.0s).
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.010, 0.120, 261.63, 15.0)
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 1.010, 1.120, 329.63, 15.0)
			// SECOND track's notes (steps 4/12 = 0.5s/1.5s) — the ones that
			// used to be dropped.
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.510, 0.620, 523.25, 20.0)
			all_pass &= assert_peak_freq_in_window(buf, sample_rate, 1.510, 1.620, 659.26, 25.0)
			// Muted track's step-2 note (0.25s) must not sound: by 0.26s the
			// step-0 note is fully released (0.125s gate + 0.05s release).
			{
				s := int(0.28 * sample_rate)
				e := int(0.45 * sample_rate)
				gap_rms := compute_rms(buf[s:e], .Both)
				if gap_rms > 0.005 {
					fmt.eprintfln(
						"FAIL dual_track: muted track leaked audio (RMS %.6f in [0.28,0.45]s)",
						gap_rms,
					)
					all_pass = false
				}
			}
		}

	case "effect_input":
		// Effect instrument: GraphInput -> Lowpass(2000) -> GraphOutput, no
		// oscillators, no notes. This shape used to hard-fail codegen
		// ("unknown node type GraphInput") — the collapse-with-inputs UI flow
		// was unexportable. Feed a 440Hz sine via the _feed_input API: it
		// must pass through the filter audibly WITHOUT any voice triggered.
		render_effect_feed(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_peak_freq(buf, sample_rate, 440.0, 8.0, .Left)
			// And with nothing fed, an effect asset is silent (no leak from
			// stale input state or phantom voices).
			{
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sample_rate)
				sum_sq: f32 = 0
				for _ in 0 ..< len(buf) {
					l, r := ga.Asset_process(p)
					sum_sq += l * l + r * r
				}
				idle_rms := math.sqrt(sum_sq / f32(len(buf) * 2))
				if idle_rms > 0.001 {
					fmt.eprintfln(
						"FAIL effect_input: unfed effect asset produced RMS %.6f (expected silence)",
						idle_rms,
					)
					all_pass = false
				}
			}
		}

	case "fm_carrier_wire":
		// The UI's FM "Carrier" handle (input_carrier): an LFO wired into it
		// V/Oct-modulates the carrier frequency. This wire used to be
		// REJECTED by the connection validator with a hint to use a port the
		// FM node doesn't even show — the canonical UI patch was unexportable.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
		}

	case "plock_step":
		// P-lock gate: a 16-step sawtooth loop through a Lowpass at 300Hz.
		// Step 8 carries a "Filter:cutoff" P-lock to 8000Hz — cutoff is NOT
		// in the node's exposedParameters, so this proves the codegen (a)
		// auto-exposes P-locked params and (b) resolves the UI's
		// "Label:param" key to the real set_param field name. Both used to
		// fail silently: the whole render stayed dark at 300Hz.
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			// Steps 0-7 (0.0-1.0s) at cutoff 300 vs steps 8-15 (1.0-2.0s)
			// at cutoff 8000: the second half must be dramatically brighter.
			all_pass &= assert_centroid_shifts(buf, sample_rate, 2.0)
		}

	case "bpm_change":
		// BUG-SEQ-RATE regression, exercised where it actually bites:
		// 44.1kHz @ 120 BPM is 5512.5 samples/step (fractional — the carry
		// path), and a LIVE p.bpm write mid-play must take effect on the
		// next step boundary with the new exact spacing.
		render_music_layer(buf, sample_rate)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			{
				sr: f32 = 44100.0 // deliberately independent of -rate:
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sr)
				ga.Asset_start(p)
				expected1 := f64(sr) * 60.0 / (120.0 * 4.0) // 5512.50
				expected2 := f64(sr) * 60.0 / (240.0 * 4.0) // 2756.25
				transitions: [dynamic]int
				defer delete(transitions)
				last_step := p.current_step
				total := int(sr * 6.0)
				switch_at := int(sr * 3.0)
				for i in 0 ..< total {
					if i == switch_at {
						p.bpm = 240.0
					}
					_, _ = ga.Asset_process(p)
					if p.current_step != last_step {
						last_step = p.current_step
						append(&transitions, i)
					}
				}
				sum1, sum2: f64
				n1, n2: int
				worst1, worst2: f64
				for k in 1 ..< len(transitions) {
					d := f64(transitions[k] - transitions[k - 1])
					if transitions[k] < switch_at {
						sum1 += d
						n1 += 1
						if e := math.abs(d - expected1); e > worst1 do worst1 = e
					} else if transitions[k - 1] > switch_at + int(expected1) {
						sum2 += d
						n2 += 1
						if e := math.abs(d - expected2); e > worst2 do worst2 = e
					}
				}
				if n1 < 8 || n2 < 8 {
					fmt.eprintfln("FAIL bpm_change: too few step transitions (n1=%d n2=%d)", n1, n2)
					all_pass = false
				} else {
					mean1 := sum1 / f64(n1)
					mean2 := sum2 / f64(n2)
					// Mean spacing must hit the exact fractional value (the
					// carry keeps long-run drift at zero); individual steps
					// may quantize by ±1 sample.
					if math.abs(mean1 - expected1) > 0.05 || worst1 > 1.0 {
						fmt.eprintfln(
							"FAIL bpm_change @120: mean step %.4f (expected %.4f), worst single-step err %.2f",
							mean1, expected1, worst1,
						)
						all_pass = false
					}
					if math.abs(mean2 - expected2) > 0.05 || worst2 > 1.0 {
						fmt.eprintfln(
							"FAIL bpm_change @240 (live change): mean step %.4f (expected %.4f), worst single-step err %.2f",
							mean2, expected2, worst2,
						)
						all_pass = false
					}
				}
			}
		}

	case "steal_release_first":
		// C6-1 (F-B03-3/6): voice stealing is release-first. Two voices: B is
		// the OLDEST and still held; A is younger but already released. The
		// pure oldest-by-age steal took B — cutting the note the player was
		// still holding — while a voice that was only fading out sat there.
		// Now the releasing voice goes first; age only decides among voices
		// in the same tier.
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			ga.Asset_init(p, sample_rate)
			t_a := int(0.1 * sample_rate)
			t_off_a := int(0.2 * sample_rate)
			t_c := int(0.3 * sample_rate)
			ga.Asset_note_on(p, 57, 1.0, 0.0) // B: A3 (220 Hz), oldest, held throughout
			for i in 0 ..< len(buf) {
				if i == t_a do ga.Asset_note_on(p, 69, 1.0, 0.0)  // A: A4 (440 Hz)
				if i == t_off_a do ga.Asset_note_off(p, 69)        // A releases (1.5 s tail)
				if i == t_c do ga.Asset_note_on(p, 81, 1.0, 0.0)  // C: A5 — must steal A, not B
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				// B (220 Hz) must still be the strongest partial well after the
				// steal. Before the fix, C stole B and the window held only
				// C (880 Hz) plus A's fading 440.
				all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.6, 1.0, 220.0, 5.0, .Left)
			}
		}

	case "noadsr_fade":
		// C6-3 (F-B03-5): a voice with no ADSR used to be switched off at the
		// exact sample its duration expired — the default _trigger walks into
		// this — which is a hard cut mid-waveform, an audible click. A short
		// linear fade now follows the duration. Same discontinuity gate as
		// steal_click, around the expiry sample.
		{
			dur: f32 = 0.2006 // 88.26 cycles of 440 Hz: the cut lands near a peak, not on a zero crossing
			render_sfx_one_shot(buf, sample_rate, 69, 1.0, dur)
			n_cut := int(dur * sample_rate)
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				all_pass &= assert_audible(buf, .Left)
				cut_max: f32 = 0.0
				for i in n_cut - 4 ..< n_cut + int(0.006 * sample_rate) {
					d := abs(buf[i].l - buf[i - 1].l)
					if d > cut_max do cut_max = d
				}
				other_max: f32 = 0.0
				for i in 1000 ..< n_cut - 4 {
					d := abs(buf[i].l - buf[i - 1].l)
					if d > other_max do other_max = d
				}
				if cut_max > 1.5 * other_max {
					fmt.eprintfln(
						"FAIL noadsr_fade: discontinuity %.4f at duration expiry (steady-state max %.4f) — the no-ADSR hard cut is back",
						cut_max, other_max,
					)
					all_pass = false
				}
				// And the voice does end: silence shortly after the fade.
				all_pass &= assert_silence_after(buf, sample_rate, dur + 0.05)
			}
		}

	case "sustain_zero_hold":
		// C6-4 (SKB-041, EDITORIAL C14): an ADSR whose sustain is 0 used to
		// flip its stage to Idle the moment the decay ended — and an Idle
		// envelope marks the whole VOICE inactive, so a held note whose ADSR
		// only shapes the filter cutoff went silent after 0.1 s while the
		// key was still down. The envelope now sits at its sustain level
		// until note_off/duration starts the Release the UI draws.
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			ga.Asset_init(p, sample_rate)
			ga.Asset_note_on(p, 57, 1.0, 0.0) // held for the whole buffer
			for i in 0 ..< len(buf) {
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				// Audible well after attack+decay (0.105 s). Before the fix the
				// voice was inactive from ~0.11 s and this window was silent.
				all_pass &= assert_peak_freq_in_window(buf, sample_rate, 0.5, 1.0, 220.0, 5.0, .Left)
			}
		}

	case "lfo_retrigger":
		// C6-2 (F-B03-2): the fresh-voice reset skipped LFO and Sample & Hold
		// state, so a per-voice LFO kept its phase from the previous note and
		// the same patch sounded different on every retrigger. The reset now
		// covers them: two fresh notes must start with the same modulation.
		// The LFO (0.25 Hz) drives the VCA gain; without the reset the second
		// note starts 45 degrees further along and noticeably louder.
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			ga.Asset_init(p, sample_rate)
			t_two := int(0.5 * sample_rate)
			ga.Asset_note_on(p, 69, 1.0, 0.3)
			for i in 0 ..< len(buf) {
				if i == t_two do ga.Asset_note_on(p, 69, 1.0, 0.3)
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				rms_first := compute_rms(buf[int(0.02 * sample_rate):int(0.08 * sample_rate)], .Left)
				rms_second := compute_rms(buf[t_two + int(0.02 * sample_rate):t_two + int(0.08 * sample_rate)], .Left)
				if rms_first <= 0.01 || abs(rms_first - rms_second) > 0.05 * rms_first {
					fmt.eprintfln(
						"FAIL lfo_retrigger: first-note RMS %.4f vs second-note RMS %.4f — the LFO did not restart with the fresh voice",
						rms_first, rms_second,
					)
					all_pass = false
				}
			}
		}

	case "vca_multiply":
		// C4 (F-A04-4): the modular idiom — a bare envelope into a separate
		// VCA's Gain port — used to compute `audio * (knob + envelope)`, so with
		// the knob at 1.0 the multiplier swung 1 -> 2 -> 1 and the note never
		// stopped. A VCA whose `gainMode` is "multiply" computes
		// `audio * knob * envelope`: full authority from silence to unity, and
		// the note ends when the envelope does. Knob deliberately at 1.0 — the
		// value that makes the additive form fail loudest.
		{
			render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				all_pass &= assert_audible(buf[0:int(0.05 * sample_rate)], .Left)
				// Two windows the additive form gets wrong while the voice is alive
				// (once the envelope is Idle the voice is inactive either way, so a
				// silence check after the note proves nothing). During the decay the
				// envelope is ~0.9: multiply gives 0.5 * 0.8 * 0.9 -> RMS ~0.25;
				// additive gives a multiplier of ~1.9 -> RMS ~0.54. Late in the
				// release (0.13-0.16 s, envelope 0.24 -> 0) multiply is nearly
				// silent; additive is still ~1.0x, a full-level tone about to be
				// hard-cut.
				rms_decay := compute_rms(buf[int(0.02 * sample_rate):int(0.05 * sample_rate)], .Left)
				rms_late := compute_rms(buf[int(0.13 * sample_rate):int(0.16 * sample_rate)], .Left)
				if rms_decay > 0.35 || rms_late > 0.1 {
					fmt.eprintfln(
						"FAIL vca_multiply: decay RMS %.3f (want < 0.35), late-release RMS %.3f (want < 0.1) — the Gain port is adding to the knob instead of scaling it",
						rms_decay, rms_late,
					)
					all_pass = false
				}
				all_pass &= assert_silence_after(buf, sample_rate, 0.3)
			}
		}

	case "wavetable_pwm":
		// C5 (F-A01-7): the Wavetable's square end was hard-coded at 50 % duty
		// while the Oscillator's square had a full pulse-width control. With
		// `pulseWidth` exposed, narrowing the duty from 0.5 to 0.1 must change
		// the sound (a 10 % pulse has strong even harmonics a 50 % square
		// lacks). Before the fix the setter did not exist and the sample
		// helper ignored the width.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0, params = {{name = "pulseWidth", value = 0.5}}},
				Render_Spec{kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0, params = {{name = "pulseWidth", value = 0.1}}},
				"wavetable pulse width 0.5 -> 0.1",
			)
		}

	case "wavetable_phase":
		// C5 (F-A01-8): two sine Wavetables at 440 Hz, amplitudes 0.5 and
		// 0.25, the second offset by 180 degrees. Summed they cancel down to a
		// 0.25 residual: RMS 0.25 * 0.8 (master) / sqrt2 ~= 0.14. Before the
		// fix the phase field was ignored and they added to 0.75 -> RMS 0.42.
		{
			render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				rms := compute_rms(buf[int(0.01 * sample_rate):int(0.3 * sample_rate)], .Left)
				if rms > 0.25 || rms < 0.05 {
					fmt.eprintfln(
						"FAIL wavetable_phase: RMS %.3f (want ~0.14: a 180-degree copy must cancel) — the Wavetable phase parameter is not applied",
						rms,
					)
					all_pass = false
				}
			}
		}

	case "fm_level":
		// C5 (F-A02-7): the FM Operator was the only source with no output
		// level — a bare sin() at full scale. `amplitude` 0.25 on an unmodulated
		// carrier: RMS 0.25 * 0.8 / sqrt2 ~= 0.14. Before the fix: 0.57.
		{
			render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
			if smoke_mode {
				all_pass &= run_smoke(buf, fixture)
			} else {
				rms := compute_rms(buf[int(0.05 * sample_rate):int(0.5 * sample_rate)], .Left)
				if rms > 0.25 || rms < 0.05 {
					fmt.eprintfln(
						"FAIL fm_level: RMS %.3f (want ~0.14) — the FM Operator amplitude is not applied",
						rms,
					)
					all_pass = false
				}
			}
		}

	case "reverb_damping":
		// C5 (F-A07-7): a one-pole lowpass on the fed-back sample makes highs
		// die faster than lows, the way rooms do. A white-noise burst into a
		// wet-only comb: raising damping from 0 to 0.95 must lower the tail's
		// spectral centroid. Before the fix the setter did not exist.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left, 0.02) // a 20 ms noise burst's wet tail is quiet over a 2 s buffer
			all_pass &= assert_sound_changes(
				sample_rate,
				len(buf),
				Render_Spec{kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0, params = {{name = "damping", value = 0.0}}},
				Render_Spec{kind = .Trigger, note = 69, velocity = 1.0, duration = 0.0, params = {{name = "damping", value = 0.95}}},
				"reverb damping 0 -> 0.95",
				0.10,
				Change_Expect{centroid = .Lower},
			)
		}

	case "steal_click":
		// Voice-steal continuity gate: voice_count=1 patch holds A4, then a
		// second note_on steals the only voice. The retrigger must be
		// sample-continuous — the old hard state reset (osc phase + filter
		// zeroed, envelope snapped to 0 mid-waveform) was an audible click on
		// every steal (measured 0.28 sample-to-sample jump vs 0.06 normal).
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			ga.Asset_init(p, sample_rate)
			// +41 keeps the steal off any zero-crossing alignment between the
			// held note's period and the render position.
			n_pre := int(0.5 * sample_rate) + 41
			if n_pre >= len(buf) - 1024 {
				n_pre = len(buf) / 2
			}
			ga.Asset_note_on(p, 69, 1.0, 0.0) // hold A4
			for i in 0 ..< n_pre {
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			ga.Asset_note_on(p, 81, 1.0, 0.0) // steal -> A5
			for i in n_pre ..< len(buf) {
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			all_pass &= assert_audible(buf, .Left)
			steal_max: f32 = 0.0
			for i in n_pre - 8 ..< n_pre + 8 {
				d := abs(buf[i].l - buf[i - 1].l)
				if d > steal_max do steal_max = d
			}
			other_max: f32 = 0.0
			for i in 1000 ..< len(buf) {
				if i >= n_pre - 8 && i < n_pre + 8 do continue
				d := abs(buf[i].l - buf[i - 1].l)
				if d > other_max do other_max = d
			}
			if steal_max > 0.12 || steal_max > 2.0 * other_max {
				fmt.eprintfln(
					"FAIL steal_click: discontinuity %.4f at voice steal (elsewhere max %.4f) — hard state-reset click is back",
					steal_max,
					other_max,
				)
				all_pass = false
			}
		}

	case "sfx_oneshot":
		// SFX with ADSR but no sequencer track. Trigger once with finite
		// duration, then assert silence after release ends.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.3)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_silence_after(buf, sample_rate, 1.5)
			// Default-args trigger (duration=0) must be a one-shot, not a
			// drone. This patch SUSTAINS at 0.9 — the old passthrough kept
			// the voice (and is_playing) alive forever. Now: auto-release
			// after attack+decay (0.1s), idle by ~0.6s, silent by 1.0s.
			{
				p := new(ga.Asset_Processor)
				defer free(p)
				ga.Asset_init(p, sample_rate)
				ga.Asset_trigger(p)
				buf2 := make([]Stereo_Sample, len(buf))
				defer delete(buf2)
				for i in 0 ..< len(buf2) {
					l, r := ga.Asset_process(p)
					buf2[i] = {l, r}
				}
				all_pass &= assert_audible(buf2, .Left)
				all_pass &= assert_silence_after(buf2, sample_rate, 1.0)
				if ga.Asset_is_playing(p) {
					fmt.eprintln(
						"FAIL sfx_oneshot: is_playing still true after a default-duration trigger — stuck voice",
					)
					all_pass = false
				}
			}
		}

	case "bpm_absent_defaults":
		// Project JSON with NO bpm field at all. build_project_from_raw must
		// default it to 120 — a raw 0 used to reach the generated
		// samples_per_step math as a divide-by-zero time base. The fixture has
		// no sequencer tracks on purpose: this is purely a data-defaulting
		// gate, plus a smoke render proving the patch still makes sound.
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			ga.Asset_init(p, sample_rate)
			if p.bpm != 120.0 {
				fmt.eprintfln(
					"FAIL bpm_absent_defaults: p.bpm = %.6f after init (expected 120 for a bpm-less project)",
					p.bpm,
				)
				all_pass = false
			}
			ga.Asset_note_on(p, 69, 1.0, 0.5)
			for i in 0 ..< len(buf) {
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			all_pass &= assert_audible(buf, .Left)
		}

	case "lfo_bus_cutoff":
		// SKB-017: the LFO modulates a Filter that sits DOWNSTREAM of the
		// Delay, so it has to be evaluated once per sample in the bus block.
		// Evaluated per voice — which is where it used to live — its output was
		// summed into the cross-domain accumulator, so the modulation depth
		// tracked the number of held notes and went to exactly ZERO once the
		// last voice released. That happens at ~0.25s here (0.2s duration plus
		// a 0.05s release) and the delay tail runs for seconds after it, so
		// pre-fix the whole tail was filtered at a dead-constant 3200 Hz.
		//
		// The LFO is 2 Hz, so sin() peaks at t=0.625s (cutoff 6200) and
		// troughs at t=0.875s (cutoff 200). Two 4096-sample windows centred on
		// those instants must therefore differ hugely in brightness.
		render_sfx_note_on_raw(buf, sample_rate, 69, 1.0, 0.2)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			WIN :: 4096 // fft_channel's power-of-two floor; pass it exactly
			bright_start := int(0.625 * sample_rate) - WIN / 2
			dark_start := int(0.875 * sample_rate) - WIN / 2
			spec_bright := fft_channel(buf[bright_start:bright_start + WIN], .Left)
			defer delete(spec_bright)
			spec_dark := fft_channel(buf[dark_start:dark_start + WIN], .Left)
			defer delete(spec_dark)
			c_bright := spectral_centroid(spec_bright, sample_rate)
			c_dark := spectral_centroid(spec_dark, sample_rate)
			if c_bright < 2.0 * c_dark {
				fmt.eprintfln(
					"FAIL lfo_bus_cutoff: tail centroid %.1fHz at the LFO peak vs %.1fHz at the trough — the bus filter is not being modulated once every voice is gone",
					c_bright,
					c_dark,
				)
				all_pass = false
			}
		}

	case "panner_center_unity":
		// SKB-013: the pan law was bare cos/sin, so pan 0 handed both channels
		// 0.7071 — inserting a Panner and leaving it centred cost 3 dB, i.e.
		// the neutral setting was not neutral. The oscillator is 0.5 and the
		// asset is limit:false, so "transparent" is the number 0.5, in both
		// channels. Note the constant-power check below passes BEFORE the fix
		// too: normalizing by sqrt(2) moves the 0 dB point without changing
		// the shape of the law, and that is the whole point.
		{
			if !render_panner_at(buf, sample_rate, 0.0) {
				fmt.eprintfln("FAIL panner_center_unity: set_param(\"pan\") was not accepted")
				all_pass = false
			}
			pl := compute_peak(buf, .Left)
			pr := compute_peak(buf, .Right)
			if abs(pl - 0.5) > 0.005 || abs(pr - 0.5) > 0.005 {
				fmt.eprintfln(
					"FAIL panner_center_unity: pan 0 peaks L=%.4f R=%.4f, expected 0.5 (unity) in both",
					pl, pr,
				)
				all_pass = false
			}
			hard := make([]Stereo_Sample, len(buf))
			defer delete(hard)
			render_panner_at(hard, sample_rate, -1.0)
			hl := compute_peak(hard, .Left)
			hr := compute_peak(hard, .Right)
			center_power := pl * pl + pr * pr
			hard_power := hl * hl + hr * hr
			if abs(hard_power - center_power) > 0.02 {
				fmt.eprintfln(
					"FAIL panner_center_unity: L^2+R^2 = %.4f centred vs %.4f hard-left — the law is not constant-power",
					center_power, hard_power,
				)
				all_pass = false
			}
			if hr > 0.01 {
				fmt.eprintfln(
					"FAIL panner_center_unity: pan -1 leaks %.4f into the right channel",
					hr,
				)
				all_pass = false
			}
			all_pass &= assert_audible(buf, .Left)
		}

	case "panner_mono_sum":
		// SKB-013, second half: the Panner's mono fallback was (L+R)*0.7071068,
		// which encodes pan as LEVEL — unity at centre, 0.7071 hard over. The
		// Gain downstream of the Panner reads that fallback, so the patch got
		// quieter as it was panned. A mono sum carries no pan information at
		// all, so the fallback is now a pass-through and the peak must be the
		// oscillator's own 0.5 at every pan position.
		{
			hard_ok := render_panner_at(buf, sample_rate, -1.0)
			hard_peak := compute_peak(buf, .Left)
			center := make([]Stereo_Sample, len(buf))
			defer delete(center)
			center_ok := render_panner_at(center, sample_rate, 0.0)
			center_peak := compute_peak(center, .Left)
			if !hard_ok || !center_ok {
				fmt.eprintfln("FAIL panner_mono_sum: set_param(\"pan\") was not accepted")
				all_pass = false
			}
			if abs(hard_peak - center_peak) > 0.005 {
				fmt.eprintfln(
					"FAIL panner_mono_sum: mono peak %.4f at pan -1 vs %.4f at pan 0 — the mono sum still tracks pan",
					hard_peak, center_peak,
				)
				all_pass = false
			}
			if abs(hard_peak - 0.5) > 0.005 {
				fmt.eprintfln(
					"FAIL panner_mono_sum: mono peak %.4f, expected the 0.5 input passed straight through",
					hard_peak,
				)
				all_pass = false
			}
			all_pass &= assert_audible(buf, .Left)
		}

	case "double_init":
		// SKB-018: _init assigned the scalars and the delay rings and left
		// everything else alone, so a second _init — a game reloading a level
		// on a processor it already used — resumed with the previous run's
		// voices still flagged active (the held note below allocated a SECOND
		// voice and both sounded) and the post-Delay filter mid-stream. Two
		// runs from _init with the same held note must be bit-identical; that
		// makes this a determinism assertion over the 12345 / 0xC0FFEE01 seeds
		// at the same time, which is why it compares samples and not features.
		{
			p := new(ga.Asset_Processor)
			defer free(p)
			BLOCK :: 1024
			first: [BLOCK]Stereo_Sample

			ga.Asset_init(p, sample_rate)
			ga.Asset_note_on(p, 69, 1.0, 0.0)
			for i in 0 ..< BLOCK {
				l, r := ga.Asset_process(p)
				first[i] = {l, r}
			}
			// Run on for a second to dirty everything the reset has to clear:
			// duration 0 holds the note (so the voice stays active), the delay
			// ring fills, and the bus filter's state is mid-stream.
			for _ in 0 ..< int(sample_rate) {
				ga.Asset_process(p)
			}

			ga.Asset_init(p, sample_rate)
			ga.Asset_note_on(p, 69, 1.0, 0.0)
			for i in 0 ..< len(buf) {
				l, r := ga.Asset_process(p)
				buf[i] = {l, r}
			}
			for i in 0 ..< BLOCK {
				if buf[i].l != first[i].l || buf[i].r != first[i].r {
					fmt.eprintfln(
						"FAIL double_init: sample %d differs after re-init: (%.9f, %.9f) vs (%.9f, %.9f)",
						i, buf[i].l, buf[i].r, first[i].l, first[i].r,
					)
					all_pass = false
					break
				}
			}
			// A patch that rendered silence would satisfy the comparison for
			// the wrong reason.
			all_pass &= assert_audible(buf, .Left)
		}

	case "note_velocity_clamp":
		// SKB-029: note_on's two arguments were used raw. This fixture authors
		// limit:false (so an over-unity peak reaches the buffer instead of
		// being folded by skald_soft_limit) and velocitySensitivity:1.0 (so
		// the envelope's gain IS the velocity), then asks for note 200 at
		// velocity 5.0. Unclamped that is a 2.5 peak — six dB past full
		// scale — at 440*2^((200-69)/12) ≈ 850kHz, which at 48k is not a
		// pitch at all but whatever it aliases to.
		render_sfx_note_on_raw(buf, sample_rate, 200, 5.0, 0.0)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			if peak := compute_peak(buf, .Both); peak > 1.0 {
				fmt.eprintfln(
					"FAIL note_velocity_clamp: peak %.4f exceeds full scale — velocity 5.0 was not clamped to 1.0",
					peak,
				)
				all_pass = false
			}
			// note clamps to 127, so the oscillator tracks 440*2^(58/12).
			all_pass &= assert_peak_freq(buf, sample_rate, 12543.85, 20.0, .Left)
		}

	case:
		fmt.eprintfln("unknown fixture: %q", fixture)
		os.exit(3)
	}

	if did_render && dump_path != "" {
		if !save_features(dump_path, extract_features(buf, sample_rate, .Both)) {
			fmt.eprintfln("FAIL: could not write feature vector to %q", dump_path)
			all_pass = false
		}
	}
	if did_render && wav_path != "" {
		if write_wav16(wav_path, buf, u32(sample_rate)) {
			fmt.printfln("WROTE %s", wav_path)
		} else {
			fmt.eprintfln("FAIL: could not write WAV to %q", wav_path)
			all_pass = false
		}
	}

	if all_pass {
		fmt.printfln("PASS %s", fixture)
		os.exit(0)
	}
	fmt.eprintfln("FAIL %s", fixture)
	os.exit(1)
}

// ----- Render helpers -----

render_sfx_one_shot :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	note: u8,
	velocity: f32,
	duration: f32,
) {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	ga.Asset_trigger(p, note, velocity, duration)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
}

// E5: unlike every other render_* helper, goes through the PROJECT wrapper
// (project_init/project_process), not the per-asset processor directly — the
// DC blocker lives on the master bus (project_process / the wasm shim's
// skald_process), not on the per-asset API, so only this path exercises it.
// See the note above codegen_project.odin's emit_dc_block_proc for why.
render_project_one_shot :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	note: u8,
	velocity: f32,
	duration: f32,
) {
	p: ga.Project_State
	ga.project_init(&p, sample_rate)
	defer ga.project_destroy(&p)
	ga.Asset_trigger(p.Asset, note, velocity, duration)
	for i in 0 ..< len(buf) {
		l, r := ga.project_process(&p)
		buf[i] = {l, r}
	}
}

// Hold one note with the Panner's `pan` driven to an explicit value first.
// Goes through the string setter so this compiles against every fixture; a
// fixture that does not expose `pan` gets `false` back and the caller reports
// it rather than silently measuring the authored value instead.
render_panner_at :: proc(buf: []Stereo_Sample, sample_rate: f32, pan: f32) -> bool {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	set_ok := ga.Asset_set_param(p, "pan", pan)
	ga.Asset_note_on(p, 69, 1.0, 0.0)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
	return set_ok
}

// Straight through _note_on, with whatever note and velocity the caller
// passes — no _trigger, which would substitute its own duration. Deliberately
// the raw path: a fixture that wants to prove the generated clamp bites has to
// be able to hand the generated code an argument outside its domain.
render_sfx_note_on_raw :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	note: u8,
	velocity: f32,
	duration: f32,
) {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	ga.Asset_note_on(p, note, velocity, duration)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
}

// Effect-asset path: no trigger, no sequencer — feed a 440Hz half-amplitude
// sine into the external input every sample and pull the processed output.
render_effect_feed :: proc(buf: []Stereo_Sample, sample_rate: f32) {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	for i in 0 ..< len(buf) {
		t := f32(i) / sample_rate
		s := math.sin(f32(2.0) * f32(math.PI) * f32(440.0) * t) * f32(0.5)
		ga.Asset_feed_input(p, s, s)
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
}

// Render one full-wet impulse through the Reverb effect fixture. When
// `set_runtime` is true, process a short idle prefix before calling the
// public setter, proving that a live change (not only init) drives the tap.
render_reverb_impulse :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	pre_delay: f32,
	set_runtime: bool,
) -> bool {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)

	set_ok := true
	if set_runtime {
		for _ in 0 ..< 32 {
			ga.Asset_feed_input(p, 0.0, 0.0)
			ga.Asset_process(p)
		}
		set_ok = ga.Asset_set_param(p, "preDelay", pre_delay)
	}

	for i in 0 ..< len(buf) {
		impulse: f32 = 0.0
		if i == 0 do impulse = 1.0
		ga.Asset_feed_input(p, impulse, impulse)
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
	return set_ok
}

render_music_layer :: proc(buf: []Stereo_Sample, sample_rate: f32) {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	ga.Asset_start(p)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
}

// Run a long-sustaining trigger and sweep `cutoff` from 200 → 4000 Hz over
// the render duration via the string-keyed setter. Using the string API
// (rather than `Asset_set_cutoff` directly) means this code compiles against
// any fixture, not just one that exposes cutoff — fixtures without an
// exposed cutoff get a no-op set_param call and the assertion fails honestly.
render_param_sweep :: proc(buf: []Stereo_Sample, sample_rate: f32) {
	p := new(ga.Asset_Processor)
	defer free(p)
	ga.Asset_init(p, sample_rate)
	// A4, held for the whole render. note_on(duration=0) is the manual
	// "hold until note_off" API; _trigger now auto-releases a 0 duration
	// after attack+decay (the one-shot contract), which would end this
	// note long before the sweep finishes.
	ga.Asset_note_on(p, 69, 1.0, 0.0)
	n := len(buf)
	for i in 0 ..< n {
		t := f32(i) / f32(n - 1)
		cutoff := f32(200.0) + t * f32(3800.0)
		ga.Asset_set_param(p, "cutoff", cutoff)
		l, r := ga.Asset_process(p)
		buf[i] = {l, r}
	}
}

// ----- Specialty assertions wired only from this file -----

assert_impulse_onset :: proc(
	buf: []Stereo_Sample,
	expected_sample: int,
	label: string,
) -> bool {
	actual := -1
	for sample, i in buf {
		if abs(sample.l) > 0.5 || abs(sample.r) > 0.5 {
			actual = i
			break
		}
	}
	if actual < 0 {
		fmt.eprintfln("FAIL %s: no impulse onset found", label)
		return false
	}
	if abs(actual - expected_sample) > 1 {
		fmt.eprintfln(
			"FAIL %s: onset sample %d, expected %d (tolerance 1 sample)",
			label, actual, expected_sample,
		)
		return false
	}
	fmt.printfln("PASS %s: onset sample %d (expected %d)", label, actual, expected_sample)
	return true
}

// Smoke: finite, non-clipping, no DC, audible. Used by Phase 5 mode:smoke.
run_smoke :: proc(buf: []Stereo_Sample, name: string) -> bool {
	ok := true
	clean, reason := buf_is_clean(buf)
	if !clean {
		fmt.eprintfln("FAIL [%s] smoke: %s", name, reason)
		ok = false
	}
	if dc := dc_offset(buf, .Both); abs(dc) > 0.05 {
		fmt.eprintfln("FAIL [%s] smoke: DC offset %.6f exceeds 0.05", name, dc)
		ok = false
	}
	if !assert_audible(buf, .Both, 0.005) {
		ok = false
	}
	return ok
}

// Energy in a window around `t` exceeds a small threshold — proves a kick
// (or any onset) happened at roughly that time.
assert_onset_at :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	t_s: f32,
	width_s: f32,
	min_rms: f32 = 0.02,
) -> bool {
	half := width_s * 0.5
	s := int((t_s - half) * sample_rate)
	e := int((t_s + half) * sample_rate)
	if s < 0 {
		s = 0
	}
	if e > len(buf) {
		e = len(buf)
	}
	if e - s <= 0 {
		fmt.eprintfln(
			"FAIL assert_onset_at: window around %.3fs is outside the buffer",
			t_s,
		)
		return false
	}
	rms := compute_rms(buf[s:e], .Both)
	if rms < min_rms {
		fmt.eprintfln(
			"FAIL assert_onset_at: RMS %.6f < %.6f around t=%.3fs (window=%.3fs)",
			rms,
			min_rms,
			t_s,
			width_s,
		)
		return false
	}
	return true
}

// Spectral centroid in the second half of the buffer differs from the
// first half by at least the given ratio (in either direction). Used for
// filter sweeps and exposed-parameter sweeps. Note: real centroid
// measurements are noisy; the prompt explicitly cautions against strict
// monotonicity, so this is intentionally a coarse threshold.
assert_centroid_shifts :: proc(buf: []Stereo_Sample, sample_rate: f32, min_ratio: f32) -> bool {
	half := len(buf) / 2
	if half < 4096 {
		fmt.eprintfln(
			"FAIL assert_centroid_shifts: buffer too short (%d samples)",
			len(buf),
		)
		return false
	}
	first_spec := fft_channel(buf[:half], .Both)
	defer delete(first_spec)
	second_spec := fft_channel(buf[half:], .Both)
	defer delete(second_spec)
	c1 := spectral_centroid(first_spec, sample_rate)
	c2 := spectral_centroid(second_spec, sample_rate)
	if c1 <= 0 || c2 <= 0 {
		fmt.eprintfln(
			"FAIL assert_centroid_shifts: invalid centroid (first=%.2f, second=%.2f)",
			c1,
			c2,
		)
		return false
	}
	r := c2 / c1
	if r < f32(1.0) {
		r = c1 / c2
	}
	if r < min_ratio {
		fmt.eprintfln(
			"FAIL assert_centroid_shifts: ratio %.3f < %.3f (first=%.2fHz, second=%.2fHz)",
			r,
			min_ratio,
			c1,
			c2,
		)
		return false
	}
	return true
}

// (Dead `fm_bell` switch case removed: no fm_bell.json fixture exists —
// the FM Operator path was never captured from the UI. Its
// assert_fm_has_sidebands helper went with it; recover both from git
// history if an fm_bell fixture is ever produced.)

// ----- FFT self-test -----

// Generates a known 440Hz sine into the buffer and runs the FFT-backed
// peak-frequency assertion. This is the load-bearing sanity check for
// the entire harness — if this fails, every fixture below it lies.
run_fft_self_test :: proc(buf: []Stereo_Sample, sample_rate: f32, all_pass: ^bool) {
	for i in 0 ..< len(buf) {
		t := f32(i) / sample_rate
		v := math.sin(f32(2.0) * f32(math.PI) * f32(440.0) * t) * f32(0.5)
		buf[i] = {v, v}
	}
	if !assert_audible(buf, .Left) {
		all_pass^ = false
	}
	if !assert_peak_freq(buf, sample_rate, 440.0, 5.0, .Left) {
		all_pass^ = false
	}
	// Same buffer, sliced — also verify the window form works.
	if !assert_peak_freq_in_window(
		buf,
		sample_rate,
		start_s = 0.5,
		end_s = 1.5,
		expected_hz = 440.0,
		tolerance_hz = 5.0,
	) {
		all_pass^ = false
	}
	// Stereo-differs MUST report ~0 on a mono signal. Compute the diff
	// directly here rather than calling assert_stereo_differs, because
	// that proc would print a misleading "FAIL" line to stderr.
	sum_sq: f32 = 0
	for s in buf {
		d := s.l - s.r
		sum_sq += d * d
	}
	mono_diff_rms := math.sqrt(sum_sq / f32(len(buf)))
	if mono_diff_rms > 0.001 {
		fmt.eprintfln(
			"FAIL self-test: mono buffer reports L-R RMS %.6f (expected ~0)",
			mono_diff_rms,
		)
		all_pass^ = false
	}
}
