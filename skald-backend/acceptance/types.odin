package main

Stereo_Sample :: struct {
	l, r: f32,
}

Channel :: enum {
	Left,
	Right,
	Both,
}

channel_value :: #force_inline proc(s: Stereo_Sample, ch: Channel) -> f32 {
	switch ch {
	case .Left:
		return s.l
	case .Right:
		return s.r
	case .Both:
		return (s.l + s.r) * 0.5
	}
	return 0
}
