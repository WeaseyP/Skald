package main

import "core:math"

// In-place Cooley-Tukey radix-2 FFT. Length of buf MUST be a power of two.
// Forward transform: X[k] = sum_{n=0}^{N-1} x[n] * exp(-2*pi*i*k*n/N).
// Magnitude (|X[k]|) is what the assertions read; sign convention does not
// affect peak-bin location.
fft_in_place :: proc(buf: []complex64) {
	n := u32(len(buf))
	if n < 2 {
		return
	}
	// Power-of-two check.
	if (n & (n - 1)) != 0 {
		return
	}

	log_n: u32 = 0
	for (u32(1) << log_n) < n {
		log_n += 1
	}

	// Bit-reversal permutation.
	for i in u32(0) ..< n {
		j := bit_reverse(i, log_n)
		if i < j {
			buf[i], buf[j] = buf[j], buf[i]
		}
	}

	// Iterative butterflies.
	size: u32 = 2
	for size <= n {
		half := size / 2
		ang := f32(-2.0) * f32(math.PI) / f32(size)
		w_step := complex(math.cos(ang), math.sin(ang))
		for k := u32(0); k < n; k += size {
			w: complex64 = complex(f32(1.0), f32(0.0))
			for j in u32(0) ..< half {
				t := w * buf[k + j + half]
				u := buf[k + j]
				buf[k + j] = u + t
				buf[k + j + half] = u - t
				w = w * w_step
			}
		}
		size *= 2
	}
}

bit_reverse :: proc(x: u32, log_n: u32) -> u32 {
	r: u32 = 0
	v := x
	for i in u32(0) ..< log_n {
		r = (r << 1) | (v & 1)
		v >>= 1
	}
	return r
}

// Largest power of two <= x, capped at max_n. Returns 0 for x < 2.
largest_pow2_le :: proc(x: int, max_n: int) -> int {
	if x < 2 {
		return 0
	}
	n := 1
	for n * 2 <= x && n * 2 <= max_n {
		n *= 2
	}
	return n
}

// Hann window applied to a real-valued copy of buf, returned as complex64.
// The window reduces spectral leakage so that off-bin frequencies still
// produce a clean peak at the closest bin.
window_to_complex :: proc(real_buf: []f32) -> []complex64 {
	n := len(real_buf)
	out := make([]complex64, n)
	for i in 0 ..< n {
		// Hann: w[i] = 0.5 * (1 - cos(2*pi*i/(N-1)))
		w := f32(0.5) * (f32(1.0) - math.cos(f32(2.0) * f32(math.PI) * f32(i) / f32(n - 1)))
		out[i] = complex(real_buf[i] * w, f32(0.0))
	}
	return out
}

// Find the bin (1..N/2) with maximum magnitude in the FFT result.
// Returns the corresponding frequency in Hz. Bin 0 (DC) is excluded so
// that a non-zero DC offset doesn't masquerade as a low-frequency peak.
peak_freq_from_fft :: proc(spec: []complex64, sample_rate: f32) -> f32 {
	n := len(spec)
	if n < 4 {
		return 0
	}
	max_mag_sq: f32 = 0
	max_bin := 1
	half := n / 2
	for k in 1 ..< half {
		re := real(spec[k])
		im := imag(spec[k])
		mag_sq := re * re + im * im
		if mag_sq > max_mag_sq {
			max_mag_sq = mag_sq
			max_bin = k
		}
	}
	return f32(max_bin) * sample_rate / f32(n)
}

// Spectral centroid (weighted mean of magnitude across bins, in Hz).
// Used by the filter-sweep assertion: the centroid moves up when a
// filter cutoff opens and down when it closes.
spectral_centroid :: proc(spec: []complex64, sample_rate: f32) -> f32 {
	n := len(spec)
	if n < 4 {
		return 0
	}
	half := n / 2
	num: f32 = 0
	den: f32 = 0
	for k in 1 ..< half {
		re := real(spec[k])
		im := imag(spec[k])
		mag := math.sqrt(re * re + im * im)
		freq := f32(k) * sample_rate / f32(n)
		num += freq * mag
		den += mag
	}
	if den <= 0 {
		return 0
	}
	return num / den
}

// Helper: extract one channel from a Stereo_Sample slice into a real f32 slice
// the FFT helpers can consume. Caller must `delete` the returned slice.
extract_channel :: proc(buf: []Stereo_Sample, ch: Channel) -> []f32 {
	out := make([]f32, len(buf))
	for i in 0 ..< len(buf) {
		out[i] = channel_value(buf[i], ch)
	}
	return out
}

// Convenience: window+FFT of a Stereo_Sample slice's channel, truncated to
// the largest power-of-two length up to `max_fft_len` (default 65536).
// Caller must `delete` the returned spectrum slice.
fft_channel :: proc(buf: []Stereo_Sample, ch: Channel, max_fft_len: int = 65536) -> []complex64 {
	n := largest_pow2_le(len(buf), max_fft_len)
	if n < 4 {
		return make([]complex64, 0)
	}
	real_buf := extract_channel(buf[:n], ch)
	defer delete(real_buf)
	spec := window_to_complex(real_buf)
	fft_in_place(spec)
	return spec
}
