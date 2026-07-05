package skald_core

import "core:fmt"
import "core:os"
import "core:strings"
import "core:strconv"
import "core:math"
import rand "core:math/rand"
import json "core:encoding/json"

// BPM-sync resolution: when a node has bpmSync=true, its time base comes
// from the musical division in syncRate ("1/8", "1/4t", ... "1/1"; trailing
// 't' = triplet) instead of its free-run frequency/time param. Returns an
// Odin expression for SECONDS per cycle using the runtime p.bpm, so tempo
// changes keep synced nodes locked. These params serialized fine but were
// ignored by both preview and codegen — a synced LFO exported at whatever
// stale frequency the knob last held.
bpm_sync_seconds_expr :: proc(node: Node) -> (string, bool) {
	synced := false
	if v, ok := node.parameters["bpmSync"]; ok {
		if b, is_b := v.(json.Boolean); is_b do synced = bool(b)
	}
	if !synced do return "", false

	rate := get_string_param(node, "syncRate", "1/4")
	triplet := strings.has_suffix(rate, "t")
	core_str := rate
	if triplet do core_str = rate[:len(rate)-1]

	denom := 4
	if strings.has_prefix(core_str, "1/") {
		if n, ok := strconv.parse_int(core_str[2:]); ok && n > 0 {
			denom = n
		}
	} else if core_str == "1" {
		denom = 1
	}
	beats := 4.0 / f64(denom) // whole note = 4 beats
	if triplet do beats *= 2.0 / 3.0
	return fmt.tprintf("((60.0 / p.bpm) * %f)", beats), true
}

// Node types whose generated code reads per-voice context (pitch, envelope
// stage, note velocity). They can never run in the bus domain (after the
// voice-sum), because no single voice exists there.
is_voice_coupled_type :: proc(t: string) -> bool {
	switch t {
	case "Oscillator", "ADSR", "FmOperator", "Wavetable", "MidiInput":
		return true
	}
	return false
}

// Split the graph into voice domain and bus domain. Delay/Reverb hold ONE
// shared buffer on the processor — running them inside the per-voice loop
// divided the delay time by the active-voice count, bled voices into each
// other's feedback, and hard-cut the tail the instant the last voice died.
// They (and everything downstream of them) run once per sample on the
// summed voice signal instead.
compute_bus_domain :: proc(graph: ^Graph, sorted_nodes: []Node, inst_name: string) -> map[string]bool {
	bus_nodes := make(map[string]bool)
	for node in sorted_nodes {
		if node.type == "Delay" || node.type == "Reverb" {
			bus_nodes[node.id] = true
			continue
		}
		for conn in graph.connections {
			if conn.to_node == node.id && bus_nodes[conn.from_node] {
				bus_nodes[node.id] = true
				break
			}
		}
	}
	for node in sorted_nodes {
		if bus_nodes[node.id] && is_voice_coupled_type(node.type) {
			fmt.eprintf(
				"Error: instrument %q wires a %s node (%s) downstream of a Delay/Reverb. Envelopes, oscillators and MIDI nodes are per-voice and cannot process the post-voice effect bus. Move the %s before the effect.\n",
				inst_name, node.type, node.id, node.type,
			)
			os.exit(1)
		}
	}
	// MidiInput's port outputs are loop-local; feeding them into the bus
	// domain has no per-voice meaning either.
	for conn in graph.connections {
		if bus_nodes[conn.to_node] && !bus_nodes[conn.from_node] {
			if src, ok := graph.nodes[conn.from_node]; ok && src.type == "MidiInput" {
				fmt.eprintf(
					"Error: instrument %q wires MidiInput %s into a post-effect node (%s). Route MIDI signals through per-voice nodes before any Delay/Reverb.\n",
					inst_name, src.id, conn.to_node,
				)
				os.exit(1)
			}
		}
	}
	return bus_nodes
}

// =================================================================================
// SECTION D: Modular Code Generation Procedures
// =================================================================================

generate_oscillator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, instrument: ^Project_Instrument) {
	freq_str: string

	// The played note drives pitch, always. The UI serializes a `frequency`
	// param on every oscillator, and the old code inlined it as a constant
	// when present — which meant MIDI notes and the sequencer's piano roll
	// could never change pitch (every melody collapsed to one tone). The
	// preview's Voice.trigger() overwrites osc.frequency with the note
	// frequency on every trigger, so note-wins is also the parity-correct
	// semantic. voice.current_freq is set from the note at note_on.
	base_freq_str := "voice.current_freq"

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
		// Base * 2^(SumInput), exponent clamped to ±10 octaves: an over-hot
		// modulation sum used to overflow f32 in pow(), latch the phase
		// state to NaN, and permanently silence the voice.
		freq_str = fmt.tprintf("(%s) * math.pow(2.0, math.clamp(f32(%s), -10.0, 10.0))", base_freq_str, input_sum_str)
	} else {
		freq_str = base_freq_str
	}

	amp_str  := get_f32_param(graph, node, "amplitude", "input_amp", 0.5)
	pw_str   := get_f32_param(graph, node, "pulseWidth", "input_pulseWidth", 0.5)
	// graph (not nil) so an exposed `phase` resolves through the collision
	// map — two oscillators both exposing phase used to emit `p.phase`
	// against renamed struct fields and fail to compile.
	phase_str:= get_f32_param(graph, node, "phase", "", 0.0)
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
	// final_phase wrapped to [0, 2π): the phase-offset param used to push
	// sawtooth/square out of range (DC offset up to +2.0 on saw).
	fmt.sbprintf(sb, "\t\t\t\tfinal_phase := math.mod(voice.osc_%s_phase[i] + phase_rads, 2 * f32(math.PI));\n", node.id)

	// BUG-WAVEFORM-CONST-SWITCH: previously emitted a runtime switch on a
	// codegen-time literal — every non-matching branch was dead. Now we
	// switch in Odin-land and emit only the chosen waveform expression.
	switch waveform {
	case "Sawtooth":
		fmt.sbprint(sb, "\t\t\t\tunison_out += ((final_phase / f32(math.PI)) - 1.0);\n")
	case "Square":
		// True PWM: duty cycle == pulseWidth. The old sine-threshold
		// comparator gave 33% duty at the 0.5 default and pure DC silence
		// at pulseWidth=1.0.
		fmt.sbprintf(
			sb,
			"\t\t\t\tif final_phase < 2 * f32(math.PI) * math.clamp(f32(%s), 0.01, 0.99) do unison_out += 1.0; else do unison_out -= 1.0;\n",
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

	depth_str := get_f32_param(graph, node, "depth", "", 1.0)

    // Fetch ADSR parameters
    attack_str  := get_f32_param(graph, node, "attack", "input_attack", 0.01)
    decay_str   := get_f32_param(graph, node, "decay", "input_decay", 0.1)
    sustain_str := get_f32_param(graph, node, "sustain", "input_sustain", 0.7)
    release_str := get_f32_param(graph, node, "release", "input_release", 0.1)
    // velocitySensitivity: 0 = velocity ignored, 1 = envelope fully scaled
    // by note velocity. This is where sequencer velocity becomes audible.
    vs_str      := get_f32_param(graph, node, "velocitySensitivity", "", 0.5)

	fmt.sbprintf(sb, "\t\t// --- ADSR Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprint(sb, "\t\t\tenvelope: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tswitch voice.adsr_%s_stage {{\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Idle:\n")
	fmt.sbprint(sb, "\t\t\t\tenvelope = 0.0;\n")
	fmt.sbprint(sb, "\t\t\tcase .Attack:\n")
	// Denominators wrapped in math.max: a literal 0 for attack/decay/release
	// would emit a constant division by zero (compile error) even though the
	// `> 0` branch guards it at runtime.
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.age / math.max(f32(%s), 0.000001); else do envelope = 1.0;\n", attack_str, attack_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif voice.age >= (%s) {{\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Decay;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Decay:\n")
	fmt.sbprintf(sb, "\t\t\t\ttime_in_decay := voice.age - (%s);\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = 1.0 - (time_in_decay / math.max(f32(%s), 0.000001)) * (1.0 - (%s)); else do envelope = (%s);\n", decay_str, decay_str, sustain_str, sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif time_in_decay >= (%s) {{\n", decay_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Sustain;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Sustain:\n")
	fmt.sbprintf(sb, "\t\t\t\tenvelope = (%s);\n", sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	// A sustain level of ~0 (percussive envelope) held forever would keep
	// the voice allocated and is_playing latched true. Nothing audible
	// remains, so end the envelope.
	fmt.sbprintf(sb, "\t\t\t\tif envelope <= 0.0001 do voice.adsr_%s_stage = .Idle;\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Release:\n")
	fmt.sbprint(sb, "\t\t\t\ttime_in_release := voice.age - voice.time_released;\n")
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.adsr_%s_release_level * (1.0 - (time_in_release / math.max(f32(%s), 0.000001))); else do envelope = 0.0;\n", release_str, node.id, release_str)
	fmt.sbprint(sb, "\t\t\t\tif envelope <= 0 {\n")
	fmt.sbprint(sb, "\t\t\t\t\tenvelope = 0;\n")
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Idle;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tvel_scale_%s := (1.0 - (%s)) + (%s) * voice.velocity;\n", node.id, vs_str, vs_str)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * envelope * (%s) * vel_scale_%s;\n", node.id, input_str, depth_str, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_noise_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, sp: string) {
	amp_str := get_f32_param(graph, node, "amplitude", "input_amp", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Noise Node %s ---\n", node.id)
	// Bipolar: the raw PRNG is [0,1), which put a +0.5*amp DC offset on
	// every voice.
	fmt.sbprintf(sb, "\t\tnode_%s_out = (next_float32(&%snoise_%s_rng) * 2.0 - 1.0) * (%s);\n\n", node.id, sp, node.id, amp_str)
}

// sp is the state prefix: "voice." in the per-voice loop, "p." when the
// filter runs in the bus domain (downstream of a Delay/Reverb).
generate_filter_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, sp: string) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	cutoff_str := get_f32_param(graph, node, "cutoff", "input_cutoff", 1000.0)
	res_str    := get_f32_param(graph, node, "resonance", "input_res", 1.0)
	f_type     := get_string_param(node, "type", "LowPass")

	fmt.sbprintf(sb, "\t\t// --- Filter Node %s (SVF) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Algorithm: Chamberlin SVF
	//   f = 2 * sin(pi * cutoff / fs), damping q = 1/res
	//   low += f*band; high = input - low - q*band; band += f*high
	// Stability requires BOTH clamps, at point of use (cutoff and resonance
	// can be driven by graph modulation to any value):
	//   - cutoff <= ~fs/6: beyond it the integrator diverges to ±Inf
	//     (reproduced at cutoff=20000 @ 44.1k/48k).
	//   - damping q <= ~(1.9 - f): res < 1 (fully legal in the UI) blows up
	//     at cutoffs as low as 1.5 kHz otherwise. Low floor 0.05 keeps high
	//     resonance ringing but bounded.
	fmt.sbprintf(sb, "\t\t\tcutoff_c_%s := math.clamp(f32(%s), 10.0, sample_rate * 0.16);\n", node.id, cutoff_str)
	fmt.sbprintf(sb, "\t\t\tf_%s := f32(2.0 * math.sin(f32(math.PI) * cutoff_c_%s / sample_rate));\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tq_%s := math.clamp(1.0 / math.max(f32(%s), 0.1), 0.05, 1.9 - f_%s);\n", node.id, res_str, node.id)

	fmt.sbprintf(sb, "\t\t\t%sfilter_%s_low += f_%s * %sfilter_%s_band;\n", sp, node.id, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\thigh_%s := f32((%s) - %sfilter_%s_low - q_%s * %sfilter_%s_band);\n", node.id, input_str, sp, node.id, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\t%sfilter_%s_band += f_%s * high_%s;\n", sp, node.id, node.id, node.id)

	// UI type strings are 'Lowpass'/'Highpass'/'Bandpass'/'Notch'; older
	// fixtures say 'LowPass'/'HighPass'/'BandPass'. Match case-insensitively
	// — 'Highpass' used to silently generate a lowpass.
	switch strings.to_lower(f_type, context.temp_allocator) {
	case "highpass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s;\n", node.id, node.id)
	case "bandpass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = %sfilter_%s_band;\n", node.id, sp, node.id)
	case "notch":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s + %sfilter_%s_low;\n", node.id, node.id, sp, node.id)
	case: // Lowpass
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = %sfilter_%s_low;\n", node.id, sp, node.id)
	}
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_lfo_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, sp: string) {
	freq_str := get_f32_param(graph, node, "frequency", "", 5.0)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		freq_str = fmt.tprintf("(1.0 / %s)", sec_expr)
	}
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	waveform := get_string_param(node, "waveform", "Sine")

	fmt.sbprintf(sb, "\t\t// --- LFO Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\t%slfo_%s_phase = math.mod(%slfo_%s_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", sp, node.id, sp, node.id, freq_str)
	// Negative frequency (legal via exposed params) drives math.mod negative
	// — the sawtooth branch then outputs [-3,-1] instead of [-1,1].
	fmt.sbprintf(sb, "\t\tif %slfo_%s_phase < 0.0 do %slfo_%s_phase += 2 * f32(math.PI);\n", sp, node.id, sp, node.id)

	switch waveform {
	case "Sawtooth":
		fmt.sbprintf(sb, "\t\tnode_%s_out = ((%slfo_%s_phase / f32(math.PI)) - 1.0) * (%s);\n\n", node.id, sp, node.id, amp_str)
	case "Square":
		fmt.sbprintf(sb, "\t\tif math.sin(%slfo_%s_phase) > 0 do node_%s_out = %s; else do node_%s_out = -%s;\n\n", sp, node.id, node.id, amp_str, node.id, amp_str)
	case "Triangle":
		fmt.sbprintf(sb, "\t\tnode_%s_out = (2.0 / f32(math.PI)) * math.asin(math.sin(%slfo_%s_phase)) * (%s);\n\n", node.id, sp, node.id, amp_str)
	case: // "Sine"
		fmt.sbprintf(sb, "\t\tnode_%s_out = math.sin(%slfo_%s_phase) * (%s);\n\n", node.id, sp, node.id, amp_str)
	}
}

generate_sample_hold_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, sp: string) {
	rate_str := get_f32_param(graph, node, "rate", "", 10.0)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		rate_str = fmt.tprintf("(1.0 / %s)", sec_expr)
	}
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Sample & Hold Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\t%ssh_%s_counter += 1;\n", sp, node.id)
	// max(): rate=0 emitted a constant division by zero (compile error);
	// negative rates cast to a bogus u64. Clamp to the param-range minimum.
	fmt.sbprintf(sb, "\t\tupdate_interval_%s := u64(sample_rate / math.max(f32(%s), 0.1));\n", node.id, rate_str)
	fmt.sbprintf(sb, "\t\tif %ssh_%s_counter >= update_interval_%s {{\n", sp, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t%ssh_%s_current_value = next_float32(&%ssh_%s_rng) * 2.0 - 1.0;\n", sp, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\t%ssh_%s_counter = 0;\n", sp, node.id)
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprintf(sb, "\t\tnode_%s_out = %ssh_%s_current_value * (%s);\n\n", node.id, sp, node.id, amp_str)
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
	ratio_str := get_f32_param(graph, node, "frequency", "", 1.0)
	// The UI sends 'modIndex', which is the modulation depth.
	mod_index_str := get_f32_param(graph, node, "modIndex", "", 100.0)

	fmt.sbprintf(sb, "\t\t// --- FM Operator Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Ratio clamped to [0.01, 32]: legacy saves carry the old UI default of
	// 440 in this param, which as a raw ratio put the carrier at ~190kHz.
	fmt.sbprintf(sb, "\t\t\tcarrier_freq_%s := %s * math.clamp(f32(%s), 0.01, 32.0);\n", node.id, carrier_base_freq_str, ratio_str)
	// Increment the phase based on the carrier frequency.
	fmt.sbprintf(sb, "\t\t\tvoice.fm_%s_phase = math.mod(voice.fm_%s_phase + (2 * f32(math.PI) * carrier_freq_%s / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, node.id)
	// Calculate the final output. The modulator signal is multiplied by the modulation index and added to the phase.
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = math.sin(voice.fm_%s_phase + (%s) * (%s));\n", node.id, node.id, mod_str, mod_index_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_wavetable_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	// Pitch tracks the played note (same note-wins semantic as Oscillator;
	// this node used to bake `frequency` in and play 440 for every note).
	// input_freq modulation uses the same exponential V/Oct convention.
	freq_str := "voice.current_freq"
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
			freq_str = fmt.tprintf("voice.current_freq * math.pow(2.0, math.clamp(f32(%s), -10.0, 10.0))", strings.to_string(sb_sum))
		}
	}
	// position morphs sine→triangle→saw→square (0..3, matching the preview
	// worklet); input_pos modulation sums into it. The node used to be a
	// placeholder that discarded tableName/position/input_pos and always
	// played a sine.
	pos_str := get_f32_param(graph, node, "position", "input_pos", 0.0)
	amp_str := get_f32_param(graph, node, "amplitude", "input_amp", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Wavetable Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.wavetable_%s_phase = math.mod(voice.wavetable_%s_phase + ((%s) / sample_rate), 1.0);\n", node.id, node.id, freq_str)
	fmt.sbprintf(sb, "\t\tif voice.wavetable_%s_phase < 0.0 do voice.wavetable_%s_phase += 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out = skald_wavetable_sample(voice.wavetable_%s_phase, f32(%s)) * (%s);\n\n", node.id, node.id, pos_str, amp_str)
}

generate_delay_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	time_str    := get_f32_param(graph, node, "delayTime", "", 0.5)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		time_str = sec_expr
	}
	fdbk_str    := get_f32_param(graph, node, "feedback", "", 0.5)
	// The UI serializes this as `mix`; `wetDryMix` is the legacy key. Read
	// both (mix wins) — the UI's wet/dry slider was silently ignored and
	// codegen always ran at the stale default.
	mix_str     := get_f32_param(graph, node, "mix", "", 0.5)
	if _, has_mix := node.parameters["mix"]; !has_mix {
		mix_str = get_f32_param(graph, node, "wetDryMix", "", 0.5)
	}

	fmt.sbprintf(sb, "\t\t// --- Delay Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Min 1 sample: delayTime=0 made read_index == write_index, which reads
	// the slot from one full buffer wrap ago — a 2-second delay, not 0ms.
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%s) * sample_rate, 1, %d-1));\n", node.id, time_str, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	// Feedback clamped below 1 at point of use — literal or modulated
	// feedback >= 1 diverges geometrically (and the buffer NaN-latches the
	// whole processor, not just one voice).
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = (%s) + delayed_sample_%s * math.clamp(f32(%s), 0.0, 0.95);\n", node.id, node.id, input_str, node.id, fdbk_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_reverb_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	// graph (not nil): the UI's DEFAULT exposure set has both ADSR and
	// Reverb exposing "decay" — the nil path emitted `p.decay` against the
	// collision-renamed fields and the generated package didn't compile.
	decay_str := get_f32_param(graph, node, "decay", "", 0.5)
	mix_str   := get_f32_param(graph, node, "mix", "", 0.5)
	
	delay_time := 0.075 

	fmt.sbprintf(sb, "\t\t// --- Reverb Node %s (Simple FDN) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%f) * sample_rate, 0, %d-1));\n", node.id, delay_time, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	// decay is a TIME in the UI (seconds) but a feedback GAIN here; the UI
	// default of 3.0 diverged exponentially. Map RT60-style: gain such that
	// the 75ms tap decays 60dB over `decay` seconds, hard-capped below 1.
	fmt.sbprintf(sb, "\t\t\tdecay_gain_%s := math.clamp(math.pow(f32(0.001), f32(0.075) / math.max(f32(%s), 0.01)), 0.0, 0.95);\n", node.id, decay_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = (%s) + delayed_sample_%s * decay_gain_%s;\n", node.id, node.id, input_str, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

// Canonical contract = the preview's WaveShaper graph: shape curve →
// one-pole lowpass at `tone` Hz → wet/dry `mix`. The old codegen matched
// shape strings the UI never sends ('SoftClip'/'HardClip'), dropped tone
// and mix entirely, and shipped 100% wet with no tone filter.
generate_distortion_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, sp: string) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	drive_str := get_f32_param(graph, node, "drive", "", 20.0)
	tone_str  := get_f32_param(graph, node, "tone", "", 4000.0)
	mix_str   := get_f32_param(graph, node, "mix", "", 0.5)
	shape := strings.to_lower(get_string_param(node, "shape", "classic"), context.temp_allocator)

	fmt.sbprintf(sb, "\t\t// --- Distortion Node %s (%s) ---\n", node.id, shape)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdist_in_%s := (%s);\n", node.id, input_str)
	fmt.sbprintf(sb, "\t\t\tdist_k_%s := math.max(f32(%s), 1.0);\n", node.id, drive_str)
	switch shape {
	case "soft", "softclip":
		fmt.sbprintf(sb, "\t\t\tdist_wet_%s := math.tanh(dist_in_%s * dist_k_%s);\n", node.id, node.id, node.id)
	case "hard", "hardclip":
		fmt.sbprintf(sb, "\t\t\tdist_wet_%s := math.clamp(dist_in_%s * dist_k_%s, -1.0, 1.0);\n", node.id, node.id, node.id)
	case "asymmetric":
		fmt.sbprintf(sb, "\t\t\tdist_wet_%s := dist_in_%s > 0.0 ? dist_in_%s : dist_in_%s / (1.0 + abs(dist_in_%s * dist_k_%s));\n", node.id, node.id, node.id, node.id, node.id, node.id)
	case: // classic
		fmt.sbprintf(sb, "\t\t\tdist_wet_%s := (f32(math.PI) + dist_k_%s) * dist_in_%s / (f32(math.PI) + dist_k_%s * abs(dist_in_%s));\n", node.id, node.id, node.id, node.id, node.id)
	}
	// One-pole lowpass tone filter on the wet path.
	fmt.sbprintf(sb, "\t\t\ttone_k_%s := math.clamp(2.0 * f32(math.PI) * math.clamp(f32(%s), 100.0, 20000.0) / sample_rate, 0.001, 1.0);\n", node.id, tone_str)
	fmt.sbprintf(sb, "\t\t\t%sdist_%s_tone += tone_k_%s * (dist_wet_%s - %sdist_%s_tone);\n", sp, node.id, node.id, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\tmix_%s := math.clamp(f32(%s), 0.0, 1.0);\n", node.id, mix_str)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = dist_in_%s * (1.0 - mix_%s) + %sdist_%s_tone * mix_%s;\n", node.id, node.id, node.id, sp, node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
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

	// Channel gain: the UI serializes a `levels` array and exposes channels
	// as `level<i>`. The old key here (`input_<i>_gain`) exists NOWHERE in
	// the UI, so every channel slider was dead and exposed channels were
	// silent no-op params.
	levels: []json.Value
	if lv, ok := node.parameters["levels"]; ok {
		if arr, is_arr := lv.(json.Array); is_arr {
			levels = arr[:]
		}
	}

	fmt.sbprintf(sb, "\t\t// --- Mixer Node %s (%d inputs) ---\n", node.id, input_count)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tmix_sum_%s: f32 = 0.0;\n", node.id)
	for i in 1 ..= input_count {
		port_name := fmt.tprintf("input_%d", i)
		sources := find_inputs_for_port(graph, node.id, port_name)
		defer delete(sources)
		if len(sources) == 0 do continue

		default_gain: f32 = 1.0
		if i - 1 < len(levels) {
			#partial switch v in levels[i-1] {
			case json.Float:   default_gain = f32(v)
			case json.Integer: default_gain = f32(v)
			}
		}
		gain_param := fmt.tprintf("level%d", i)
		gain_str := get_f32_param(graph, node, gain_param, "", default_gain)
		for src in sources {
			fmt.sbprintf(sb, "\t\t\tmix_sum_%s += %s * (%s);\n", node.id, get_output_var(src.id, src.port), gain_str)
		}
	}
	fmt.sbprintf(sb, "\t\tnode_%s_out = mix_sum_%s;\n", node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_panner_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	pan_str := get_f32_param(graph, node, "pan", "input_pan", 0.0)
	fmt.sbprintf(sb, "\t\t// --- Panner Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Pan clamped: modulation past ±1 rotates the angle out of [0, π/2] and
	// leaks a polarity-inverted copy into the opposite channel.
	fmt.sbprintf(sb, "\t\t\tpan_angle_%s := (math.clamp(f32(%s), -1.0, 1.0) * 0.5 + 0.5) * f32(math.PI) / 2.0;\n", node.id, pan_str)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_left = (%s) * math.cos(pan_angle_%s);\n", node.id, input_str, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_right = (%s) * math.sin(pan_angle_%s);\n", node.id, input_str, node.id)
	// Mono downmix for mono-input consumers: a Panner feeding a Filter or
	// Gain used to produce TOTAL SILENCE (downstream read node_<id>_out,
	// which was never written). 0.7071*(L+R) is unity at center pan.
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (node_%s_out_left + node_%s_out_right) * 0.7071068;\n", node.id, node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_mapper_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	inMin := get_f32_param(graph, node, "inMin", "", 0.0)
	inMax := get_f32_param(graph, node, "inMax", "", 1.0)
	outMin := get_f32_param(graph, node, "outMin", "", 0.0)
	outMax := get_f32_param(graph, node, "outMax", "", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Mapper Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Runtime guard: inMax == inMin (trivially reachable from the UI) would
	// emit a constant division by zero when both are literals, and NaN when
	// modulated. Degenerate range maps everything to outMin.
	fmt.sbprintf(sb, "\t\t\tin_range_%s := (%s) - (%s);\n", node.id, inMax, inMin)
	fmt.sbprintf(sb, "\t\t\tif in_range_%s == 0.0 do in_range_%s = 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = math.lerp(f32(%s), f32(%s), math.clamp(((%s) - (%s)) / in_range_%s, 0.0, 1.0));\n", node.id, outMin, outMax, input_str, inMin, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}


generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

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
	// Output 2: Gate — live per-voice signal (1 while held, 0 once
	// released). It was a hardcoded compile-time 1.0 before.
	fmt.sbprintf(sb, "\t\tnode_%s_out_gate := f32(1.0)\n", node.id)
	fmt.sbprintf(sb, "\t\tif voice.time_released > 0.0 do node_%s_out_gate = 0.0\n", node.id)
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
	// A muted track exports as SFX: no auto-start, no sequence. It used to
	// export as an audible auto-starting Music Layer despite the mute flag.
	if track != nil && len(track.events) > 0 && !track.mute {
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
// Full sanitization, not just spaces: "808 Kick!" must become "n808_Kick_"
// (leading digit prefixed, punctuation replaced), or every emitted proc
// name is a syntax error.
clean_instrument_name :: proc(inst: ^Project_Instrument) -> string {
	if len(inst.name) == 0 {
		return fmt.tprintf("Instrument_%s", sanitize_identifier(inst.id, true))
	}
	return sanitize_identifier(inst.name)
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

	// --- Topology & domain analysis ---
	// A cycle is a hard error: topological_sort silently drops every node in
	// the cycle AND everything downstream of it, so "it generated fine" would
	// mean "half your patch is gone".
	sorted_nodes, is_dag := topological_sort(graph)
	// (freed at end of proc; needed throughout emission)
	if !is_dag {
		in_sorted := make(map[string]bool)
		for n in sorted_nodes do in_sorted[n.id] = true
		fmt.eprintf("Error: instrument %q contains a feedback loop. Nodes in or behind the cycle:", instrument.name)
		for _, node in graph.nodes {
			if !in_sorted[node.id] do fmt.eprintf(" %s(%s)", node.type, node.id)
		}
		fmt.eprintf("\nBreak the cycle (remove the feedback wire) and regenerate.\n")
		os.exit(1)
	}
	bus_nodes := compute_bus_domain(graph, sorted_nodes, instrument.name)

	// Voice-domain output vars consumed by bus-domain nodes get a per-voice
	// accumulator (`<var>_vsum`): the bus section runs once per sample on
	// the SUM of all voices. Keyed by emitted variable name so Panner
	// L/R port outputs work like everything else.
	cross_vars := make(map[string]bool)
	defer delete(cross_vars)
	for conn in graph.connections {
		if bus_nodes[conn.to_node] && !bus_nodes[conn.from_node] {
			if _, ok := graph.nodes[conn.from_node]; ok {
				cross_vars[get_output_var(conn.from_node, conn.from_port)] = true
			}
		}
	}

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

	// Generate state fields for nodes. Bus-domain nodes keep their state on
	// the PROCESSOR (they run once per sample, not per voice) — see below.
	for _, node in graph.nodes {
		if bus_nodes[node.id] do continue
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "\tosc_%s_phase: [%d]f32,\n", node.id, instrument.unison)
		} else if node.type == "ADSR" {
			// (adsr_<id>_time / adsr_<id>_value removed: _time was written
			// but never read; _value was ALWAYS 0.0 and note_off used to
			// copy it into release_level, killing every release tail.)
			fmt.sbprintf(&sb, "\tadsr_%s_stage: ADSR_Stage,\n", node.id)
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
		} else if node.type == "Distortion" {
			fmt.sbprintf(&sb, "\tdist_%s_tone: f32,\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	// --- Processor State ---
	fmt.sbprintf(&sb, "%s_Processor :: struct {{\n", namespace_prefix)
	fmt.sbprintf(&sb, "\tsample_rate: f32,\n")
	fmt.sbprintf(&sb, "\tbpm: f32,\n")
	fmt.sbprintf(&sb, "\tvoices: [%d]%s_Voice_State,\n", polyphony, namespace_prefix)
	fmt.sbprint(&sb, "\tprng: PRNG_State,\n")
    fmt.sbprint(&sb, "\ttotal_samples: u64,\n")
    // Music Layer transport (always present so the public API surface is
    // uniform across asset types; SFX simply doesn't read these fields).
    fmt.sbprint(&sb, "\tplaying: bool,\n")
    fmt.sbprint(&sb, "\tloop: bool,\n")
    fmt.sbprint(&sb, "\tcurrent_step: u64,\n")
    fmt.sbprint(&sb, "\tsamples_until_next_step: u64,\n")
    // Fractional-sample carry for the step clock: without it, truncating
    // samples-per-step made 120 BPM render ~120.011 BPM at 44.1kHz and
    // drift against the UI preview.
    fmt.sbprint(&sb, "\tstep_frac_acc: f32,\n")
    
    // Generate Processor state fields (Global effects buffers)
	for _, node in graph.nodes {
        // Delay and Reverb usage of delay buffer
		if node.type == "Delay" || node.type == "Reverb" {
			fmt.sbprintf(&sb, "\tdelay_%s_buffer: [96000]f32,\n", node.id)
            fmt.sbprintf(&sb, "\tdelay_%s_write_index: int,\n", node.id)
		}
	}
	// Bus-domain stateful nodes (a Filter/LFO/etc downstream of a Delay or
	// Reverb) keep their DSP state here instead of on the voice.
	for _, node in graph.nodes {
		if !bus_nodes[node.id] do continue
		switch node.type {
		case "Filter":
			fmt.sbprintf(&sb, "\tfilter_%s_low: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tfilter_%s_band: f32,\n", node.id)
		case "LFO":
			fmt.sbprintf(&sb, "\tlfo_%s_phase: f32,\n", node.id)
		case "Noise":
			fmt.sbprintf(&sb, "\tnoise_%s_rng: PRNG_State,\n", node.id)
		case "SampleHold":
			fmt.sbprintf(&sb, "\tsh_%s_counter: u64,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_rng: PRNG_State,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_current_value: f32,\n", node.id)
		case "Distortion":
			fmt.sbprintf(&sb, "\tdist_%s_tone: f32,\n", node.id)
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
        // used_fields guarantees global uniqueness: two nodes with the SAME
        // label (or two unlabeled nodes whose ids sanitize identically)
        // exposing the same param would otherwise silently share one field.
        used_fields := make(map[string]bool)
        defer delete(used_fields)
        for _, node in graph.nodes {
            if params_val, ok := node.parameters["exposedParameters"]; ok {
                if arr, is_arr := params_val.(json.Array); is_arr {
                    for p_val in arr {
                        p_name, is_str := p_val.(json.String)
                        if !is_str do continue

                        rng := lookup_param_range(p_name, node.type)
                        def_val := rng.default
                        if val, found := node.parameters[p_name]; found {
                            #partial switch v in val {
                            case json.Float:   def_val = f32(v)
                            case json.Integer: def_val = f32(v)
                            }
                        }

                        field_name := p_name
                        if counts[p_name] > 1 {
                            // Collision: prefix with the sanitized node label
                            // (falls back to node id — sanitize handles the
                            // digit-leading case, `2_pulseWidth` is not a
                            // legal Odin identifier).
                            label := sanitize_identifier(get_string_param(node, "label", node.id))
                            field_name = fmt.tprintf("%s_%s", label, p_name)
                        }
                        if used_fields[field_name] {
                            base := field_name
                            n := 2
                            for used_fields[field_name] {
                                field_name = fmt.tprintf("%s_%d", base, n)
                                n += 1
                            }
                        }
                        used_fields[field_name] = true

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
        if (node.type == "Noise" || node.type == "SampleHold") && !bus_nodes[node.id] {
            needs_voice_rng_seed = true
            break
        }
    }
    voice_seed: u32 = 0xC0FFEE01
    if needs_voice_rng_seed {
        fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
        fmt.sbprint(&sb, "\t\tv := &p.voices[i]\n")
        for _, node in graph.nodes {
            if bus_nodes[node.id] do continue
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
    // Bus-domain rngs are seeded once on the processor.
    for _, node in graph.nodes {
        if !bus_nodes[node.id] do continue
        if node.type == "Noise" {
            fmt.sbprintf(&sb, "\tp.noise_%s_rng.state = u32(0x%08X)\n", node.id, voice_seed)
            voice_seed += 1
        } else if node.type == "SampleHold" {
            fmt.sbprintf(&sb, "\tp.sh_%s_rng.state = u32(0x%08X)\n", node.id, voice_seed)
            voice_seed += 1
        }
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
	// Steal the OLDEST voice, not a blind round-robin pointer (which could
	// steal the note that started one sample ago while a 10s pad kept ringing).
	fmt.sbprint(&sb, "\tstolen := false\n")
	fmt.sbprint(&sb, "\tif voice_idx == -1 {\n")
	fmt.sbprint(&sb, "\t\tstolen = true\n")
	fmt.sbprint(&sb, "\t\toldest_age: f32 = -1.0\n")
	fmt.sbprintf(&sb, "\t\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\t\tif p.voices[i].age > oldest_age {\n")
	fmt.sbprint(&sb, "\t\t\t\toldest_age = p.voices[i].age\n")
	fmt.sbprint(&sb, "\t\t\t\tvoice_idx = i\n")
	fmt.sbprint(&sb, "\t\t\t}\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n\n")

	fmt.sbprint(&sb, "\tv := &p.voices[voice_idx]\n")
	fmt.sbprint(&sb, "\tprev_freq := v.current_freq\n")
	fmt.sbprint(&sb, "\tv.active = true\n")
	fmt.sbprint(&sb, "\tv.note = note\n")
	fmt.sbprint(&sb, "\tv.velocity = velocity\n")
    fmt.sbprint(&sb, "\tv.age = 0.0\n")
    fmt.sbprint(&sb, "\tv.time_released = 0.0\n")
    fmt.sbprint(&sb, "\tfreq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)\n")
	fmt.sbprint(&sb, "\tv.target_freq = freq\n")
    fmt.sbprintf(&sb, "\tv.glide_time = %f\n", instrument.glide)
	// Glide applies on voice reuse (steal): the pitch slides from where the
	// stolen voice was to the new note over glide_time. Fresh voices start
	// exactly on pitch — gliding every new note from the previous one would
	// smear chords (the UI default glide is nonzero on every instrument).
	fmt.sbprint(&sb, "\tif stolen && v.glide_time > 0.0 && prev_freq > 0.0 {\n")
	fmt.sbprint(&sb, "\t\tv.current_freq = prev_freq\n")
	fmt.sbprint(&sb, "\t} else {\n")
	fmt.sbprint(&sb, "\t\tv.current_freq = freq\n")
	fmt.sbprint(&sb, "\t}\n")
    fmt.sbprint(&sb, "\tv.duration = duration\n")

    // Reset per-voice DSP state. Filter state carried over between notes on
    // voice reuse — worse, a single NaN blowup latched the voice silent
    // forever. Phases reset too so retriggers are deterministic. Bus-domain
    // node state lives on the processor and is never reset per note.
	for _, node in graph.nodes {
		if bus_nodes[node.id] do continue
		switch node.type {
		case "ADSR":
			fmt.sbprintf(&sb, "\tv.adsr_%s_stage = .Attack\n", node.id)
			fmt.sbprintf(&sb, "\tv.adsr_%s_release_level = 0.0\n", node.id)
		case "Filter":
			fmt.sbprintf(&sb, "\tv.filter_%s_low = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\tv.filter_%s_band = 0.0\n", node.id)
		case "Oscillator":
			fmt.sbprintf(&sb, "\tv.osc_%s_phase = {{}}\n", node.id)
		case "FmOperator":
			fmt.sbprintf(&sb, "\tv.fm_%s_phase = 0.0\n", node.id)
		case "Wavetable":
			fmt.sbprintf(&sb, "\tv.wavetable_%s_phase = 0.0\n", node.id)
		case "Distortion":
			fmt.sbprintf(&sb, "\tv.dist_%s_tone = 0.0\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	// note_off releases ONE voice per call — the oldest active, not-yet-
	// releasing voice holding this note. Releasing all of them meant the
	// same note played twice (delay throws, echoes a chord) lost every
	// copy's tail on the first note_off.
	first_adsr_id := ""
	for _, node in graph.nodes {
		if node.type == "ADSR" {
			first_adsr_id = node.id
			break
		}
	}
	fmt.sbprintf(&sb, "%s_note_off :: proc(p: ^%s_Processor, note: u8) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tbest := -1\n")
	fmt.sbprint(&sb, "\tbest_age: f32 = -1.0\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tif p.voices[i].active && p.voices[i].note == note {\n")
	if first_adsr_id != "" {
		fmt.sbprintf(&sb, "\t\t\tif p.voices[i].adsr_%s_stage == .Release do continue\n", first_adsr_id)
	}
	fmt.sbprint(&sb, "\t\t\tif p.voices[i].age > best_age {\n")
	fmt.sbprint(&sb, "\t\t\t\tbest_age = p.voices[i].age\n")
	fmt.sbprint(&sb, "\t\t\t\tbest = i\n")
	fmt.sbprint(&sb, "\t\t\t}\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\tif best >= 0 {\n")
	fmt.sbprint(&sb, "\t\tp.voices[best].time_released = p.voices[best].age\n")
	if first_adsr_id != "" {
		for _, node in graph.nodes {
			if node.type == "ADSR" {
				// release_level already tracks the live envelope value each
				// sample — do NOT overwrite it here (that was the instant-
				// silence bug: it was clobbered with a field that was always 0).
				fmt.sbprintf(&sb, "\t\tp.voices[best].adsr_%s_stage = .Release\n", node.id)
			}
		}
	} else {
		fmt.sbprint(&sb, "\t\tp.voices[best].active = false\n")
	}
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
	fmt.sbprint(&sb, "\tp.step_frac_acc = 0.0\n")
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

	// Cross-domain accumulators: voice-domain outputs consumed by the bus
	// section are summed across voices here, then handed to the bus block.
	for var_name in cross_vars {
		fmt.sbprintf(&sb, "\t%s_vsum: f32 = 0.0\n", var_name)
	}

	fmt.sbprintf(&sb, "\tfor v_idx in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tvoice := &p.voices[v_idx]\n")
	fmt.sbprint(&sb, "\t\tif !voice.active do continue\n\n")
    // Increment voice age
    fmt.sbprint(&sb, "\t\tvoice.age += 1.0 / sample_rate;\n")

	// Glide: one-pole slide of current_freq toward target_freq. Only ever
	// diverges on voice steal (see note_on); fresh notes start on pitch.
	if instrument.glide > 0.0 {
		fmt.sbprint(&sb, "\t\tif voice.current_freq != voice.target_freq {\n")
		fmt.sbprint(&sb, "\t\t\tglide_k := 1.0 / math.max(voice.glide_time * sample_rate, 1.0)\n")
		fmt.sbprint(&sb, "\t\t\tif glide_k > 1.0 do glide_k = 1.0\n")
		fmt.sbprint(&sb, "\t\t\tvoice.current_freq += (voice.target_freq - voice.current_freq) * glide_k\n")
		fmt.sbprint(&sb, "\t\t\tif abs(voice.target_freq - voice.current_freq) < 0.1 do voice.current_freq = voice.target_freq\n")
		fmt.sbprint(&sb, "\t\t}\n")
	}
    
    // Auto-Release Check. time_released must be stamped here or the
    // Release stage computes time_in_release from age-0 and the tail is
    // skipped entirely (the sequencer fires every note through this path).
    // release_level is NOT touched — it already tracks the live envelope.
    fmt.sbprint(&sb, "\t\tif voice.age >= voice.duration && voice.duration > 0.0 {\n")
	for _, node in graph.nodes {
		if node.type == "ADSR" {
            // Trigger Release
			fmt.sbprintf(&sb, "\t\t\tif voice.adsr_%s_stage != .Release && voice.adsr_%s_stage != .Idle {{\n", node.id, node.id)
			fmt.sbprintf(&sb, "\t\t\t\tvoice.adsr_%s_stage = .Release\n", node.id)
			fmt.sbprint(&sb, "\t\t\t\tvoice.time_released = voice.age\n")
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

	// Variable declarations — voice-domain nodes only (bus nodes live in the
	// bus block below the loop). Every node gets a mono `node_<id>_out`;
	// Panner nodes also get the stereo pair.
	for _, node in graph.nodes {
		if bus_nodes[node.id] do continue
		fmt.sbprintf(&sb, "\t\tnode_%s_out: f32 = 0.0\n", node.id)
		if node.type == "Panner" {
			fmt.sbprintf(&sb, "\t\tnode_%s_out_left: f32 = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\t\tnode_%s_out_right: f32 = 0.0\n", node.id)
		}
	}
	fmt.sbprint(&sb, "\n")

    // --- Voice-domain node emission (topological order) ---
    // GraphOutput is never skipped: even when it lives in the bus domain
    // (an effect feeds it), its voice-domain sources must be summed here.
    for node in sorted_nodes {
        if bus_nodes[node.id] && node.type != "GraphOutput" do continue
        switch node.type {
        case "Oscillator":
            generate_oscillator_code(&sb, node, graph, instrument)
        case "ADSR":
            generate_adsr_code(&sb, node, graph)
        case "Filter":
             generate_filter_code(&sb, node, graph, "voice.")
        case "Gain":
             generate_gain_code(&sb, node, graph)
        case "Distortion":
             generate_distortion_code(&sb, node, graph, "voice.")
        case "Noise":
             generate_noise_code(&sb, node, graph, "voice.")
        case "Mixer":
             generate_mixer_code(&sb, node, graph)
        case "Mapper":
             generate_mapper_code(&sb, node, graph)
        case "MidiInput":
             generate_midi_input_code(&sb, node, graph)
        case "Panner":
             generate_panner_code(&sb, node, graph)
        case "LFO":
             generate_lfo_code(&sb, node, graph, "voice.")
        case "FmOperator":
             generate_fm_operator_code(&sb, node, graph)
        case "Wavetable":
             generate_wavetable_code(&sb, node, graph)
        case "SampleHold":
             generate_sample_hold_code(&sb, node, graph, "voice.")
        case "GraphOutput":
             generate_graph_output_adds(&sb, node, graph, bus_nodes, false)
        }
    }

	// Accumulate cross-domain sums (feeds the bus block after the loop).
	for var_name in cross_vars {
		fmt.sbprintf(&sb, "\t\t%s_vsum += %s\n", var_name, var_name)
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

	// --- Bus block: Delay/Reverb and everything downstream, once per
	// sample on the summed voice signal. Runs regardless of voice.active,
	// so echo/reverb tails keep ringing after the last voice dies.
	has_bus := false
	for node in sorted_nodes {
		if bus_nodes[node.id] && node.type != "GraphOutput" {
			has_bus = true
			break
		}
	}
	if has_bus {
		fmt.sbprint(&sb, "\n\t// --- Bus effects (once per sample, post voice sum) ---\n")
		fmt.sbprint(&sb, "\t{\n")
		// Voice-domain sources appear under their normal names, holding the
		// all-voices sum.
		for var_name in cross_vars {
			fmt.sbprintf(&sb, "\t\t%s := %s_vsum\n", var_name, var_name)
		}
		for node in sorted_nodes {
			if bus_nodes[node.id] && node.type != "GraphOutput" {
				fmt.sbprintf(&sb, "\t\tnode_%s_out: f32 = 0.0\n", node.id)
				if node.type == "Panner" {
					fmt.sbprintf(&sb, "\t\tnode_%s_out_left: f32 = 0.0\n", node.id)
					fmt.sbprintf(&sb, "\t\tnode_%s_out_right: f32 = 0.0\n", node.id)
				}
			}
		}
		for node in sorted_nodes {
			if !bus_nodes[node.id] do continue
			switch node.type {
			case "Filter":
				generate_filter_code(&sb, node, graph, "p.")
			case "Gain":
				generate_gain_code(&sb, node, graph)
			case "Distortion":
				generate_distortion_code(&sb, node, graph, "p.")
			case "Delay":
				generate_delay_code(&sb, node, graph)
			case "Reverb":
				generate_reverb_code(&sb, node, graph)
			case "Noise":
				generate_noise_code(&sb, node, graph, "p.")
			case "Mixer":
				generate_mixer_code(&sb, node, graph)
			case "Mapper":
				generate_mapper_code(&sb, node, graph)
			case "Panner":
				generate_panner_code(&sb, node, graph)
			case "LFO":
				generate_lfo_code(&sb, node, graph, "p.")
			case "SampleHold":
				generate_sample_hold_code(&sb, node, graph, "p.")
			case "GraphOutput":
				generate_graph_output_adds(&sb, node, graph, bus_nodes, true)
			}
		}
		fmt.sbprint(&sb, "\t}\n")
	}

	fmt.sbprint(&sb, "\treturn output_left, output_right\n")
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}

// Emit `output_left/right += ...` for a GraphOutput node's connections.
// Called twice: once inside the voice loop (bus_pass=false — voice-domain
// sources only, summed per voice) and once inside the bus block
// (bus_pass=true — bus-domain sources). Sums EVERY connection: only the
// first used to survive and any second source was silently dropped. A
// Panner source routes its stereo pair; anything else broadcasts port-aware
// mono to both channels.
generate_graph_output_adds :: proc(
	sb: ^strings.Builder,
	node: Node,
	graph: ^Graph,
	bus_nodes: map[string]bool,
	bus_pass: bool,
) {
	sources := find_inputs_for_port(graph, node.id, "input")
	defer delete(sources)
	for src in sources {
		if bus_nodes[src.id] != bus_pass do continue
		src_node, found := graph.nodes[src.id]
		if !found do continue
		if src_node.type == "Panner" && (src.port == "" || src.port == "output") {
			fmt.sbprintf(sb, "\t\toutput_left += node_%s_out_left\n", src.id)
			fmt.sbprintf(sb, "\t\toutput_right += node_%s_out_right\n", src.id)
		} else {
			v := get_output_var(src.id, src.port)
			fmt.sbprintf(sb, "\t\toutput_left += %s\n", v)
			fmt.sbprintf(sb, "\t\toutput_right += %s\n", v)
		}
	}
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

	// Track length drives WHICH step's notes fire; the global pattern
	// length drives the loop boundary (shorter tracks wrap polyrhythmically
	// inside it — same semantics as the UI engine). pattern_steps was never
	// serialized before, so every loop silently reverted to 16.
	track_steps := track.num_steps
	if track_steps <= 0 {
		track_steps = 16
	}
	global_steps := project.pattern_steps
	if global_steps <= 0 {
		global_steps = track_steps
	}

	fmt.sbprint(sb, "\tif !p.playing do return\n")

	// Exact (fractional) samples-per-step, recomputed each call so changes
	// to p.sample_rate or p.bpm at runtime take effect on the next step.
	// The integer part drives the countdown; the fraction accumulates in
	// p.step_frac_acc so long renders never drift (44.1kHz at 120 BPM is
	// 91.875 samples/step — truncation ran ~0.01% fast).
	fmt.sbprint(
		sb,
		"\tsamples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)\n",
	)

	// Fire-then-decrement: when the counter is 0, fire the current step's
	// events, advance, and reload the counter; otherwise just decrement.
	// _start sets samples_until_next_step=0 so step 0 fires on the first
	// process call after start.
	fmt.sbprint(sb, "\tif p.samples_until_next_step == 0 {\n")
	fmt.sbprintf(sb, "\t\tswitch p.current_step %% %d {{\n", track_steps)

	// Group events by step before emitting: two notes on the same step (a
	// chord) must share ONE `case` — duplicate switch cases don't compile.
	max_step := 0
	for event in track.events {
		if event.step > max_step do max_step = event.step
	}
	for s in 0 ..= max_step {
		first := true
		for event in track.events {
			if event.step != s do continue
			if first {
				fmt.sbprintf(sb, "\t\tcase %d:\n", s)
				first = false
			}
			duration_val := event.duration
			if duration_val <= 0.0 {
				duration_val = 1.0 // Default to 1 step
			}
			// Probability: <=0 means the field was absent (old fixtures) —
			// play always. Values in (0,1) gate the step on the processor
			// PRNG each loop.
			indent := "\t\t\t"
			has_prob := event.probability > 0.0 && event.probability < 1.0
			if has_prob {
				fmt.sbprintf(sb, "\t\t\tif next_float32(&p.prng) <= %f {{\n", event.probability)
				indent = "\t\t\t\t"
			}
			// P-locks: apply this step's parameter overrides through the
			// string-keyed setter before firing the note. (Divergence note:
			// the preview scopes overrides to the triggered voice; here they
			// persist until the next override — Elektron-style.)
			for key, val in event.patch_overrides {
				fmt.sbprintf(
					sb,
					"%s%s_set_param(p, \"%s\", %f)\n",
					indent,
					namespace_prefix,
					key,
					val,
				)
			}
			// duration is in steps; convert to seconds at runtime using p.bpm.
			fmt.sbprintf(
				sb,
				"%s%s_note_on(p, %d, %f, f32(%f) * (60.0 / p.bpm / 4.0))\n",
				indent,
				namespace_prefix,
				event.note,
				event.velocity,
				duration_val,
			)
			if has_prob {
				fmt.sbprint(sb, "\t\t\t}\n")
			}
		}
	}

	fmt.sbprint(sb, "\t\t}\n")

	// Advance step. The loop boundary is the GLOBAL pattern length; honor
	// `loop`: if false and we just finished the last step, halt the layer.
	fmt.sbprint(sb, "\t\tp.current_step += 1\n")
	fmt.sbprintf(sb, "\t\tif p.current_step >= %d {{\n", global_steps)
	fmt.sbprint(sb, "\t\t\tif p.loop {\n")
	fmt.sbprint(sb, "\t\t\t\tp.current_step = 0\n")
	fmt.sbprint(sb, "\t\t\t} else {\n")
	fmt.sbprint(sb, "\t\t\t\tp.playing = false\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprint(sb, "\t\t}\n")

	// Reload counter with fractional carry; subtract 1 so this same-call
	// counter==0 fire doesn't get double-counted.
	fmt.sbprint(sb, "\t\tp.step_frac_acc += samples_per_step_f\n")
	fmt.sbprint(sb, "\t\tn_step := u64(math.max(p.step_frac_acc, 1.0))\n")
	fmt.sbprint(sb, "\t\tp.step_frac_acc -= f32(n_step)\n")
	fmt.sbprint(sb, "\t\tp.samples_until_next_step = n_step - 1\n")
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

    // Wavetable morph shared by all Wavetable nodes: the four standard
    // shapes (sine/triangle/saw/square), position 0..3 crossfades between
    // adjacent shapes with wraparound — exactly the preview worklet's
    // table set and interpolation. ph is normalized [0,1).
    fmt.sbprint(&sb, "skald_wavetable_shape :: proc(idx: int, ph: f32) -> f32 {\n")
    fmt.sbprint(&sb, "\tswitch idx {\n")
    fmt.sbprint(&sb, "\tcase 1: return abs(ph * 4.0 - 2.0) - 1.0\n")
    fmt.sbprint(&sb, "\tcase 2: return ph * 2.0 - 1.0\n")
    fmt.sbprint(&sb, "\tcase 3: return ph < 0.5 ? 1.0 : -1.0\n")
    fmt.sbprint(&sb, "\t}\n")
    fmt.sbprint(&sb, "\treturn math.sin(ph * 2.0 * f32(math.PI))\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "skald_wavetable_sample :: proc(ph: f32, pos: f32) -> f32 {\n")
    fmt.sbprint(&sb, "\tp := math.clamp(pos, 0.0, 3.0)\n")
    fmt.sbprint(&sb, "\ti1 := int(p)\n")
    fmt.sbprint(&sb, "\ti2 := (i1 + 1) % 4\n")
    fmt.sbprint(&sb, "\tfrac := p - f32(i1)\n")
    fmt.sbprint(&sb, "\ts1 := skald_wavetable_shape(i1, ph)\n")
    fmt.sbprint(&sb, "\ts2 := skald_wavetable_shape(i2, ph)\n")
    fmt.sbprint(&sb, "\treturn s1 + (s2 - s1) * frac\n")
    fmt.sbprint(&sb, "}\n\n")

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

    // project_process: stereo summation across all assets. Mute/solo flags
    // and master_volume come from the project JSON — they were parsed and
    // silently ignored before, so a muted track exported as an audible
    // auto-starting layer and mixes couldn't be balanced at all.
    any_solo := false
    for i in 0 ..< len(project.instruments) {
        if project.instruments[i].solo do any_solo = true
    }
    master_vol := project.master_volume
    if master_vol <= 0.0 do master_vol = 1.0

    fmt.sbprint(&sb, "project_process :: proc(p: ^Project_State) -> (f32, f32) {\n")
    fmt.sbprint(&sb, "\tmixed_left: f32 = 0.0\n")
    fmt.sbprint(&sb, "\tmixed_right: f32 = 0.0\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        inst := &project.instruments[i]
        if inst.mute || (any_solo && !inst.solo) {
            fmt.sbprintf(&sb, "\t// %s: muted in the project (excluded from the mix)\n", n)
            continue
        }
        fmt.sbprintf(
            &sb,
            "\t{{ l, r := %s_process(p.%s); mixed_left += l; mixed_right += r }}\n",
            n,
            n,
        )
    }
    // Master volume, then a soft limiter whose ceiling really is 1.0 —
    // tanh(x*0.7)/0.7 topped out at 1.43 and still clipped the device.
    fmt.sbprintf(&sb, "\tmixed_left = math.tanh(mixed_left * %f)\n", master_vol)
    fmt.sbprintf(&sb, "\tmixed_right = math.tanh(mixed_right * %f)\n", master_vol)
    fmt.sbprint(&sb, "\treturn mixed_left, mixed_right\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_destroy :: proc(p: ^Project_State) {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tfree(p.%s)\n", unique_names[i])
    }
    fmt.sbprint(&sb, "}\n\n")

    return strings.to_string(sb)
}
