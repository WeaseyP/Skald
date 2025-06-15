package generated_audio

import "core:math"
import rand "core:math/rand"
import "core:time"
import "base:runtime"

Noise_1_State :: struct {
	rand_source: rand.Generator,
	b0, b1, b2, b3, b4, b5, b6: f32,
}

AudioProcessor :: struct {
	noise_1: Noise_1_State,
}

init_processor :: proc(p: ^AudioProcessor) {
	noise_gen_1_state := new(runtime.Default_Random_State);
	noise_gen_1_state^ = rand.create(u64(time.now()._nsec));
	p.noise_1.rand_source = rand.default_random_generator(noise_gen_1_state);
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {
	node_1_out: f32
	node_2_out: f32

	// --- Noise Node 1 (White) ---
		old_gen := context.random_generator;
		context.random_generator = p.noise_1.rand_source;
		node_1_out = (rand.float32() * 2) - 1;
		context.random_generator = old_gen;
	

	node_2_out = node_1_out;
	return node_2_out, node_2_out;
}
