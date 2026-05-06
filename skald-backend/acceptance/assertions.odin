package main

import "core:fmt"
import "core:math"

// All assert_* procs return true on pass and false on fail. On fail they
// print a single descriptive line to stderr starting with "FAIL " so the
// runner can grep for failures.

compute_rms :: proc(buf: []Stereo_Sample, ch: Channel) -> f32 {
	if len(buf) == 0 {
		return 0
	}
	sum_sq: f32 = 0
	for s in buf {
		v := channel_value(s, ch)
		sum_sq += v * v
	}
	return math.sqrt(sum_sq / f32(len(buf)))
}

compute_peak :: proc(buf: []Stereo_Sample, ch: Channel) -> f32 {
	peak: f32 = 0
	for s in buf {
		v := abs(channel_value(s, ch))
		if v > peak {
			peak = v
		}
	}
	return peak
}

// True if every sample is finite and within ±1.0 (post-limiter).
buf_is_clean :: proc(buf: []Stereo_Sample) -> (clean: bool, reason: string) {
	for s, i in buf {
		if !is_finite(s.l) || !is_finite(s.r) {
			return false, fmt.tprintf("non-finite sample at index %d (l=%v, r=%v)", i, s.l, s.r)
		}
		if abs(s.l) > 1.0 || abs(s.r) > 1.0 {
			return false, fmt.tprintf("clipped sample at index %d (l=%v, r=%v)", i, s.l, s.r)
		}
	}
	return true, ""
}

is_finite :: proc(x: f32) -> bool {
	// NaN: x != x. Inf: |x| > finite_max.
	if x != x {
		return false
	}
	if x > math.F32_MAX || x < -math.F32_MAX {
		return false
	}
	return true
}

dc_offset :: proc(buf: []Stereo_Sample, ch: Channel) -> f32 {
	if len(buf) == 0 {
		return 0
	}
	sum: f32 = 0
	for s in buf {
		sum += channel_value(s, ch)
	}
	return sum / f32(len(buf))
}

// ----- Public assertion procs -----

assert_silent :: proc(buf: []Stereo_Sample, ch: Channel) -> bool {
	rms := compute_rms(buf, ch)
	if rms >= 0.001 {
		fmt.eprintfln(
			"FAIL assert_silent: RMS %.6f >= 0.001 on %v channel",
			rms,
			ch,
		)
		return false
	}
	return true
}

assert_audible :: proc(buf: []Stereo_Sample, ch: Channel, min_rms: f32 = 0.05) -> bool {
	rms := compute_rms(buf, ch)
	if rms < min_rms {
		fmt.eprintfln(
			"FAIL assert_audible: RMS %.6f < %.6f on %v channel",
			rms,
			min_rms,
			ch,
		)
		return false
	}
	return true
}

assert_peak_freq :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	expected_hz: f32,
	tolerance_hz: f32,
	ch: Channel = .Left,
) -> bool {
	spec := fft_channel(buf, ch)
	defer delete(spec)
	if len(spec) < 4 {
		fmt.eprintfln(
			"FAIL assert_peak_freq: buffer too short for FFT (%d samples)",
			len(buf),
		)
		return false
	}
	got := peak_freq_from_fft(spec, sample_rate)
	if math.abs(got - expected_hz) > tolerance_hz {
		fmt.eprintfln(
			"FAIL assert_peak_freq: expected %.2fHz ±%.2f, got %.2fHz on %v channel",
			expected_hz,
			tolerance_hz,
			got,
			ch,
		)
		return false
	}
	return true
}

assert_peak_freq_in_window :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	start_s: f32,
	end_s: f32,
	expected_hz: f32,
	tolerance_hz: f32,
	ch: Channel = .Left,
) -> bool {
	start := int(start_s * sample_rate)
	end := int(end_s * sample_rate)
	if start < 0 {
		start = 0
	}
	if end > len(buf) {
		end = len(buf)
	}
	if end - start < 4 {
		fmt.eprintfln(
			"FAIL assert_peak_freq_in_window: window [%fs,%fs] too small (%d samples)",
			start_s,
			end_s,
			end - start,
		)
		return false
	}
	slice := buf[start:end]
	spec := fft_channel(slice, ch)
	defer delete(spec)
	if len(spec) < 4 {
		fmt.eprintfln(
			"FAIL assert_peak_freq_in_window: window FFT too short (%d samples)",
			end - start,
		)
		return false
	}
	got := peak_freq_from_fft(spec, sample_rate)
	if math.abs(got - expected_hz) > tolerance_hz {
		fmt.eprintfln(
			"FAIL assert_peak_freq_in_window: window [%fs,%fs] expected %.2fHz ±%.2f, got %.2fHz",
			start_s,
			end_s,
			expected_hz,
			tolerance_hz,
			got,
		)
		return false
	}
	return true
}

assert_stereo_differs :: proc(buf: []Stereo_Sample, min_rms_diff: f32 = 0.01) -> bool {
	if len(buf) == 0 {
		fmt.eprintln("FAIL assert_stereo_differs: empty buffer")
		return false
	}
	sum_sq: f32 = 0
	for s in buf {
		d := s.l - s.r
		sum_sq += d * d
	}
	rms_diff := math.sqrt(sum_sq / f32(len(buf)))
	if rms_diff < min_rms_diff {
		fmt.eprintfln(
			"FAIL assert_stereo_differs: RMS(L-R) = %.6f < %.6f",
			rms_diff,
			min_rms_diff,
		)
		return false
	}
	return true
}

// Verify a coarse ADSR shape by sampling RMS in 50ms windows. Requires:
//   - rising RMS during attack (window @ start vs. window @ attack_end_s)
//   - non-zero RMS during sustain
//   - falling RMS during release (window @ release_start_s vs. window @ release_start_s + 0.1s)
assert_envelope_shape :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	attack_end_s: f32,
	sustain_start_s: f32,
	release_start_s: f32,
	ch: Channel = .Left,
) -> bool {
	win :: 0.05 // 50ms
	// Window samples around a center time.
	rms_around :: proc(b: []Stereo_Sample, sr: f32, t: f32, w: f32, c: Channel) -> f32 {
		half := w * 0.5
		s := int((t - half) * sr)
		e := int((t + half) * sr)
		if s < 0 {
			s = 0
		}
		if e > len(b) {
			e = len(b)
		}
		if e - s <= 0 {
			return 0
		}
		return compute_rms(b[s:e], c)
	}

	// Probe just after start (mid-attack, ~25% of attack_end_s) to avoid the
	// dead zero at sample 0.
	attack_probe := attack_end_s * 0.5
	if attack_probe < win {
		attack_probe = win * 0.5
	}

	rms_attack_start := rms_around(buf, sample_rate, win * 0.5, win, ch)
	rms_attack_end := rms_around(buf, sample_rate, attack_end_s, win, ch)
	rms_sustain := rms_around(buf, sample_rate, sustain_start_s, win, ch)
	rms_release_start := rms_around(buf, sample_rate, release_start_s, win, ch)
	rms_release_late := rms_around(buf, sample_rate, release_start_s + 0.1, win, ch)

	if rms_attack_end <= rms_attack_start {
		fmt.eprintfln(
			"FAIL assert_envelope_shape: attack not rising (start=%.6f, end=%.6f)",
			rms_attack_start,
			rms_attack_end,
		)
		return false
	}
	if rms_sustain <= 0.0001 {
		fmt.eprintfln(
			"FAIL assert_envelope_shape: sustain RMS %.6f near zero (expected non-zero)",
			rms_sustain,
		)
		return false
	}
	if rms_release_late >= rms_release_start {
		fmt.eprintfln(
			"FAIL assert_envelope_shape: release not falling (release_start=%.6f, release+0.1s=%.6f)",
			rms_release_start,
			rms_release_late,
		)
		return false
	}
	return true
}

// SFX one-shot must return to silence after its envelope finishes.
assert_silence_after :: proc(
	buf: []Stereo_Sample,
	sample_rate: f32,
	after_s: f32,
	ch: Channel = .Both,
) -> bool {
	start := int(after_s * sample_rate)
	if start >= len(buf) {
		fmt.eprintfln(
			"FAIL assert_silence_after: after_s=%fs is past buffer end (%d samples)",
			after_s,
			len(buf),
		)
		return false
	}
	slice := buf[start:]
	rms := compute_rms(slice, ch)
	if rms >= 0.001 {
		fmt.eprintfln(
			"FAIL assert_silence_after: RMS %.6f >= 0.001 in [%fs, end] on %v channel",
			rms,
			after_s,
			ch,
		)
		return false
	}
	return true
}
