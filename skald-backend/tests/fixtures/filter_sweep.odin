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
	filter_3_low: f32,
	filter_3_band: f32,
	lfo_2_phase: f32,
	adsr_4_stage: ADSR_Stage,
	adsr_4_time: f32,
	adsr_4_value: f32,
	adsr_4_release_level: f32,
	osc_1_phase: [1]f32,
}

Asset_Processor :: struct {
	sample_rate: f32,
	voices: [8]Asset_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
	total_samples: u64,
}

Asset_init :: proc(p: ^Asset_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
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
	v.adsr_4_stage = .Attack
	v.adsr_4_time = 0.0
	v.adsr_4_value = 0.0
}

Asset_note_off :: proc(p: ^Asset_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].time_released = p.voices[i].age
			p.voices[i].adsr_4_stage = .Release
			p.voices[i].adsr_4_release_level = p.voices[i].adsr_4_value
			p.voices[i].adsr_4_time = 0.0
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
			if voice.adsr_4_stage != .Release && voice.adsr_4_stage != .Idle {
				voice.adsr_4_stage = .Release
				voice.adsr_4_release_level = voice.adsr_4_value
				voice.adsr_4_time = 0.0
			}
		}
		voice_busy := false
		node_3_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_4_out: f32 = 0.0
		node_1_out: f32 = 0.0

		// --- Oscillator Node 1 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (220.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.osc_1_phase[i] = math.mod(voice.osc_1_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.osc_1_phase[i] + phase_rads;
				switch "Sawtooth" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > 0.500 do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_1_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- Filter Node 3 (SVF) ---
		{
			f_3 := f32(2.0 * math.sin(f32(math.PI) * ((2000.000) + (node_2_out)) / sample_rate));
			q_3 := f32(1.0 / (1.000));
			voice.filter_3_low += f_3 * voice.filter_3_band;
			high_3 := f32((node_1_out) - voice.filter_3_low - q_3 * voice.filter_3_band);
			voice.filter_3_band += f_3 * high_3;
			node_3_out = voice.filter_3_low;
		}

		// --- ADSR Node 4 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_4_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (0.010) > 0 do envelope = voice.age / (0.010); else do envelope = 1.0;
				voice.adsr_4_release_level = envelope;
				if voice.age >= (0.010) {
					voice.adsr_4_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (0.010);
				if (0.000) > 0 do envelope = 1.0 - (time_in_decay / (0.000)) * (1.0 - (1.000)); else do envelope = (1.000);
				voice.adsr_4_release_level = envelope;
				if time_in_decay >= (0.000) {
					voice.adsr_4_stage = .Sustain;
				}
			case .Sustain:
				envelope = (1.000);
				voice.adsr_4_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (0.100) > 0 do envelope = voice.adsr_4_release_level * (1.0 - (time_in_release / (0.100))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_4_stage = .Idle;
				}
			}
			node_4_out = ((node_3_out)) * envelope * (1.000);
		}

		output += node_4_out
		if voice.adsr_4_stage != .Idle do voice_busy = true
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
		case 0:
			Asset_note_on(p, 60, 1.000, 2.000)
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

