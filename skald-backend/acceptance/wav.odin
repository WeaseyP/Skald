package main

import "core:os"

// Minimal dependency-free 16-bit PCM stereo RIFF/WAVE writer. Exists so
// rendered acceptance buffers can be dumped to disk (behind the
// -wav:<path> flag) and later fed to an offline model (e.g. CLAP) for
// Layer-2 "does it sound like its tag" judging. Not on the audio path.

write_wav16 :: proc(path: string, buf: []Stereo_Sample, sample_rate: u32) -> bool {
	n := len(buf)
	data_bytes := n * 4 // 2 channels × 2 bytes/sample
	out := make([]u8, 44 + data_bytes)
	defer delete(out)

	put_u16le :: proc(b: []u8, v: u16) {
		b[0] = u8(v)
		b[1] = u8(v >> 8)
	}
	put_u32le :: proc(b: []u8, v: u32) {
		b[0] = u8(v)
		b[1] = u8(v >> 8)
		b[2] = u8(v >> 16)
		b[3] = u8(v >> 24)
	}
	to_i16 :: proc(x: f32) -> i16 {
		v := x
		if v > 1.0 {
			v = 1.0
		}
		if v < -1.0 {
			v = -1.0
		}
		return i16(v * 32767.0)
	}

	copy(out[0:4], "RIFF")
	put_u32le(out[4:8], u32(36 + data_bytes))
	copy(out[8:12], "WAVE")
	copy(out[12:16], "fmt ")
	put_u32le(out[16:20], 16) // fmt chunk size
	put_u16le(out[20:22], 1) // PCM
	put_u16le(out[22:24], 2) // stereo
	put_u32le(out[24:28], sample_rate)
	put_u32le(out[28:32], sample_rate * 4) // byte rate
	put_u16le(out[32:34], 4) // block align
	put_u16le(out[34:36], 16) // bits per sample
	copy(out[36:40], "data")
	put_u32le(out[40:44], u32(data_bytes))

	off := 44
	for s in buf {
		l := u16(to_i16(s.l))
		r := u16(to_i16(s.r))
		out[off] = u8(l)
		out[off + 1] = u8(l >> 8)
		out[off + 2] = u8(r)
		out[off + 3] = u8(r >> 8)
		off += 4
	}
	return os.write_entire_file(path, out)
}
