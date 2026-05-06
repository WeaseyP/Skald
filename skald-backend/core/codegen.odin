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

	// BUG-WAVEFORM-CONST-SWITCH: previously emitted a runtime switch on a
	// codegen-time literal — every non-matching branch was dead. Now we
	// switch in Odin-land and emit only the chosen waveform expression.
	switch waveform {
	case "Sawtooth":
		fmt.sbprint(sb, "\t\t\t\tunison_out += ((final_phase / f32(math.PI)) - 1.0);\n")
	case "Square":
		fmt.sbprintf(
			sb,
			"\t\t\t\tif math.sin(final_phase) > %s do unison_out += 1.0; else do unison_out -= 1.0;\n",
			pw_str,
		)
	case "Triangle":
		fmt.sbprint(sb, "\t\t\t\tunison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));\n")
	case: // Default to Sine
		fmt.sbprint(sb, "\t\t\t\tunison_out += math.sin(final_phase);\n")
	}

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
	// BUG-MIXER-CHANNEL-LIMIT: read inputCount from node params instead of
	// hardcoding 8. The UI's MixerParams supports variable input counts;
	// previously inputs 9+ were silently dropped from the mix.
	input_count := 8
	if val, ok := node.parameters["inputCount"]; ok {
		#partial switch v in val {
		case json.Float:
			input_count = int(v)
		case json.Integer:
			input_count = int(v)
		}
	}
	if input_count < 1 {
		input_count = 1
	}
	if input_count > 32 {
		input_count = 32 // sanity cap; UI shouldn't go higher
	}

	fmt.sbprintf(sb, "\t\t// --- Mixer Node %s (%d inputs) ---\n", node.id, input_count)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tmix_sum_%s: f32 = 0.0;\n", node.id)
	for i in 1 ..= input_count {
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

// (BUG-DEAD-NOTE-ON-OFF removed: generate_note_on_off_code was an
// unreachable proc that emitted `note_on_<ns>` / `note_off_<ns>` against a
// nonexistent `AudioProcessor_<ns>` struct using `voice.is_active` instead of
// `voice.active`. The real public surface is `<Foo>_trigger`/`<Foo>_start` /
// `<Foo>_stop`, generated inline in generate_processor_code.)


// Detect whether an instrument is SFX or Music Layer. A track exists either
// inside the instrument's graph (injected by useCodeGeneration) or at the
// project level keyed by target_node_id.
//
// The UI auto-creates a track for every instrument, so track *presence* is
// not enough — we require at least one note event. SFX = no track or empty
// track; Music Layer = track with ≥1 event. This matches how a user
// distinguishes the two in the UI: clicking step cells to place notes turns
// an SFX into a Music Layer.
detect_asset_type :: proc(instrument: ^Project_Instrument, project: ^Project) -> Asset_Type {
	track := find_sequencer_track(instrument, project)
	if track != nil && len(track.events) > 0 {
		return .Music_Layer
	}
	return .SFX
}

// Returns the matching sequencer track (instrument-local takes priority over
// project-level) or nil if none.
find_sequencer_track :: proc(
	instrument: ^Project_Instrument,
	project: ^Project,
) -> ^Sequencer_Track {
	if len(instrument.graph.sequencer_tracks) > 0 {
		return &instrument.graph.sequencer_tracks[0]
	}
	for i in 0 ..< len(project.sequencer_tracks) {
		if project.sequencer_tracks[i].target_node_id == instrument.id {
			return &project.sequencer_tracks[i]
		}
	}
	return nil
}

// Sanitize an instrument name into a valid Odin identifier prefix.
clean_instrument_name :: proc(inst: ^Project_Instrument) -> string {
	out, _ := strings.replace_all(inst.name, " ", "_")
	if len(out) == 0 {
		out = fmt.tprintf("Instrument_%s", inst.id)
	}
	return out
}

// generate_processor_code generates the Odin source code for the audio processor logic.
// It creates struct definitions, state management, and the `process_audio` function.
generate_processor_code :: proc(
	graph: ^Graph,
	instrument: ^Project_Instrument,
	namespace_prefix: string,
	asset_type: Asset_Type,
	bpm: f32,
	include_header := true,
) -> string {
	
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
		} else if node.type == "FmOperator" {
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
	fmt.sbprintf(&sb, "\tbpm: f32,\n")
	fmt.sbprintf(&sb, "\tvoices: [%d]%s_Voice_State,\n", polyphony, namespace_prefix)
	fmt.sbprint(&sb, "\tnext_voice_idx: int,\n")
	fmt.sbprint(&sb, "\tprng: PRNG_State,\n")
    fmt.sbprint(&sb, "\ttotal_samples: u64,\n")
    // Music Layer transport (always present so the public API surface is
    // uniform across asset types; SFX simply doesn't read these fields).
    fmt.sbprint(&sb, "\tplaying: bool,\n")
    fmt.sbprint(&sb, "\tloop: bool,\n")
    fmt.sbprint(&sb, "\tcurrent_step: u64,\n")
    fmt.sbprint(&sb, "\tsamples_until_next_step: u64,\n")
    
    // Generate Processor state fields (Global effects buffers)
	// Generate Processor state fields (Global effects buffers)
	for _, node in graph.nodes {
        // Delay and Reverb usage of delay buffer
		if node.type == "Delay" || node.type == "Reverb" {
			fmt.sbprintf(&sb, "\tdelay_%s_buffer: [96000]f32,\n", node.id) 
            fmt.sbprintf(&sb, "\tdelay_%s_write_index: int,\n", node.id)
		}
	}

    // --- Phase 3: Exposed-parameter resolution ---
    // Walk every node, collect all exposed-parameter names, detect collisions
    // (>1 node exposing the same name), and assign a unique field name on
    // the processor struct. The result is stashed on the graph for later use
    // by get_f32_param (which emits `p.<field_name>`) and by the typed-setter
    // / PARAMS-table emission below.
    resolutions := make(map[string]Exposed_Resolution)
    {
        // Pass 1: count occurrences per param name.
        counts := make(map[string]int)
        defer delete(counts)
        for _, node in graph.nodes {
            if params_val, ok := node.parameters["exposedParameters"]; ok {
                if arr, is_arr := params_val.(json.Array); is_arr {
                    for p_val in arr {
                        if p_name, is_str := p_val.(json.String); is_str {
                            counts[p_name] += 1
                        }
                    }
                }
            }
        }

        // Pass 2: build resolutions with collision-aware field names.
        for _, node in graph.nodes {
            if params_val, ok := node.parameters["exposedParameters"]; ok {
                if arr, is_arr := params_val.(json.Array); is_arr {
                    for p_val in arr {
                        p_name, is_str := p_val.(json.String)
                        if !is_str do continue

                        rng := lookup_param_range(p_name)
                        def_val := rng.default
                        if val, found := node.parameters[p_name]; found {
                            #partial switch v in val {
                            case json.Float:   def_val = f32(v)
                            case json.Integer: def_val = f32(v)
                            }
                        }

                        field_name := p_name
                        if counts[p_name] > 1 {
                            // Collision: prefix with sanitized node label.
                            label := get_string_param(node, "label", node.id)
                            label, _ = strings.replace_all(label, " ", "_")
                            label, _ = strings.replace_all(label, "-", "_")
                            field_name = fmt.tprintf("%s_%s", label, p_name)
                        }

                        key := fmt.aprintf("%s::%s", node.id, p_name)
                        resolutions[key] = Exposed_Resolution{
                            field_name = field_name,
                            param_name = p_name,
                            node_id    = node.id,
                            default    = def_val,
                            range_min  = rng.min,
                            range_max  = rng.max,
                            unit       = rng.unit,
                        }
                    }
                }
            }
        }
    }
    graph.exposed_resolutions = resolutions

    // Emit a struct field per unique resolved field_name. Iteration order
    // over Odin maps is unspecified, but the codegen output is consumed
    // by Odin (which doesn't care about field order) so we don't sort.
    seen_fields := make(map[string]bool)
    defer delete(seen_fields)
    for _, res in resolutions {
        if !seen_fields[res.field_name] {
            seen_fields[res.field_name] = true
            fmt.sbprintf(&sb, "\t%s: f32,\n", res.field_name)
        }
    }

    fmt.sbprint(&sb, "}\n\n")
	
	// --- Initialization ---
	fmt.sbprintf(&sb, "%s_init :: proc(p: ^%s_Processor, sr: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tp.sample_rate = sr\n")
    fmt.sbprintf(&sb, "\tp.bpm = %f\n", bpm)
    fmt.sbprintf(&sb, "\tp.prng.state = 12345\n")
    fmt.sbprint(&sb, "\tp.loop = true\n")

    // Per-voice noise / sample-hold PRNGs need their own seeds so that
    // noise actually generates noise instead of xorshift32(0)=0 forever.
    // Each rng gets a unique deterministic seed per voice. Skip the loop
    // entirely when no Noise/SampleHold nodes exist, otherwise we'd emit
    // a for-loop with an empty body and Odin flags `v` as unused.
    needs_voice_rng_seed := false
    for _, node in graph.nodes {
        if node.type == "Noise" || node.type == "SampleHold" {
            needs_voice_rng_seed = true
            break
        }
    }
    if needs_voice_rng_seed {
        fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
        fmt.sbprint(&sb, "\t\tv := &p.voices[i]\n")
        voice_seed: u32 = 0xC0FFEE01
        for _, node in graph.nodes {
            if node.type == "Noise" {
                fmt.sbprintf(
                    &sb,
                    "\t\tv.noise_%s_rng.state = u32(0x%08X) ~ u32(i + 1) * 2654435761\n",
                    node.id,
                    voice_seed,
                )
                voice_seed += 1
            } else if node.type == "SampleHold" {
                fmt.sbprintf(
                    &sb,
                    "\t\tv.sh_%s_rng.state = u32(0x%08X) ~ u32(i + 1) * 2654435761\n",
                    node.id,
                    voice_seed,
                )
                voice_seed += 1
            }
        }
        fmt.sbprint(&sb, "\t}\n")
    }

    // Init Exposed Parameters using resolved field names. Iterate the same
    // seen-fields set so each field gets initialized exactly once even when
    // multiple nodes resolve to the same field (no-collision case).
    init_seen := make(map[string]bool)
    defer delete(init_seen)
    for _, res in resolutions {
        if !init_seen[res.field_name] {
            init_seen[res.field_name] = true
            fmt.sbprintf(&sb, "\tp.%s = %f\n", res.field_name, res.default)
        }
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

	// --- Public API (Phase 2 SFX / Music Layer surface) ---
	// Both proc shapes are emitted regardless of asset_type. The "wrong"
	// one for an asset type does the harmless thing: _trigger always fires
	// a one-shot; _start/_stop only matter when the sequencer is wired.
	// This keeps the acceptance harness's static symbol references valid
	// against any fixture.

	// _trigger: SFX one-shot. For Music Layer, fires an extra one-off note
	// on top of the running sequence. duration=0 plays through full envelope.
	fmt.sbprintf(
		&sb,
		"%s_trigger :: proc(p: ^%s_Processor, note: u8 = 60, velocity: f32 = 1.0, duration: f32 = 0.0) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprintf(&sb, "\t%s_note_on(p, note, velocity, duration)\n", namespace_prefix)
	fmt.sbprint(&sb, "}\n\n")

	// _start: Music Layer kick-off. Resets sequencer to step 0, sets playing.
	// For SFX (no sequencer track), this just flips a bool the _process loop
	// never reads — harmless.
	fmt.sbprintf(
		&sb,
		"%s_start :: proc(p: ^%s_Processor) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.playing = true\n")
	fmt.sbprint(&sb, "\tp.current_step = 0\n")
	fmt.sbprint(&sb, "\tp.samples_until_next_step = 0\n")
	fmt.sbprint(&sb, "}\n\n")

	// _stop: Music Layer halt. Voices in mid-envelope keep releasing naturally.
	fmt.sbprintf(
		&sb,
		"%s_stop :: proc(p: ^%s_Processor) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.playing = false\n")
	fmt.sbprint(&sb, "}\n\n")

	// _set_loop: Music Layer loop toggle. If false, the layer plays one full
	// pattern then stops itself.
	fmt.sbprintf(
		&sb,
		"%s_set_loop :: proc(p: ^%s_Processor, loop: bool) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.loop = loop\n")
	fmt.sbprint(&sb, "}\n\n")

	// _is_playing: true if the sequencer is running OR any voice is non-idle.
	fmt.sbprintf(
		&sb,
		"%s_is_playing :: proc(p: ^%s_Processor) -> bool {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tif p.playing do return true\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tif p.voices[i].active do return true\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\treturn false\n")
	fmt.sbprint(&sb, "}\n\n")

	// --- Phase 3: Exposed-parameter API ---
	// Collect a stable, deduplicated list of resolutions for this instrument
	// so we emit setters / PARAMS entries / dispatch arms in a consistent
	// order. Map iteration in Odin is unordered, so we copy out values once.
	stable_resolutions: [dynamic]Exposed_Resolution
	defer delete(stable_resolutions)
	stable_seen := make(map[string]bool)
	defer delete(stable_seen)
	for _, res in resolutions {
		if !stable_seen[res.field_name] {
			stable_seen[res.field_name] = true
			append(&stable_resolutions, res)
		}
	}

	// Typed setters: <Foo>_set_<field>(p, value) with min/max clamping
	// computed at codegen time from the param-range table.
	for res in stable_resolutions {
		fmt.sbprintf(
			&sb,
			"%s_set_%s :: proc(p: ^%s_Processor, value: f32) {{\n",
			namespace_prefix,
			res.field_name,
			namespace_prefix,
		)
		fmt.sbprint(&sb, "\tv := value\n")
		fmt.sbprintf(&sb, "\tif v < %f do v = %f\n", res.range_min, res.range_min)
		fmt.sbprintf(&sb, "\tif v > %f do v = %f\n", res.range_max, res.range_max)
		fmt.sbprintf(&sb, "\tp.%s = v\n", res.field_name)
		fmt.sbprint(&sb, "}\n\n")
	}

	// PARAMS introspection table — game tools / debug overlays / save-load
	// systems can iterate this to discover what's exposed on the asset.
	// `Skald_Param_Info` is shared across all instruments (defined once at
	// the file level by generate_project_code).
	fmt.sbprintf(&sb, "%s_PARAMS := []Skald_Param_Info{{\n", namespace_prefix)
	for res in stable_resolutions {
		fmt.sbprintf(
			&sb,
			"\t{{\"%s\", %f, %f, %f, \"%s\"}},\n",
			res.field_name,
			res.range_min,
			res.range_max,
			res.default,
			res.unit,
		)
	}
	fmt.sbprint(&sb, "}\n\n")

	// String-keyed setter for tooling. Switch dispatch — O(N) over a small
	// param count is fine; per the prompt, hot game code uses typed setters.
	fmt.sbprintf(
		&sb,
		"%s_set_param :: proc(p: ^%s_Processor, name: string, value: f32) -> bool {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	if len(stable_resolutions) > 0 {
		fmt.sbprint(&sb, "\tswitch name {\n")
		for res in stable_resolutions {
			fmt.sbprintf(&sb, "\tcase \"%s\":\n", res.field_name)
			fmt.sbprintf(&sb, "\t\t%s_set_%s(p, value)\n", namespace_prefix, res.field_name)
			fmt.sbprint(&sb, "\t\treturn true\n")
		}
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "\treturn false\n")
	fmt.sbprint(&sb, "}\n\n")

	// String-keyed getter (mirrors set_param). Returns (value, ok).
	fmt.sbprintf(
		&sb,
		"%s_get_param :: proc(p: ^%s_Processor, name: string) -> (f32, bool) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	if len(stable_resolutions) > 0 {
		fmt.sbprint(&sb, "\tswitch name {\n")
		for res in stable_resolutions {
			fmt.sbprintf(&sb, "\tcase \"%s\":\n", res.field_name)
			fmt.sbprintf(&sb, "\t\treturn p.%s, true\n", res.field_name)
		}
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "\treturn 0.0, false\n")
	fmt.sbprint(&sb, "}\n\n")

	// --- Process Audio Function ---
	fmt.sbprintf(
		&sb,
		"%s_process :: proc(p: ^%s_Processor) -> (f32, f32) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tsample_rate := p.sample_rate\n")
	fmt.sbprint(&sb, "\toutput_left: f32 = 0.0\n")
	fmt.sbprint(&sb, "\toutput_right: f32 = 0.0\n")

    // Sequencer only runs for Music Layer assets. The proc itself is
    // emitted for both types (as a no-op for SFX) so the symbol exists.
    if asset_type == .Music_Layer {
        fmt.sbprintf(&sb, "\t%s_process_sequence(p)\n", namespace_prefix)
    }
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

    // voice_busy is only read by the ADSR lifecycle block below. Emit it
    // only when at least one ADSR exists in the graph — otherwise Odin
    // flags it "declared but not used" for SFX without envelopes.
    has_adsr_in_graph := false
    for _, node in graph.nodes {
        if node.type == "ADSR" {
            has_adsr_in_graph = true
            break
        }
    }
    if has_adsr_in_graph {
        fmt.sbprint(&sb, "\t\tvoice_busy := false\n")
    }

	// Variable declarations. Every node gets a mono `node_<id>_out`. Panner
	// nodes also get `node_<id>_out_left` / `node_<id>_out_right` because
	// their codegen writes the stereo split into those names directly.
	for _, node in graph.nodes {
		fmt.sbprintf(&sb, "\t\tnode_%s_out: f32 = 0.0\n", node.id)
		if node.type == "Panner" {
			fmt.sbprintf(&sb, "\t\tnode_%s_out_left: f32 = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\t\tnode_%s_out_right: f32 = 0.0\n", node.id)
		}
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
        case "Panner":
             generate_panner_code(&sb, node, graph)
        case "LFO":
             generate_lfo_code(&sb, node, graph)
        case "FmOperator":
             generate_fm_operator_code(&sb, node, graph)
        case "Wavetable":
             generate_wavetable_code(&sb, node, graph)
        case "SampleHold":
             generate_sample_hold_code(&sb, node, graph)
        case "GraphOutput":
             // Phase 2 stereo routing: if the GraphOutput's source is a
             // Panner, route its left/right outputs to the L and R buses.
             // Any other source (mono) is broadcast to both channels.
             if id, _, ok := find_input_for_port(graph, node.id, "input"); ok {
                 src_node, found := graph.nodes[id]
                 if found && src_node.type == "Panner" {
                     fmt.sbprintf(&sb, "\t\toutput_left += node_%s_out_left\n", id)
                     fmt.sbprintf(&sb, "\t\toutput_right += node_%s_out_right\n", id)
                 } else {
                     fmt.sbprintf(&sb, "\t\toutput_left += node_%s_out\n", id)
                     fmt.sbprintf(&sb, "\t\toutput_right += node_%s_out\n", id)
                 }
             }
        }
    }
    

        // --- Voice Lifecycle Check ---
        // Voice remains active if ANY envelope is still running (not Idle).
        // For voices without an ADSR (rare), deactivate as soon as duration
        // expires — otherwise the voice slot is held forever and SFX without
        // an envelope plays indefinitely.
        has_adsr := false
        for _, node in graph.nodes {
            if node.type == "ADSR" {
                has_adsr = true
                fmt.sbprintf(&sb, "\t\tif voice.adsr_%s_stage != .Idle do voice_busy = true\n", node.id)
            }
        }

        if has_adsr {
            fmt.sbprint(&sb, "\t\tif !voice_busy do voice.active = false\n")
        } else {
            fmt.sbprint(
                &sb,
                "\t\tif voice.duration > 0.0 && voice.age >= voice.duration do voice.active = false\n",
            )
        }

	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\treturn output_left, output_right\n")
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}

// Generate Sequencer Logic. Always emits a `_process_sequence` proc, but for
// SFX (no track) the body is empty — the proc exists only so the symbol
// resolves uniformly. For Music Layer the body advances the step counter at
// runtime using p.sample_rate (BUG-SEQ-RATE: was hardcoded 44100).
//
// The counter pattern (samples_until_next_step) replaces the prior
// boundary-equality check (`current_step * samples_per_step == p.total_samples`)
// which only fired correctly when samples_per_step was integer-clean — broken
// for any sample-rate × BPM combination that didn't divide exactly.
generate_sequencer_logic :: proc(
	sb: ^strings.Builder,
	instrument: ^Project_Instrument,
	namespace_prefix: string,
	project: ^Project,
	asset_type: Asset_Type,
) {
	fmt.sbprintf(
		sb,
		"%s_process_sequence :: proc(p: ^%s_Processor) {{\n",
		namespace_prefix,
		namespace_prefix,
	)

	if asset_type != .Music_Layer {
		// SFX: emit the symbol as a no-op so _process can reference it
		// uniformly without an asset-type branch in the generated code.
		fmt.sbprint(sb, "}\n\n")
		return
	}

	track := find_sequencer_track(instrument, project)
	if track == nil {
		// Detected as Music_Layer but no track found — should not happen.
		fmt.sbprint(sb, "}\n\n")
		return
	}

	steps := track.num_steps
	if steps <= 0 {
		steps = 16
	}

	fmt.sbprint(sb, "\tif !p.playing do return\n")

	// samples_per_step recomputed each call so changes to p.sample_rate or
	// p.bpm at runtime take effect on the next step. Cheap (one mul one div).
	fmt.sbprint(
		sb,
		"\tsamples_per_step := u64(p.sample_rate * 60.0 / p.bpm / 4.0)\n",
	)

	// Fire-then-decrement: when the counter is 0, fire the current step's
	// events, advance, and reload the counter; otherwise just decrement.
	// _start sets samples_until_next_step=0 so step 0 fires on the first
	// process call after start.
	fmt.sbprint(sb, "\tif p.samples_until_next_step == 0 {\n")
	fmt.sbprintf(sb, "\t\tswitch p.current_step %% %d {{\n", steps)

	for event in track.events {
		fmt.sbprintf(sb, "\t\tcase %d:\n", event.step)
		duration_val := event.duration
		if duration_val <= 0.0 {
			duration_val = 1.0 // Default to 1 step
		}
		// duration is in steps; convert to seconds at runtime using p.bpm.
		// The generated code computes this from the runtime BPM/sample-rate
		// rather than baking it in. duration_seconds = duration_steps * seconds_per_step.
		fmt.sbprintf(
			sb,
			"\t\t\t%s_note_on(p, %d, %f, f32(%f) * (60.0 / p.bpm / 4.0))\n",
			namespace_prefix,
			event.note,
			event.velocity,
			duration_val,
		)
	}

	fmt.sbprint(sb, "\t\t}\n")

	// Advance step. Honor `loop`: if loop is false and we just finished the
	// last step, halt the layer.
	fmt.sbprint(sb, "\t\tp.current_step += 1\n")
	fmt.sbprintf(sb, "\t\tif p.current_step >= %d {{\n", steps)
	fmt.sbprint(sb, "\t\t\tif p.loop {\n")
	fmt.sbprint(sb, "\t\t\t\tp.current_step = 0\n")
	fmt.sbprint(sb, "\t\t\t} else {\n")
	fmt.sbprint(sb, "\t\t\t\tp.playing = false\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprint(sb, "\t\t}\n")

	// Reload counter. samples_per_step ≥ 1 in any realistic config; subtract
	// 1 so this same-call counter==0 fire doesn't get double-counted.
	fmt.sbprint(sb, "\t\tif samples_per_step > 0 {\n")
	fmt.sbprint(sb, "\t\t\tp.samples_until_next_step = samples_per_step - 1\n")
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprint(sb, "\t} else {\n")
	fmt.sbprint(sb, "\t\tp.samples_until_next_step -= 1\n")
	fmt.sbprint(sb, "\t}\n")

	fmt.sbprint(sb, "}\n\n")
}

// --- Project Level Generation ---
generate_project_code :: proc(project: ^Project, project_name: string, package_name: string) -> string {
    sb := strings.builder_make()
    // defer strings.builder_destroy(&sb)

    // Classify each instrument once so we can both emit the right per-asset
    // API and document the surface in the generated header comment.
    asset_types := make([]Asset_Type, len(project.instruments))
    defer delete(asset_types)
    for i in 0 ..< len(project.instruments) {
        asset_types[i] = detect_asset_type(&project.instruments[i], project)
    }

    // BUG-INSTRUMENT-NAME-DUPS: when multiple instruments share a name (or
    // multiple instruments fall back to the same `Instrument_<id>` default),
    // the previous codegen emitted duplicate struct fields and Odin refused
    // the file. Resolve unique namespace prefixes here once and reuse below
    // — first occurrence keeps the bare name, subsequent collisions append
    // _2 / _3 / ... so the order of instruments in the project drives which
    // one gets the unsuffixed name (UI iteration order is stable).
    unique_names := make([]string, len(project.instruments))
    defer delete(unique_names)
    {
        name_counts := make(map[string]int)
        defer delete(name_counts)
        for i in 0 ..< len(project.instruments) {
            base := clean_instrument_name(&project.instruments[i])
            count := name_counts[base]
            if count == 0 {
                unique_names[i] = base
            } else {
                unique_names[i] = fmt.aprintf("%s_%d", base, count + 1)
            }
            name_counts[base] = count + 1
        }
    }

    // --- Header doc comment ---
    fmt.sbprint(&sb, "// =====================================================================\n")
    fmt.sbprint(&sb, "// Generated by Skald.\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// SFX assets:")
    sfx_count := 0
    ml_count := 0
    for i in 0 ..< len(project.instruments) {
        if asset_types[i] == .SFX {
            fmt.sbprintf(&sb, " %s", unique_names[i])
            sfx_count += 1
        }
    }
    if sfx_count == 0 do fmt.sbprint(&sb, " (none)")
    fmt.sbprint(&sb, "\n")
    fmt.sbprint(&sb, "// Music Layer assets:")
    for i in 0 ..< len(project.instruments) {
        if asset_types[i] == .Music_Layer {
            fmt.sbprintf(&sb, " %s", unique_names[i])
            ml_count += 1
        }
    }
    if ml_count == 0 do fmt.sbprint(&sb, " (none)")
    fmt.sbprint(&sb, "\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// Game integration: import this package and use the per-asset APIs.\n")
    fmt.sbprint(&sb, "//   SFX:         <Foo>_init, <Foo>_trigger, <Foo>_process, <Foo>_is_playing\n")
    fmt.sbprint(&sb, "//   Music Layer: <Bar>_init, <Bar>_start, <Bar>_stop, <Bar>_process,\n")
    fmt.sbprint(&sb, "//                <Bar>_set_loop\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// project_init/process/destroy is a convenience wrapper for the test\n")
    fmt.sbprint(&sb, "// harness only — game code should consume per-asset procs directly.\n")
    fmt.sbprint(&sb, "// =====================================================================\n\n")

    fmt.sbprintf(&sb, "package %s\n\n", package_name)
    fmt.sbprint(&sb, "import \"core:math\"\n")
    fmt.sbprint(&sb, "import \"core:math/rand\"\n")
    fmt.sbprint(&sb, "\n")

    // Define Common Types (Always defined for standalone package)
    fmt.sbprint(&sb, "PRNG_State :: struct {\n")
    fmt.sbprint(&sb, "\tstate: u32,\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "next_float32 :: proc(rng: ^PRNG_State) -> f32 {\n")
    fmt.sbprint(&sb, "\tx := rng.state\n")
    fmt.sbprint(&sb, "\tx ~= x << 13\n")
    fmt.sbprint(&sb, "\tx ~= x >> 17\n")
    fmt.sbprint(&sb, "\tx ~= x << 5\n")
    fmt.sbprint(&sb, "\tif x == 0 do x = 0xDEADBEEF\n") // xorshift32 stuck-state guard
    fmt.sbprint(&sb, "\trng.state = x\n")
    fmt.sbprint(&sb, "\treturn f32(x) / 4294967296.0\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }\n\n")

    fmt.sbprint(&sb, "Note_Event :: struct {\n")
    fmt.sbprint(&sb, "\tnote: u8,\n")
    fmt.sbprint(&sb, "\tvelocity: f32,\n")
    fmt.sbprint(&sb, "\tstart_time: f32,\n")
    fmt.sbprint(&sb, "\tstep: int,\n")
    fmt.sbprint(&sb, "\tduration: f32,\n")
    fmt.sbprint(&sb, "}\n\n")

    // Shared introspection record for exposed parameters. Each instrument
    // emits a static `<Foo>_PARAMS := []Skald_Param_Info{...}` so tooling
    // can iterate and reflect on what's tunable on each asset.
    fmt.sbprint(&sb, "Skald_Param_Info :: struct {\n")
    fmt.sbprint(&sb, "\tname:    string,\n")
    fmt.sbprint(&sb, "\tmin:     f32,\n")
    fmt.sbprint(&sb, "\tmax:     f32,\n")
    fmt.sbprint(&sb, "\tdefault: f32,\n")
    fmt.sbprint(&sb, "\tunit:    string,\n")
    fmt.sbprint(&sb, "}\n\n")

    for i in 0 ..< len(project.instruments) {
        inst := &project.instruments[i]
        code := generate_processor_code(
            &inst.graph,
            inst,
            unique_names[i],
            asset_types[i],
            project.bpm,
            false,
        )
        fmt.sbprint(&sb, code)
        generate_sequencer_logic(&sb, inst, unique_names[i], project, asset_types[i])
    }

    // --- Project Wrapper (test-harness convenience; game code uses per-asset procs) ---
    fmt.sbprint(&sb, "// --- Project Wrapper (test-harness convenience) ---\n")
    fmt.sbprint(&sb, "Project_State :: struct {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\t%s: ^%s_Processor,\n", unique_names[i], unique_names[i])
    }
    fmt.sbprint(&sb, "}\n\n")

    // project_init: allocate per-asset processors, init, and auto-start any
    // Music Layer assets so the test harness produces audio without manual
    // intervention. Game code that consumes per-asset procs directly should
    // call <Bar>_start themselves.
    fmt.sbprint(&sb, "project_init :: proc(p: ^Project_State, sr: f32) {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tp.%s = new(%s_Processor)\n", n, n)
        fmt.sbprintf(&sb, "\t%s_init(p.%s, sr)\n", n, n)
        if asset_types[i] == .Music_Layer {
            fmt.sbprintf(&sb, "\t%s_start(p.%s)\n", n, n)
        }
    }
    fmt.sbprint(&sb, "}\n\n")

    // project_process: stereo summation across all assets with a per-channel
    // soft limiter (tanh). Without the limiter, three or more loud assets
    // overflow ±1.0 and clip on the device. The 0.7 factor preserves linear
    // response near zero while smoothly compressing peaks.
    fmt.sbprint(&sb, "project_process :: proc(p: ^Project_State) -> (f32, f32) {\n")
    fmt.sbprint(&sb, "\tmixed_left: f32 = 0.0\n")
    fmt.sbprint(&sb, "\tmixed_right: f32 = 0.0\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(
            &sb,
            "\t{{ l, r := %s_process(p.%s); mixed_left += l; mixed_right += r }}\n",
            n,
            n,
        )
    }
    fmt.sbprint(&sb, "\tmixed_left = math.tanh(mixed_left * 0.7) / 0.7\n")
    fmt.sbprint(&sb, "\tmixed_right = math.tanh(mixed_right * 0.7) / 0.7\n")
    fmt.sbprint(&sb, "\treturn mixed_left, mixed_right\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_destroy :: proc(p: ^Project_State) {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tfree(p.%s)\n", unique_names[i])
    }
    fmt.sbprint(&sb, "}\n\n")

    return strings.to_string(sb)
}
