package main

import "core:fmt"
import "core:os"
import "core:strconv"
import "core:strings"
import ga "generated_audio"

// =====================================================================
// Reusable "sound changes" primitive.
//
// Renders TWO buffers A and B from the SAME generated Asset under
// different inputs/state (different MIDI note, a different
// Asset_set_param value, or start-vs-trigger), extracts a small
// feature vector [RMS, dominant peak_freq, spectral_centroid] from
// each, and asserts both that the vectors differ beyond a relative
// threshold AND (optionally) that specific features moved in an
// expected direction.
//
// The feature-vector comparison (assert_features_change) is also
// reusable on its own: fixtures can dump their feature vector to a
// text file (-dump:<path>) and a later __compare_features__ run can
// assert a direction ACROSS fixtures — e.g. sine_220 → sine_440 must
// raise peak_freq. That cross-fixture path exists because the seed
// fixtures bake the oscillator frequency in as a constant, so no
// trigger input can change their pitch in-process.
// =====================================================================

Feature_Vector :: struct {
	rms:      f32,
	peak_hz:  f32,
	centroid: f32,
}

Direction :: enum {
	Any, // no direction expected; only the "differs" check applies
	Raise,
	Lower,
}

// Per-feature direction expectations for A → B. Zero value = all .Any.
Change_Expect :: struct {
	rms:      Direction,
	peak:     Direction,
	centroid: Direction,
}

Param_Set :: struct {
	name:  string,
	value: f32,
}

Render_Kind :: enum {
	Trigger, // SFX one-shot via Asset_trigger
	Start,   // Music Layer via Asset_start
}

// One render's worth of input/state. `params` are applied once via the
// string-keyed Asset_set_param right after init; a param name the asset
// does not expose fails the render (and the assertion) honestly.
Render_Spec :: struct {
	kind:     Render_Kind,
	note:     u8,
	velocity: f32,
	duration: f32,
	params:   []Param_Set,
}

extract_features :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	ch: Channel = .Both,
) -> Feature_Vector {
	fv: Feature_Vector
	fv.rms = compute_rms(buf, ch)
	spec := fft_channel(buf, ch)
	defer delete(spec)
	if len(spec) >= 4 {
		fv.peak_hz = peak_freq_from_fft(spec, sample_rate)
		fv.centroid = spectral_centroid(spec, sample_rate)
	}
	return fv
}

// |a-b| relative to the larger magnitude; 0 when both are ~0.
rel_delta :: proc(a, b: f32) -> f32 {
	m := max(abs(a), abs(b))
	if m < 1e-9 {
		return 0
	}
	return abs(a - b) / m
}

// Core comparison: (a) at least one feature differs by min_rel_delta,
// and (b) every feature with a non-Any expectation moved in that
// direction by at least min_rel_delta.
assert_features_change :: proc(
	a, b: Feature_Vector,
	label: string,
	min_rel_delta: f32 = 0.10,
	expect: Change_Expect = {},
) -> bool {
	d_rms := rel_delta(a.rms, b.rms)
	d_peak := rel_delta(a.peak_hz, b.peak_hz)
	d_cent := rel_delta(a.centroid, b.centroid)

	vectors := fmt.tprintf(
		"A=[rms=%.5f peak=%.2fHz centroid=%.2fHz] B=[rms=%.5f peak=%.2fHz centroid=%.2fHz]",
		a.rms, a.peak_hz, a.centroid, b.rms, b.peak_hz, b.centroid,
	)

	ok := true

	max_d := max(d_rms, max(d_peak, d_cent))
	if max_d < min_rel_delta {
		fmt.eprintfln(
			"FAIL assert_features_change[%s]: vectors too similar (max rel delta %.4f < %.4f) %s",
			label, max_d, min_rel_delta, vectors,
		)
		ok = false
	}

	check_dir :: proc(
		label: string,
		feature: string,
		va, vb: f32,
		d: f32,
		dir: Direction,
		min_rel_delta: f32,
		vectors: string,
	) -> bool {
		if dir == .Any {
			return true
		}
		raised := vb > va
		if (dir == .Raise && !raised) || (dir == .Lower && raised) || d < min_rel_delta {
			fmt.eprintfln(
				"FAIL assert_features_change[%s]: expected %s to %v (A=%.4f, B=%.4f, rel delta %.4f, need >= %.4f) %s",
				label, feature, dir, va, vb, d, min_rel_delta, vectors,
			)
			return false
		}
		return true
	}

	ok &= check_dir(label, "rms", a.rms, b.rms, d_rms, expect.rms, min_rel_delta, vectors)
	ok &= check_dir(label, "peak_freq", a.peak_hz, b.peak_hz, d_peak, expect.peak, min_rel_delta, vectors)
	ok &= check_dir(label, "centroid", a.centroid, b.centroid, d_cent, expect.centroid, min_rel_delta, vectors)
	return ok
}

// Render the generated Asset from a fresh processor per `spec`.
render_from_spec :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	spec: Render_Spec,
	label: string,
) -> bool {
	p: ga.Asset_Processor
	ga.Asset_init(&p, sample_rate)
	for ps in spec.params {
		if !ga.Asset_set_param(&p, ps.name, ps.value) {
			fmt.eprintfln(
				"FAIL render_from_spec[%s]: Asset_set_param(%q) rejected — parameter not exposed by this asset",
				label, ps.name,
			)
			return false
		}
	}
	switch spec.kind {
	case .Trigger:
		ga.Asset_trigger(&p, spec.note, spec.velocity, spec.duration)
	case .Start:
		ga.Asset_start(&p)
	}
	for i in 0 ..< len(buf) {
		l, r := ga.Asset_process(&p)
		buf[i] = {l, r}
	}
	return true
}

// The primitive: render A and B from the same Asset, compare features.
assert_sound_changes :: proc(
	sample_rate: f32,
	n_samples: int,
	spec_a: Render_Spec,
	spec_b: Render_Spec,
	label: string,
	min_rel_delta: f32 = 0.10,
	expect: Change_Expect = {},
	ch: Channel = .Both,
) -> bool {
	if n_samples < 1024 {
		fmt.eprintfln("FAIL assert_sound_changes[%s]: n_samples %d too small", label, n_samples)
		return false
	}
	buf_a := make([]Stereo_Sample, n_samples)
	defer delete(buf_a)
	buf_b := make([]Stereo_Sample, n_samples)
	defer delete(buf_b)
	if !render_from_spec(buf_a, sample_rate, spec_a, label) {
		return false
	}
	if !render_from_spec(buf_b, sample_rate, spec_b, label) {
		return false
	}
	fa := extract_features(buf_a, sample_rate, ch)
	fb := extract_features(buf_b, sample_rate, ch)
	return assert_features_change(fa, fb, label, min_rel_delta, expect)
}

// ----- Feature-vector persistence (cross-fixture comparisons) -----

// One line: "<rms> <peak_hz> <centroid>".
save_features :: proc(path: string, fv: Feature_Vector) -> bool {
	line := fmt.tprintf("%.8f %.4f %.4f\n", fv.rms, fv.peak_hz, fv.centroid)
	return os.write_entire_file(path, transmute([]u8)line)
}

load_features :: proc(path: string) -> (fv: Feature_Vector, ok: bool) {
	data, read_ok := os.read_entire_file(path)
	if !read_ok {
		fmt.eprintfln("FAIL load_features: cannot read %q", path)
		return {}, false
	}
	defer delete(data)
	parts := strings.fields(string(data))
	defer delete(parts)
	if len(parts) != 3 {
		fmt.eprintfln("FAIL load_features: %q has %d fields, expected 3", path, len(parts))
		return {}, false
	}
	vals: [3]f32
	for part, i in parts {
		v, parse_ok := strconv.parse_f32(part)
		if !parse_ok {
			fmt.eprintfln("FAIL load_features: %q field %d (%q) is not a float", path, i, part)
			return {}, false
		}
		vals[i] = v
	}
	return {rms = vals[0], peak_hz = vals[1], centroid = vals[2]}, true
}

parse_direction :: proc(s: string) -> (Direction, bool) {
	switch s {
	case "raise":
		return .Raise, true
	case "lower":
		return .Lower, true
	case "any":
		return .Any, true
	}
	return .Any, false
}
