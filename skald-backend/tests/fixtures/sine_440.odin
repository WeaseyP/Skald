package Asset

import "core:math"
import "core:math/rand"

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
		step: int,
		duration: f32,
	}
Asset_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	time_released: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	duration: f32,
	adsr_2_stage: ADSR_Stage,
	adsr_2_time: f32,
	adsr_2_value: f32,
	adsr_2_release_level: f32,
	osc_1_phase: [1]f32,
}

Asset_Processor :: struct {
	sample_rate: f32,
	voices: [8]Asset_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
	total_samples: u64,
	depth: f32,
	decay: f32,
	phase: f32,
	sustain: f32,
	pulseWidth: f32,
	attack: f32,
	release: f32,
	amplitude: f32,
	frequency: f32,
}

Asset_init :: proc(p: ^Asset_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
	p.depth = 1.000
	p.decay = 0.050
	p.phase = 0.000
	p.sustain = 0.900
	p.pulseWidth = 0.500
	p.attack = 0.050
	p.release = 0.500
	p.amplitude = 0.500
	p.frequency = 440.000
}

Asset_note_on :: proc(p: ^Asset_Processor, note: u8, velocity: f32, duration: f32) {
	voice_idx := -1
	for i in 0..<8 {
		if !p.voices[i].active {
			voice_idx = i
			break
		}
	}
	if voice_idx == -1 {
		voice_idx = p.next_voice_idx
		p.next_voice_idx = (p.next_voice_idx + 1) % 8
	}

	v := &p.voices[voice_idx]
	v.active = true
	v.note = note
	v.velocity = velocity
	v.age = 0.0
	freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
	v.target_freq = freq
	v.current_freq = freq
	v.glide_time = 0.050
	v.duration = duration
	v.adsr_2_stage = .Attack
	v.adsr_2_time = 0.0
	v.adsr_2_value = 0.0
}

Asset_note_off :: proc(p: ^Asset_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].time_released = p.voices[i].age
			p.voices[i].adsr_2_stage = .Release
			p.voices[i].adsr_2_release_level = p.voices[i].adsr_2_value
			p.voices[i].adsr_2_time = 0.0
			releasing = true
			if !releasing do p.voices[i].active = false
		}
	}
}

Asset_process :: proc(p: ^Asset_Processor) -> f32 {
	sample_rate := p.sample_rate
	output: f32 = 0.0
	Asset_process_sequence(p)
	p.total_samples += 1

	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		voice.age += 1.0 / sample_rate;
		if voice.age >= voice.duration && voice.duration > 0.0 {
			if voice.adsr_2_stage != .Release && voice.adsr_2_stage != .Idle {
				voice.adsr_2_stage = .Release
				voice.adsr_2_release_level = voice.adsr_2_value
				voice.adsr_2_time = 0.0
			}
		}
		voice_busy := false
		node_3_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_1_out: f32 = 0.0

		// --- Oscillator Node 1 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (440.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(p.phase) * (f32(math.PI) / 180.0);
				voice.osc_1_phase[i] = math.mod(voice.osc_1_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.osc_1_phase[i] + phase_rads;
				switch "Sawtooth" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > p.pulseWidth do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_1_out = (unison_out / f32(unison_count)) * (p.amplitude);
		}

		// --- ADSR Node 2 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_2_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (p.attack) > 0 do envelope = voice.age / (p.attack); else do envelope = 1.0;
				voice.adsr_2_release_level = envelope;
				if voice.age >= (p.attack) {
					voice.adsr_2_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (p.attack);
				if (p.decay) > 0 do envelope = 1.0 - (time_in_decay / (p.decay)) * (1.0 - (p.sustain)); else do envelope = (p.sustain);
				voice.adsr_2_release_level = envelope;
				if time_in_decay >= (p.decay) {
					voice.adsr_2_stage = .Sustain;
				}
			case .Sustain:
				envelope = (p.sustain);
				voice.adsr_2_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (p.release) > 0 do envelope = voice.adsr_2_release_level * (1.0 - (time_in_release / (p.release))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_2_stage = .Idle;
				}
			}
			node_2_out = ((node_1_out)) * envelope * (p.depth);
		}

		output += node_2_out
		if voice.adsr_2_stage != .Idle do voice_busy = true
		if !voice_busy do voice.active = false
	}
	return output
}
Asset_process_sequence :: proc(p: ^Asset_Processor) {
	samples_per_step := u64(5512)
	current_step := p.total_samples / samples_per_step
	if current_step * samples_per_step == p.total_samples {
		step_idx := current_step % 16
		switch step_idx {
		}
	}
}

// --- Project Wrapper (Generic Interface) ---
Project_State :: struct {
	Asset: ^Asset_Processor,
}

project_init :: proc(p: ^Project_State, sr: f32) {
	p.Asset = new(Asset_Processor)
	Asset_init(p.Asset, sr)
}

project_process :: proc(p: ^Project_State) -> (f32, f32) {
	mixed_out: f32 = 0.0
	mixed_out += Asset_process(p.Asset)
	mixed_out = mixed_out * 0.500
	return mixed_out, mixed_out
}

project_destroy :: proc(p: ^Project_State) {
	free(p.Asset)
}

