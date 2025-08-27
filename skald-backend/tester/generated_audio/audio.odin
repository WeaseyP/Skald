package generated_audio

import "core:math"

// --- Local PRNG Implementation (xorshift32) ---
PRNG_State :: struct {
	state: u32,
}

// Generates the next u32 and updates the state.
next_u32 :: proc(rng: ^PRNG_State) -> u32 {
	x := rng.state;
	x = x ~ (x << 13);
	x = x ~ (x >> 17);
	x = x ~ (x << 5);
	rng.state = x;
	return x;
}

// Generates the next f32 in the range [-1.0, 1.0)
next_float32 :: proc(rng: ^PRNG_State) -> f32 {
	i := next_u32(rng) >> 8;
	return (f32(i) / f32(1<<24)) * 2.0 - 1.0;
}

// --- Voice State (Generated from Instrument subgraph) ---
Voice_State :: struct {
	noise_2_rng: PRNG_State,
	adsr_3_stage: ADSR_Stage,
	adsr_3_level_at_release: f32,
}

ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }

Voice :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	state: Voice_State,
}

AudioProcessor :: struct {
	voices: [8]Voice,
	next_voice_index: int,

	// Instrument Parameters
	attack:           f32,
	decay:            f32,
	sustain:          f32,
	release:          f32,

	// Global Effects State
	delay_1_buffer: [96000]f32,
	delay_1_write_index: int,
}

// --- Note On/Off Handlers ---
note_on :: proc(p: ^AudioProcessor, note: u8, velocity: f32) {
	// Simple 'next available' voice stealing
	voice := &p.voices[p.next_voice_index];
	p.next_voice_index = (p.next_voice_index + 1) % 8;

	voice.is_active = true;
	voice.note = note;
	voice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);
	voice.time_active = 0.0;
	voice.time_released = 0.0;

	// Trigger ADSR envelopes
	voice.state.adsr_3_stage = .Attack;
}

note_off :: proc(p: ^AudioProcessor, note: u8) {
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.state.adsr_3_stage = .Release;
		}
	}
}

init_processor :: proc(p: ^AudioProcessor) {
	// Initialize default instrument parameters on the processor
	p.attack = 0.027;
	p.decay = 0.133;
	p.sustain = 0.000;
	p.release = 0.240;

	// Initialize individual voice states
	for i in 0..<8 {
		v := &p.voices[i];
		v.state.noise_2_rng.state = u32(i * 31 + 17) | 1;
	}
}

// Processes a single voice
process_voice :: proc(p: ^AudioProcessor, voice: ^Voice, sample_rate: f32) -> f32 {
	node_2_out: f32;
	node_3_out: f32;
	node_1_out: f32;
	node_4_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- Noise Node 2 ---
		node_2_out = next_float32(&voice.state.noise_2_rng) * (0.232);

		// --- ADSR Node 3 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_3_stage %!(MISSING ARGUMENT)%!(MISSING CLOSE BRACE)			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_3_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_3_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_3_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_3_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_3_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_3_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_3_out = (node_2_out) * envelope * (1.000);
		}

		// --- Reverb Node 1 (Simple FDN) ---
		{
			delay_samples_1 := int(math.clamp((0.075) * sample_rate, 0, 96000-1));
			read_index_1 := (p.delay_1_write_index - delay_samples_1 + len(p.delay_1_buffer)) % len(p.delay_1_buffer);
			delayed_sample_1 := p.delay_1_buffer[read_index_1];
			p.delay_1_buffer[p.delay_1_write_index] = (node_3_out) + delayed_sample_1 * (0.100);
			p.delay_1_write_index = (p.delay_1_write_index + 1) % len(p.delay_1_buffer);
			node_1_out = (node_3_out) * (1.0 - (0.000)) + delayed_sample_1 * (0.000);
		}

	return node_1_out;
}

// --- Main Processing Function ---
process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	// NOTE: Event scheduling logic to trigger voices would go here, driven by a Note_Event array.
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
