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

	case "sfx_oneshot":
		// SFX with ADSR but no sequencer track. Trigger once with finite
		// duration, then assert silence after release ends.
		render_sfx_one_shot(buf, sample_rate, 69, 1.0, 0.3)
		if smoke_mode {
			all_pass &= run_smoke(buf, fixture)
		} else {
			all_pass &= assert_audible(buf, .Left)
			all_pass &= assert_silence_after(buf, sample_rate, 1.5)
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
	p: ga.Asset_Processor
	ga.Asset_init(&p, sample_rate)
	ga.Asset_trigger(&p, note, velocity, duration)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(&p)
		buf[i] = {l, r}
	}
}

render_music_layer :: proc(buf: []Stereo_Sample, sample_rate: f32) {
	p: ga.Asset_Processor
	ga.Asset_init(&p, sample_rate)
	ga.Asset_start(&p)
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(&p)
		buf[i] = {l, r}
	}
}

// Run a long-sustaining trigger and sweep `cutoff` from 200 → 4000 Hz over
// the render duration via the string-keyed setter. Using the string API
// (rather than `Asset_set_cutoff` directly) means this code compiles against
// any fixture, not just one that exposes cutoff — fixtures without an
// exposed cutoff get a no-op set_param call and the assertion fails honestly.
render_param_sweep :: proc(buf: []Stereo_Sample, sample_rate: f32) {
	p: ga.Asset_Processor
	ga.Asset_init(&p, sample_rate)
	ga.Asset_trigger(&p, 69, 1.0, 0.0) // A4, infinite duration
	n := len(buf)
	for i in 0 ..< n {
		t := f32(i) / f32(n - 1)
		cutoff := f32(200.0) + t * f32(3800.0)
		ga.Asset_set_param(&p, "cutoff", cutoff)
		l, r := ga.Asset_process(&p)
		buf[i] = {l, r}
	}
}

// ----- Specialty assertions wired only from this file -----

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
