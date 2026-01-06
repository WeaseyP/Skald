package generated_audio

import "core:math"
import "core:math/rand"

SKALD_TEST_HARNESS :: #config(SKALD_TEST_HARNESS, false)
when !SKALD_TEST_HARNESS {
	PRNG_State :: struct {
		state: u32,
	}

	next_float32 :: proc(rng: ^PRNG_State) -> f32 {
		x := rng.state
		x ~= x << 13
		x ~= x >> 17
		x ~= x << 5
		rng.state = x
		return f32(x) / 4294967296.0
	}

	ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }

	Note_Event :: struct {
		note: u8,
		velocity: f32,
		start_time: f32,
		duration: f32,
	}
}

