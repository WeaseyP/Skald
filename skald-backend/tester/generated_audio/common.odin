package generated_audio

import "core:math"

// --- Shared Data Structures ---

Note_Event :: struct {
	note:       u8,
	velocity:   f32,
	start_time: f32, // In seconds
	duration:   f32, // In seconds
}

ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }

// --- Local PRNG Implementation (xorshift32) ---
// Shared by all generated processors to avoid redefining per file.

PRNG_State :: struct {
	state: u32,
}

// Generates the next u32 and updates the state.
next_u32 :: proc(rng: ^PRNG_State) -> u32 {
	x := rng.state
	x = x ~ (x << 13)
	x = x ~ (x >> 17)
	x = x ~ (x << 5)
	rng.state = x
	return x
}

// Generates the next f32 in the range [-1.0, 1.0)
next_float32 :: proc(rng: ^PRNG_State) -> f32 {
	i := next_u32(rng) >> 8
	return (f32(i) / f32(1<<24)) * 2.0 - 1.0
}
