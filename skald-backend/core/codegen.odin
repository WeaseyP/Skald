package skald_core

import "core:fmt"
import "core:strings"
import "core:math"
import rand "core:math/rand"
import json "core:encoding/json"

// =================================================================================
// SECTION D: Modular Code Generation Procedures
// =================================================================================

generate_oscillator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, instrument: ^Project_Instrument) {
	freq_str: string
	
	// Determine Base Frequency (Parameter OR Voice Frequency)
	base_freq_str := "voice.current_freq" // Priority 3: Default to voice frequency
	if val, ok := node.parameters["frequency"]; ok {
        #partial switch v in val {
		// Priority 2: Use fixed parameter if present
		case json.Float:
			base_freq_str = fmt.tprintf("%f", v)
		case json.Integer:
			base_freq_str = fmt.tprintf("%f", f64(v))
        }
	}

	// Apply Modulation (Priority 1: Exponential FM / V/Oct)
	// Apply Modulation (Priority 1: Exponential FM / V/Oct)
    // Sum all inputs to 'input_freq' before applying exponent
    input_sum_str := "0.0"
	if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input_freq")
        defer delete(sources)
        if len(sources) > 0 {
            sb_sum := strings.builder_make()
            defer strings.builder_destroy(&sb_sum)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb_sum, v)
                else do fmt.sbprintf(&sb_sum, " + %s", v)
            }
            input_sum_str = strings.to_string(sb_sum)
        }
    }
    
    if input_sum_str != "0.0" {
		// Base * 2^(SumInput)
		freq_str = fmt.tprintf("(%s) * math.pow(2.0, %s)", base_freq_str, input_sum_str)
	} else {
		freq_str = base_freq_str
	}

	amp_str  := get_f32_param(graph, node, "amplitude", "input_amp", 0.5)
	pw_str   := get_f32_param(graph, node, "pulseWidth", "input_pulseWidth", 0.5)
	phase_str:= get_f32_param(nil, node, "phase", "", 0.0)
	waveform := get_string_param(node, "waveform", "Sine")

	unison_count := instrument.unison
	detune_amount := instrument.detune

	fmt.sbprintf(sb, "\t\t// --- Oscillator Node %s (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %d;\n", unison_count)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%f);\n", detune_amount)
	fmt.sbprintf(sb, "\t\t\t\tdetuned_freq := (%s) * math.pow(2.0, detune_amount / 1200.0);\n", freq_str)
	fmt.sbprintf(sb, "\t\t\t\tphase_rads := f32(%s) * (f32(math.PI) / 180.0);\n", phase_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.osc_%s_phase[i] = math.mod(voice.osc_%s_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tfinal_phase := voice.osc_%s_phase[i] + phase_rads;\n", node.id)

	fmt.sbprint(sb, "\t\t\t\tswitch \"")
	fmt.sbprint(sb, waveform)
	fmt.sbprint(sb, "\" {\n")
	fmt.sbprint(sb, "\t\t\t\tcase \"Sawtooth\":\n")
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += ((final_phase / f32(math.PI)) - 1.0);\n")
	fmt.sbprint(sb, "\t\t\t\tcase \"Square\":\n")
	fmt.sbprintf(sb, "\t\t\t\t\tif math.sin(final_phase) > %s do unison_out += 1.0; else do unison_out -= 1.0;\n", pw_str)
	fmt.sbprint(sb, "\t\t\t\tcase \"Triangle\":\n")
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));\n")
	fmt.sbprint(sb, "\t\t\t\tcase:\n") // Default to Sine
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += math.sin(final_phase);\n")
	fmt.sbprint(sb, "\t\t\t\t}\n") // End of switch

	fmt.sbprint(sb, "\t\t\t}\n") // End of for loop
	fmt.sbprintf(sb, "\t\t\tif unison_count > 0 do node_%s_out = (unison_out / f32(unison_count)) * (%s);\n", node.id, amp_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_adsr_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "1.0"
    // Handle summed inputs for ADSR signal source (VCA behavior)
    if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input")
        defer delete(sources)
        if len(sources) > 0 {
            sb := strings.builder_make()
            defer strings.builder_destroy(&sb)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb, v)
                else do fmt.sbprintf(&sb, " + %s", v)
            }
            input_str = fmt.tprintf("(%s)", strings.to_string(sb))
        }
    }

	depth_str := get_f32_param(nil, node, "depth", "", 1.0)
    
    // Fetch ADSR parameters
    attack_str  := get_f32_param(graph, node, "attack", "input_attack", 0.01)
    decay_str   := get_f32_param(graph, node, "decay", "input_decay", 0.1)
    sustain_str := get_f32_param(graph, node, "sustain", "input_sustain", 0.7)
    release_str := get_f32_param(graph, node, "release", "input_release", 0.1)

	fmt.sbprintf(sb, "\t\t// --- ADSR Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprint(sb, "\t\t\tenvelope: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tswitch voice.adsr_%s_stage {{\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Idle:\n")
	fmt.sbprint(sb, "\t\t\t\tenvelope = 0.0;\n")
	fmt.sbprint(sb, "\t\t\tcase .Attack:\n")
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.age / (%s); else do envelope = 1.0;\n", attack_str, attack_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif voice.age >= (%s) {{\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Decay;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Decay:\n")
	fmt.sbprintf(sb, "\t\t\t\ttime_in_decay := voice.age - (%s);\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = 1.0 - (time_in_decay / (%s)) * (1.0 - (%s)); else do envelope = (%s);\n", decay_str, decay_str, sustain_str, sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif time_in_decay >= (%s) {{\n", decay_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Sustain;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Sustain:\n")
	fmt.sbprintf(sb, "\t\t\t\tenvelope = (%s);\n", sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Release:\n")
	fmt.sbprint(sb, "\t\t\t\ttime_in_release := voice.age - voice.time_released;\n")
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.adsr_%s_release_level * (1.0 - (time_in_release / (%s))); else do envelope = 0.0;\n", release_str, node.id, release_str)
	fmt.sbprint(sb, "\t\t\t\tif envelope <= 0 {\n")
	fmt.sbprint(sb, "\t\t\t\t\tenvelope = 0;\n")
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Idle;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * envelope * (%s);\n", node.id, input_str, depth_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_noise_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	amp_str := get_f32_param(graph, node, "amplitude", "input_amp", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Noise Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out = next_float32(&voice.noise_%s_rng) * (%s);\n\n", node.id, node.id, amp_str)
}

generate_filter_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	
	cutoff_str := get_f32_param(graph, node, "cutoff", "input_cutoff", 1000.0)
	res_str    := get_f32_param(graph, node, "resonance", "input_res", 1.0)
	f_type     := get_string_param(node, "type", "LowPass")

	fmt.sbprintf(sb, "\t\t// --- Filter Node %s (SVF) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Algorithm: Chamberlin SVF
	// f = 2 * sin(pi * cutoff / fs)
	// q = 1.0 / res
	// low = low + f * band
	// high = input - low - q*band
	// band = band + f * high
	fmt.sbprintf(sb, "\t\t\tf_%s := f32(2.0 * math.sin(f32(math.PI) * (%s) / sample_rate));\n", node.id, cutoff_str)
	fmt.sbprintf(sb, "\t\t\tq_%s := f32(1.0 / (%s));\n", node.id, res_str)
	
	fmt.sbprintf(sb, "\t\t\tvoice.filter_%s_low += f_%s * voice.filter_%s_band;\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\thigh_%s := f32((%s) - voice.filter_%s_low - q_%s * voice.filter_%s_band);\n", node.id, input_str, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.filter_%s_band += f_%s * high_%s;\n", node.id, node.id, node.id)

	switch f_type {
	case "HighPass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s;\n", node.id, node.id)
	case "BandPass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = voice.filter_%s_band;\n", node.id, node.id)
	case "Notch":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s + voice.filter_%s_low;\n", node.id, node.id, node.id)
	case: // LowPass
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = voice.filter_%s_low;\n", node.id, node.id)
	}
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_lfo_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	freq_str := get_f32_param(graph, node, "frequency", "", 5.0)
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	waveform := get_string_param(node, "waveform", "Sine")

	fmt.sbprintf(sb, "\t\t// --- LFO Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.lfo_%s_phase = math.mod(voice.lfo_%s_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, freq_str)

	switch waveform {
	case "Sawtooth":
		fmt.sbprintf(sb, "\t\tnode_%s_out = ((voice.lfo_%s_phase / f32(math.PI)) - 1.0) * (%s);\n\n", node.id, node.id, amp_str)
	case "Square":
		fmt.sbprintf(sb, "\t\tif math.sin(voice.lfo_%s_phase) > 0 do node_%s_out = %s; else do node_%s_out = -%s;\n\n", node.id, node.id, amp_str, node.id, amp_str)
	case "Triangle":
		fmt.sbprintf(sb, "\t\tnode_%s_out = (2.0 / f32(math.PI)) * math.asin(math.sin(voice.lfo_%s_phase)) * (%s);\n\n", node.id, node.id, amp_str)
	case: // "Sine"
		fmt.sbprintf(sb, "\t\tnode_%s_out = math.sin(voice.lfo_%s_phase) * (%s);\n\n", node.id, node.id, amp_str)
	}
}

generate_sample_hold_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	rate_str := get_f32_param(graph, node, "rate", "", 10.0)
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Sample & Hold Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.sh_%s_counter += 1;\n", node.id)
	fmt.sbprintf(sb, "\t\tupdate_interval_%s := u64(sample_rate / (%s));\n", node.id, rate_str)
	fmt.sbprintf(sb, "\t\tif voice.sh_%s_counter >= update_interval_%s {{\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.sh_%s_current_value = next_float32(&voice.sh_%s_rng) * 2.0 - 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.sh_%s_counter = 0;\n", node.id)
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprintf(sb, "\t\tnode_%s_out = voice.sh_%s_current_value * (%s);\n\n", node.id, node.id, amp_str)
}

generate_fm_operator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	// The modulator signal comes from the 'input_mod' port.
	mod_str := "0.0"
	if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input_mod")
        defer delete(sources)
        if len(sources) > 0 {
            sb_sum := strings.builder_make()
            defer strings.builder_destroy(&sb_sum)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb_sum, v)
                else do fmt.sbprintf(&sb_sum, " + %s", v)
            }
            mod_str = fmt.tprintf("(%s)", strings.to_string(sb_sum))
        }
    }

	// The base frequency for the carrier should come from the voice's current frequency.
	carrier_base_freq_str := "voice.current_freq"

	// Parameters from the node itself.
	// The UI sends 'frequency' which we will treat as the carrier-to-modulator frequency ratio.
	ratio_str := get_f32_param(nil, node, "frequency", "", 1.0)
	// The UI sends 'modIndex', which is the modulation depth.
	mod_index_str := get_f32_param(nil, node, "modIndex", "", 100.0)

	fmt.sbprintf(sb, "\t\t// --- FM Operator Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Calculate the actual carrier frequency by applying the ratio.
	fmt.sbprintf(sb, "\t\t\tcarrier_freq_%s := %s * (%s);\n", node.id, carrier_base_freq_str, ratio_str)
	// Increment the phase based on the carrier frequency.
	fmt.sbprintf(sb, "\t\t\tvoice.fm_%s_phase = math.mod(voice.fm_%s_phase + (2 * f32(math.PI) * carrier_freq_%s / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, node.id)
	// Calculate the final output. The modulator signal is multiplied by the modulation index and added to the phase.
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = math.sin(voice.fm_%s_phase + (%s) * (%s));\n", node.id, node.id, mod_str, mod_index_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_wavetable_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	freq_str := get_f32_param(graph, node, "frequency", "input_freq", 440.0)
	fmt.sbprintf(sb, "\t\t// --- Wavetable Node %s (Placeholder) ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.wavetable_%s_phase = math.mod(voice.wavetable_%s_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, freq_str)
	fmt.sbprintf(sb, "\t\tnode_%s_out = math.sin(voice.wavetable_%s_phase);\n\n", node.id, node.id)
}

generate_delay_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	time_str    := get_f32_param(graph, node, "delayTime", "", 0.5)
	fdbk_str    := get_f32_param(graph, node, "feedback", "", 0.5)
	mix_str     := get_f32_param(graph, node, "wetDryMix", "", 0.5)

	fmt.sbprintf(sb, "\t\t// --- Delay Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%s) * sample_rate, 0, %d-1));\n", node.id, time_str, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = (%s) + delayed_sample_%s * (%s);\n", node.id, node.id, input_str, node.id, fdbk_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_reverb_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	
	decay_str := get_f32_param(nil, node, "decay", "", 0.5)
	mix_str   := get_f32_param(nil, node, "mix", "", 0.5)
	
	delay_time := 0.075 

	fmt.sbprintf(sb, "\t\t// --- Reverb Node %s (Simple FDN) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%f) * sample_rate, 0, %d-1));\n", node.id, delay_time, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = (%s) + delayed_sample_%s * (%s);\n", node.id, node.id, input_str, node.id, decay_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_distortion_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	drive_str := get_f32_param(graph, node, "drive", "", 20.0)
	shape := get_string_param(node, "shape", "SoftClip")

	fmt.sbprintf(sb, "\t\t// --- Distortion Node %s ---\n", node.id)
	switch shape {
	case "HardClip":
		fmt.sbprintf(sb, "\t\tnode_%s_out = math.clamp((%s) * (%s), -1.0, 1.0);\n\n", node.id, input_str, drive_str)
	case: // "SoftClip"
		fmt.sbprintf(sb, "\t\tnode_%s_out = math.tanh((%s) * (%s));\n\n", node.id, input_str, drive_str)
	}
}

generate_mixer_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	fmt.sbprintf(sb, "\t\t// --- Mixer Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tmix_sum_%s: f32 = 0.0;\n", node.id)
	for i in 1..=8 {
		port_name := fmt.tprintf("input_%d", i)
		if id, port, ok := find_input_for_port(graph, node.id, port_name); ok {
			gain_param := fmt.tprintf("input_%d_gain", i)
			gain_str := get_f32_param(graph, node, gain_param, "", 0.75)
			fmt.sbprintf(sb, "\t\t\tmix_sum_%s += %s * (%s);\n", node.id, get_output_var(id, port), gain_str)
		}
	}
	fmt.sbprintf(sb, "\t\tnode_%s_out = mix_sum_%s;\n", node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_panner_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	pan_str := get_f32_param(graph, node, "pan", "input_pan", 0.0)
	fmt.sbprintf(sb, "\t\t// --- Panner Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tpan_angle_%s := ((%s) * 0.5 + 0.5) * f32(math.PI) / 2.0;\n", node.id, pan_str)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_left = (%s) * math.cos(pan_angle_%s);\n", node.id, input_str, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_right = (%s) * math.sin(pan_angle_%s);\n", node.id, input_str, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_mapper_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	
	inMin := get_f32_param(graph, node, "inMin", "", 0.0)
	inMax := get_f32_param(graph, node, "inMax", "", 1.0)
	outMin := get_f32_param(graph, node, "outMin", "", 0.0)
	outMax := get_f32_param(graph, node, "outMax", "", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Mapper Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out = math.lerp(f32(%s), f32(%s), math.clamp(((%s) - (%s)) / ((%s) - (%s)), 0.0, 1.0));\n\n", node.id, outMin, outMax, input_str, inMin, inMax, inMin)
}


generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, port, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id, port)
	
	gain_str := get_f32_param(graph, node, "gain", "input_gain", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Gain Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out = (%s) * (%s);\n\n", node.id, input_str, gain_str)
}

generate_midi_input_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	// MIDI Input Node outputs: Pitch (Hz), Gate (0.0 or 1.0), and Velocity (0.0 - 1.0)
	// These values are derived directly from the voice state, which is populated by the note_on event.

	fmt.sbprintf(sb, "\t\t// --- MIDI Input Node %s ---\n", node.id)
	// Output 1: Pitch (V/Oct relative to A4 440Hz -> (Note - 69) / 12.0)
	fmt.sbprintf(sb, "\t\tnode_%s_out_pitch := (f32(voice.note) - 69.0) / 12.0\n", node.id)
	// Output 2: Gate
	fmt.sbprintf(sb, "\t\tnode_%s_out_gate := f32(1.0)\n", node.id)
	// Output 3: Velocity
	fmt.sbprintf(sb, "\t\tnode_%s_out_velocity := voice.velocity\n\n", node.id)
}

// Generates note_on and note_off procedures for the test harness.
generate_note_on_off_code :: proc(sb: ^strings.Builder, subgraph_nodes: []Node, polyphony_str: string, has_adsr: bool, namespace_prefix: string) {
	fmt.sbprintf(sb, "// --- Note On/Off Handlers (%s) ---\n", namespace_prefix)

	// --- note_on ---
	fmt.sbprintf(sb, "note_on_%s :: proc(p: ^AudioProcessor_%s, note: u8, velocity: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(sb, "\t// Simple 'next available' voice stealing\n")
	fmt.sbprintf(sb, "\tvoice := &p.voices[p.next_voice_index];\n")

	fmt.sbprintf(sb, "\tp.next_voice_index = (p.next_voice_index + 1) %% %s;\n\n", polyphony_str)

	fmt.sbprint(sb, "\tvoice.is_active = true;\n")
	fmt.sbprint(sb, "\tvoice.note = note;\n")
	fmt.sbprint(sb, "\tvoice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);\n")
	fmt.sbprint(sb, "\tvoice.time_active = 0.0;\n")
	fmt.sbprint(sb, "\tvoice.velocity = velocity;\n")
	fmt.sbprint(sb, "\tvoice.time_released = 0.0;\n\n")

	if has_adsr {
		fmt.sbprint(sb, "\t// Trigger ADSR envelopes\n")
		for node in subgraph_nodes {
			if strings.to_lower(node.type) == "adsr" {
				fmt.sbprintf(sb, "\tvoice.adsr_%s_stage = .Attack;\n", node.id)
			}
		}
	}
	fmt.sbprint(sb, "}\n\n")


	// --- note_off ---
	fmt.sbprintf(sb, "note_off_%s :: proc(p: ^AudioProcessor_%s, note: u8) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprintf(sb, "\tfor i in 0..<%s {{\n", polyphony_str)
	fmt.sbprint(sb, "\t\tvoice := &p.voices[i];\n")
	fmt.sbprint(sb, "\t\tif voice.is_active && voice.note == note {\n")
	fmt.sbprint(sb, "\t\t\tvoice.time_released = voice.time_active;\n")
	if has_adsr {
		for node in subgraph_nodes {
			if strings.to_lower(node.type) == "adsr" {
				fmt.sbprintf(sb, "\t\t\tvoice.adsr_%s_stage = .Release;\n", node.id)
			}
		}
	} else {
        // If there's no ADSR, the note should just stop immediately.
        fmt.sbprint(sb, "\t\t\tvoice.is_active = false;\n")
    }
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprint(sb, "\t}\n")
	fmt.sbprint(sb, "}\n\n")
}


// generate_processor_code generates the Odin source code for the audio processor logic.
// It creates struct definitions, state management, and the `process_audio` function.
generate_processor_code :: proc(graph: ^Graph, instrument: ^Project_Instrument, namespace_prefix: string, include_header := true) -> string {
	
	// --- Extract Instrument Parameters ---
	polyphony := instrument.voice_count
	if polyphony <= 0 do polyphony = 1

    sb := strings.builder_make()
    // Caller converts to string, we return it.

	// --- Header ---
    if include_header {
	    fmt.sbprint(&sb, "package generated_audio\n\n")
	    fmt.sbprint(&sb, "import \"core:math\"\n")
	    fmt.sbprint(&sb, "import \"core:math/rand\"\n\n")
    }

	// --- Struct Definitions ---
	fmt.sbprintf(&sb, "%s_Voice_State :: struct {{\n", namespace_prefix)
	fmt.sbprint(&sb, "\tactive: bool,\n")
	fmt.sbprint(&sb, "\tnote: u8,\n")
	fmt.sbprint(&sb, "\tvelocity: f32,\n")
    fmt.sbprint(&sb, "\tage: f32,\n")
    fmt.sbprint(&sb, "\ttime_released: f32,\n")
	fmt.sbprint(&sb, "\tcurrent_freq: f32,\n")
	fmt.sbprint(&sb, "\ttarget_freq: f32,\n")
	fmt.sbprint(&sb, "\tglide_time: f32,\n")
    fmt.sbprint(&sb, "\tduration: f32,\n")

	// Generate state fields for nodes
	for _, node in graph.nodes {
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "\tosc_%s_phase: [%d]f32,\n", node.id, instrument.unison) 
		} else if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\tadsr_%s_stage: ADSR_Stage,\n", node.id)
			fmt.sbprintf(&sb, "\tadsr_%s_time: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tadsr_%s_value: f32,\n", node.id)
            fmt.sbprintf(&sb, "\tadsr_%s_release_level: f32,\n", node.id)
		} else if node.type == "Filter" {
			fmt.sbprintf(&sb, "\tfilter_%s_low: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tfilter_%s_band: f32,\n", node.id)
		} else if node.type == "LFO" {
			fmt.sbprintf(&sb, "\tlfo_%s_phase: f32,\n", node.id)
		} else if node.type == "FM" {
			fmt.sbprintf(&sb, "\tfm_%s_phase: f32,\n", node.id)
		} else if node.type == "Wavetable" {
			fmt.sbprintf(&sb, "\twavetable_%s_phase: f32,\n", node.id)
		} else if node.type == "Noise" {
			fmt.sbprintf(&sb, "\tnoise_%s_rng: PRNG_State,\n", node.id)
		} else if node.type == "SampleHold" {
			fmt.sbprintf(&sb, "\tsh_%s_counter: u64,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_rng: PRNG_State,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_current_value: f32,\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	// --- Processor State ---
	fmt.sbprintf(&sb, "%s_Processor :: struct {{\n", namespace_prefix)
	fmt.sbprintf(&sb, "\tsample_rate: f32,\n")
	fmt.sbprintf(&sb, "\tvoices: [%d]%s_Voice_State,\n", polyphony, namespace_prefix)
	fmt.sbprint(&sb, "\tnext_voice_idx: int,\n")
	fmt.sbprint(&sb, "\tprng: PRNG_State,\n")
    fmt.sbprint(&sb, "\ttotal_samples: u64,\n")
    
    // Generate Processor state fields (Global effects buffers)
	// Generate Processor state fields (Global effects buffers)
	for _, node in graph.nodes {
        // Delay and Reverb usage of delay buffer
		if node.type == "Delay" || node.type == "Reverb" {
			fmt.sbprintf(&sb, "\tdelay_%s_buffer: [96000]f32,\n", node.id) 
            fmt.sbprintf(&sb, "\tdelay_%s_write_index: int,\n", node.id)
		}
	}

    // NEW: Generate fields for Exposed Parameters
    // We map "paramName" to a field on the processor.
    // If multiple nodes expose the same name, they share the field.
    // We define the type as f32 (most common).
    
    // Helper map to avoid duplicates
    exposed_params := make(map[string]f32) 
    defer delete(exposed_params)

    for _, node in graph.nodes {
        if params_val, ok := node.parameters["exposedParameters"]; ok {
            if params_array, is_array := params_val.(json.Array); is_array {
                for p_val in params_array {
                    if p_name, is_str := p_val.(json.String); is_str {
                        // Find default value from the node parameters
                        def_val: f32 = 0.0
                        if val, ok := node.parameters[p_name]; ok {
                             #partial switch v in val {
                                case json.Float: def_val = f32(v)
                                case json.Integer: def_val = f32(v)
                             }
                        }
                        exposed_params[p_name] = def_val
                    }
                }
            }
        }
    }
    
    for name, _ in exposed_params {
        fmt.sbprintf(&sb, "\t%s: f32,\n", name)
    }

	fmt.sbprint(&sb, "}\n\n")
	
	// --- Initialization ---
	fmt.sbprintf(&sb, "%s_init :: proc(p: ^%s_Processor, sr: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tp.sample_rate = sr\n")
    fmt.sbprintf(&sb, "\tp.prng.state = 12345\n") 
    
    // Init Exposed Parameters
    for name, val in exposed_params {
        fmt.sbprintf(&sb, "\tp.%s = %f\n", name, val)
    }

	fmt.sbprint(&sb, "}\n\n")

	// --- Voice Management ---
	fmt.sbprintf(&sb, "%s_note_on :: proc(p: ^%s_Processor, note: u8, velocity: f32, duration: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tvoice_idx := -1\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tif !p.voices[i].active {\n")
	fmt.sbprint(&sb, "\t\t\tvoice_idx = i\n")
	fmt.sbprint(&sb, "\t\t\tbreak\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\tif voice_idx == -1 {\n")
	fmt.sbprint(&sb, "\t\tvoice_idx = p.next_voice_idx\n")
	fmt.sbprintf(&sb, "\t\tp.next_voice_idx = (p.next_voice_idx + 1) %% %d\n", polyphony)
	fmt.sbprint(&sb, "\t}\n\n")
	
	fmt.sbprint(&sb, "\tv := &p.voices[voice_idx]\n")
	fmt.sbprint(&sb, "\tv.active = true\n")
	fmt.sbprint(&sb, "\tv.note = note\n")
	fmt.sbprint(&sb, "\tv.velocity = velocity\n")
    fmt.sbprint(&sb, "\tv.age = 0.0\n")
    fmt.sbprint(&sb, "\tfreq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)\n")
	fmt.sbprint(&sb, "\tv.target_freq = freq\n")
	fmt.sbprint(&sb, "\tv.current_freq = freq\n") 
    fmt.sbprintf(&sb, "\tv.glide_time = %f\n", instrument.glide)
    fmt.sbprint(&sb, "\tv.duration = duration\n")
    
    // Reset Envelopes
	for _, node in graph.nodes {
		if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\tv.adsr_%s_stage = .Attack\n", node.id)
			fmt.sbprintf(&sb, "\tv.adsr_%s_time = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\tv.adsr_%s_value = 0.0\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(&sb, "%s_note_off :: proc(p: ^%s_Processor, note: u8) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tif p.voices[i].active && p.voices[i].note == note {\n")
    fmt.sbprint(&sb, "\t\t\treleasing := false\n")
    fmt.sbprint(&sb, "\t\t\tp.voices[i].time_released = p.voices[i].age\n")
	for _, node in graph.nodes {
		if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%s_stage = .Release\n", node.id)
            fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%s_release_level = p.voices[i].adsr_%s_value\n", node.id, node.id)
            fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%s_time = 0.0\n", node.id)
            fmt.sbprint(&sb, "\t\t\treleasing = true\n")
		}
	}
    fmt.sbprint(&sb, "\t\t\tif !releasing do p.voices[i].active = false\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "}\n\n")

	// --- Process Audio Function ---
	fmt.sbprintf(&sb, "%s_process :: proc(p: ^%s_Processor) -> f32 {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tsample_rate := p.sample_rate\n")
	fmt.sbprint(&sb, "\toutput: f32 = 0.0\n")
    
    // Increment time and process sequencing (Global per sample)
    // Process sequence FIRST (so we catch Step 0 at Sample 0)
    fmt.sbprintf(&sb, "\t%s_process_sequence(p)\n", namespace_prefix)
    fmt.sbprint(&sb, "\tp.total_samples += 1\n\n")
	
	fmt.sbprintf(&sb, "\tfor v_idx in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tvoice := &p.voices[v_idx]\n")
	fmt.sbprint(&sb, "\t\tif !voice.active do continue\n\n")
    // Increment voice age
    fmt.sbprint(&sb, "\t\tvoice.age += 1.0 / sample_rate;\n")
    
    // Auto-Release Check
    fmt.sbprint(&sb, "\t\tif voice.age >= voice.duration && voice.duration > 0.0 {\n")
	for _, node in graph.nodes {
		if node.type == "ADSR" {
            // Trigger Release
			fmt.sbprintf(&sb, "\t\t\tif voice.adsr_%s_stage != .Release && voice.adsr_%s_stage != .Idle {{\n", node.id, node.id)
			fmt.sbprintf(&sb, "\t\t\t\tvoice.adsr_%s_stage = .Release\n", node.id)
            fmt.sbprintf(&sb, "\t\t\t\tvoice.adsr_%s_release_level = voice.adsr_%s_value\n", node.id, node.id)
			fmt.sbprintf(&sb, "\t\t\t\tvoice.adsr_%s_time = 0.0\n", node.id)
			fmt.sbprint(&sb, "\t\t\t}\n")
		}
	}
    fmt.sbprint(&sb, "\t\t}\n")
    
    fmt.sbprint(&sb, "\t\tvoice_busy := false\n")

	// Variable declarations
	for _, node in graph.nodes {
		fmt.sbprintf(&sb, "\t\tnode_%s_out: f32 = 0.0\n", node.id)
	}
	fmt.sbprint(&sb, "\n")
	
    // --- Topological Sort & Generation ---
    sorted_nodes, _ := topological_sort(graph)
    defer delete(sorted_nodes)
    
    for node in sorted_nodes {
        switch node.type {
        case "Oscillator":
            // Fix: Pass 'instrument' pointer correctly
            generate_oscillator_code(&sb, node, graph, instrument)
        case "ADSR":
            generate_adsr_code(&sb, node, graph)
        case "Filter":
             generate_filter_code(&sb, node, graph)
        case "Gain":
             generate_gain_code(&sb, node, graph)
        case "Distortion":
             generate_distortion_code(&sb, node, graph)
        case "Delay":
             generate_delay_code(&sb, node, graph)
        case "Reverb":
             generate_reverb_code(&sb, node, graph)
        case "Noise":
             generate_noise_code(&sb, node, graph)
        case "Mixer":
             generate_mixer_code(&sb, node, graph)
        case "Mapper":
             generate_mapper_code(&sb, node, graph)
        case "MidiInput":
             generate_midi_input_code(&sb, node, graph)
        case "GraphOutput":
             if id, port, ok := find_input_for_port(graph, node.id, "input"); ok {
                  src := get_output_var(id, port)
                  fmt.sbprintf(&sb, "\t\toutput += %s\n", src)
             }
        }
    }
    

        // --- Voice Lifecycle Check ---
        // Voice remains active if ANY envelope is still running (not Idle)
        voice_busy := false
        has_adsr := false
        for _, node in graph.nodes {
            if node.type == "ADSR" {
                has_adsr = true
                fmt.sbprintf(&sb, "\t\tif voice.adsr_%s_stage != .Idle do voice_busy = true\n", node.id)
            }
        }
        
        if has_adsr {
            fmt.sbprint(&sb, "\t\tif !voice_busy do voice.active = false\n")
        } 
        
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\treturn output\n")
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}

// Generate Sequencer Logic
generate_sequencer_logic :: proc(sb: ^strings.Builder, instrument: ^Project_Instrument, namespace_prefix: string, project: ^Project) {
    // Find track
    current_track: ^Sequencer_Track = nil
    
    // Priority 1: Check internal graph tracks (Front-end currently injects here)
    if len(instrument.graph.sequencer_tracks) > 0 {
        current_track = &instrument.graph.sequencer_tracks[0]
    } else {
        // Priority 2: Check project global tracks
        for i in 0..<len(project.sequencer_tracks) {
            if project.sequencer_tracks[i].target_node_id == instrument.id {
                 current_track = &project.sequencer_tracks[i]
                 break
            }
        }
    }

    fmt.sbprintf(sb, "%s_process_sequence :: proc(p: ^%s_Processor) {{\n", namespace_prefix, namespace_prefix)
    
    if current_track != nil {
        // Calculate current step
        // We need BPM. Current codegen function signature didn't include Project passed to generate_processor_code, 
        // but we can assume bpm=120 or pass it. 
        // Wait, generate_processor_code logic above calls generate_oscillator_code.
        // I need to add 'project' to generate_processor_code arguments or hack it.
        // Actually, I can pass it.
        
        // Calculate current step
        bpm := project.bpm
        // samples_per_step is derived from BPM (16th notes)
        // 60 seconds / BPM = seconds per beat. / 4 = seconds per 16th.
        seconds_per_step := (60.0 / bpm) / 4.0
        samples_per_step := u64(seconds_per_step * 44100.0) 
        
        fmt.sbprintf(sb, "\tsamples_per_step := u64(%d)\n", samples_per_step)
        fmt.sbprint(sb, "\tcurrent_step := p.total_samples / samples_per_step\n")
        fmt.sbprint(sb, "\tif current_step * samples_per_step == p.total_samples {\n")
        
        // Generate switch for steps
        fmt.sbprint(sb, "\t\tstep_idx := current_step % 16\n")
        fmt.sbprint(sb, "\t\tswitch step_idx {\n")
        
        for event in current_track.events {
             // Using 'step' field directly
             fmt.sbprintf(sb, "\t\tcase %d:\n", event.step)
             
             // Scale duration (Steps) to Seconds
             duration_val := event.duration
             if duration_val <= 0.0 do duration_val = 1.0 // Default to 1 step
             
             duration_seconds := duration_val * seconds_per_step
             
             fmt.sbprintf(sb, "\t\t\t%s_note_on(p, %d, %f, %f)\n", namespace_prefix, event.note, event.velocity, duration_seconds)
        }
        fmt.sbprint(sb, "\t\t}\n")
        fmt.sbprint(sb, "\t}\n")
    }
    fmt.sbprint(sb, "}\n\n")
}

// --- Project Level Generation ---
generate_project_code :: proc(project: ^Project, project_name: string, package_name: string) -> string {
    sb := strings.builder_make()
    // defer strings.builder_destroy(&sb)


    fmt.sbprintf(&sb, "package %s\n\n", package_name)
    fmt.sbprint(&sb, "import \"core:math\"\n")
    fmt.sbprint(&sb, "import \"core:math/rand\"\n")
    fmt.sbprint(&sb, "\n")

    // Define Common Types (Always defined for standalone package)
    // Define PRNG State struct globally once
    fmt.sbprint(&sb, "\tPRNG_State :: struct {\n")
    fmt.sbprint(&sb, "\t\tstate: u32,\n")
    fmt.sbprint(&sb, "\t}\n\n")
    fmt.sbprint(&sb, "\tnext_float32 :: proc(rng: ^PRNG_State) -> f32 {\n")
    fmt.sbprint(&sb, "\t\tx := rng.state\n")
    fmt.sbprint(&sb, "\t\tx ~= x << 13\n")
    fmt.sbprint(&sb, "\t\tx ~= x >> 17\n")
    fmt.sbprint(&sb, "\t\tx ~= x << 5\n")
    fmt.sbprint(&sb, "\t\trng.state = x\n")
    fmt.sbprint(&sb, "\t\treturn f32(x) / 4294967296.0\n")
    fmt.sbprint(&sb, "\t}\n\n")
	
	// Define shared Enums (ADSR Stage)
	fmt.sbprint(&sb, "\tADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }\n\n")

    // Define Note_Event globally
	fmt.sbprint(&sb, "\tNote_Event :: struct {\n")
	fmt.sbprint(&sb, "\t\tnote: u8,\n")
	fmt.sbprint(&sb, "\t\tvelocity: f32,\n")
	fmt.sbprint(&sb, "\t\tstart_time: f32,\n")
    fmt.sbprint(&sb, "\t\tstep: int,\n")
	fmt.sbprint(&sb, "\t\tduration: f32,\n")
	fmt.sbprint(&sb, "\t}\n")


    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        // Clean name for usage in struct names
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        // Also handle empty names?
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)

        // We can now just call it with include_header=false and append directly
        code := generate_processor_code(&inst.graph, inst, clean_name, false)
        fmt.sbprint(&sb, code)
        
        // Generate Sequencer logic for this instrument
        generate_sequencer_logic(&sb, inst, clean_name, project)
    }

    // --- Generate Project Wrapper ---
    fmt.sbprint(&sb, "// --- Project Wrapper (Generic Interface) ---\n")
    fmt.sbprint(&sb, "Project_State :: struct {\n")
    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)
        fmt.sbprintf(&sb, "\t%s: ^%s_Processor,\n", clean_name, clean_name)
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_init :: proc(p: ^Project_State, sr: f32) {\n")
    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)
        fmt.sbprintf(&sb, "\tp.%s = new(%s_Processor)\n", clean_name, clean_name)
        fmt.sbprintf(&sb, "\t%s_init(p.%s, sr)\n", clean_name, clean_name)
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_process :: proc(p: ^Project_State) -> (f32, f32) {\n")
    fmt.sbprint(&sb, "\tmixed_out: f32 = 0.0\n")
    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)
        fmt.sbprintf(&sb, "\tmixed_out += %s_process(p.%s)\n", clean_name, clean_name)
    }
    // Simple mixing protection
    fmt.sbprintf(&sb, "\tmixed_out = mixed_out * %f\n", 0.5) // Global headroom/gain?
    fmt.sbprint(&sb, "\treturn mixed_out, mixed_out\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_destroy :: proc(p: ^Project_State) {\n")
    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)
        fmt.sbprintf(&sb, "\tfree(p.%s)\n", clean_name)
    }
    fmt.sbprint(&sb, "}\n\n")
    
    return strings.to_string(sb)
}
