package skald_core

import "core:fmt"
import "core:math"
import "core:os"
import "core:strings"

// C6-3 (F-B03-5): a voice with no ADSR used to be switched off at the exact
// sample its duration expired — a hard cut mid-waveform, an audible click that
// the default _trigger (duration 1.0 s) walked straight into. The voice now
// lingers this long past its duration with a linear fade to zero. Short enough
// to read as "the note ended", long enough that the step is never a click.
NOADSR_FADE_SECONDS :: 0.005

emit_param_case :: proc(sb: ^strings.Builder, res: Exposed_Resolution, alias: string) {
	if alias != "" {
		fmt.sbprintf(sb, "\tcase \"%s\", \"%s\":\n", res.field_name, alias)
	} else {
		fmt.sbprintf(sb, "\tcase \"%s\":\n", res.field_name)
	}
}

generate_processor_code :: proc(
	graph: ^Graph,
	instrument: ^Project_Instrument,
	namespace_prefix: string,
	asset_type: Asset_Type,
	bpm: f32,
	plan: ^Instrument_Plan,
	include_header := true,
) -> string {
	
	polyphony := instrument.voice_count
	if polyphony <= 0 do polyphony = 1

	sorted_nodes, _ := topological_sort(graph)

	all_nodes := nodes_sorted_by_id(graph)
	defer delete(all_nodes)

	// KI-055: this used to inline the same is_dag check, print the feedback-loop
	// error, and fall through past a commented-out os.exit(1) — generation
	// continued on sorted_nodes alone, so the cyclic nodes (and everything
	// downstream) were silently absent from the emitted asset and the process
	// still exited 0. validate_no_cycle (graph_validate.odin) is the actual
	// exit; the finder it wraps re-derives the same sorted_nodes/is_dag pair,
	// which is fine here — a rejected patch never reaches the emission below,
	// so recomputing it once on that path costs nothing on the path that ships.
	validate_no_cycle(graph, instrument.name)
	validate_connections(graph, instrument.name)
	validate_no_nested_instruments(graph, instrument.name)

	warn_graph_output_count(all_nodes, instrument.name)
	warn_unreachable_nodes(graph, all_nodes, instrument.name)
	warn_dead_exposed_params(all_nodes, instrument.name)
	warn_exponent_port_overdrive(graph, all_nodes, plan, instrument.name)
	warn_panner_mono_consumers(graph, all_nodes, instrument.name)

	bus_nodes := compute_bus_domain(graph, sorted_nodes, instrument.name)

	// SKB-016: how long the Delay/Reverb tail outlives the last voice. Zero for
	// a patch with no bus effects, in which case nothing below is emitted at
	// all and _is_playing keeps its old two-line shape.
	bus_tail_seconds := compute_bus_tail_seconds(graph, all_nodes, plan)
	has_bus_tail := bus_tail_seconds > 0.0

	cross_vars := make(map[string]bool)
	defer delete(cross_vars)
	cross_vars_ordered := make([dynamic]string)
	defer delete(cross_vars_ordered)
	for conn in graph.connections {
		if bus_nodes[conn.to_node] && !bus_nodes[conn.from_node] {
			if _, ok := graph.nodes[conn.from_node]; ok {
				v := get_output_var(conn.from_node, conn.from_port)
				if !cross_vars[v] {
					cross_vars[v] = true
					append(&cross_vars_ordered, v)
				}
			}
		}
	}

    sb := strings.builder_make()
    
    if include_header {
	    fmt.sbprint(&sb, "package generated_audio\n\n")
	    fmt.sbprint(&sb, "import \"core:math\"\n")
	    fmt.sbprint(&sb, "import \"core:math/rand\"\n\n")
	    emit_soft_limit_proc(&sb)
	    // B7-x3: the tail helper only when something has a tail; a patch with
	    // no Delay/Reverb used to carry 12 lines of dead code for it.
	    if has_bus_tail do emit_feedback_tail_proc(&sb)
    }

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

	for node in all_nodes {
		if bus_nodes[node.id] do continue
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "\tosc_%s_phase: [%d]f32,\n", node.id, max(instrument.unison, 1))
		} else if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\tadsr_%s_stage: ADSR_Stage,\n", node.id)
            fmt.sbprintf(&sb, "\tadsr_%s_release_level: f32,\n", node.id)
            fmt.sbprintf(&sb, "\tadsr_%s_attack_start: f32,\n", node.id)
		} else if node.type == "Filter" {
			fmt.sbprintf(&sb, "\tfilter_%s_low: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tfilter_%s_band: f32,\n", node.id)
		} else if node.type == "LFO" {
			fmt.sbprintf(&sb, "\tlfo_%s_phase: f32,\n", node.id)
		} else if node.type == "FmOperator" {
			fmt.sbprintf(&sb, "\tfm_%s_phase: [%d]f32,\n", node.id, max(instrument.unison, 1))
		} else if node.type == "Wavetable" {
			fmt.sbprintf(&sb, "\twavetable_%s_phase: [%d]f32,\n", node.id, max(instrument.unison, 1))
		} else if node.type == "Noise" {
			fmt.sbprintf(&sb, "\tnoise_%s_rng: PRNG_State,\n", node.id)
			if noise_is_pink(node) {
				fmt.sbprintf(&sb, "\tnoise_%s_p0: f32,\n", node.id)
				fmt.sbprintf(&sb, "\tnoise_%s_p1: f32,\n", node.id)
				fmt.sbprintf(&sb, "\tnoise_%s_p2: f32,\n", node.id)
			}
		} else if node.type == "SampleHold" {
			fmt.sbprintf(&sb, "\tsh_%s_counter: u64,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_rng: PRNG_State,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_current_value: f32,\n", node.id)
		} else if node.type == "Distortion" {
			fmt.sbprintf(&sb, "\tdist_%s_tone: f32,\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(&sb, "%s_Processor :: struct {{\n", namespace_prefix)
	fmt.sbprintf(&sb, "\tsample_rate: f32,\n")
	fmt.sbprintf(&sb, "\tbpm: f32,\n")
	fmt.sbprintf(&sb, "\tvoices: [%d]%s_Voice_State,\n", polyphony, namespace_prefix)
	fmt.sbprint(&sb, "\tprng: PRNG_State,\n")
    fmt.sbprint(&sb, "\ttotal_samples: u64,\n")
    fmt.sbprint(&sb, "\tplaying: bool,\n")
    fmt.sbprint(&sb, "\tloop: bool,\n")
    fmt.sbprint(&sb, "\tcurrent_step: u64,\n")
    fmt.sbprint(&sb, "\tsamples_until_next_step: u64,\n")
    fmt.sbprint(&sb, "\tstep_frac_acc: f32,\n")
	fmt.sbprint(&sb, "\text_in_l: f32,\n")
	fmt.sbprint(&sb, "\text_in_r: f32,\n")
	fmt.sbprint(&sb, "\tvolume: f32,\n")
	if has_bus_tail {
		fmt.sbprint(&sb, "\tbus_tail_remaining: u64,\n")
		fmt.sbprint(&sb, "\tbus_tail_armed: bool,\n")
	}

	for node in all_nodes {
		if node.type == "Delay" || node.type == "Reverb" {
			fmt.sbprintf(&sb, "\tdelay_%s_buffer: [%d]f32,\n", node.id, MAX_DELAY_SAMPLES)
            fmt.sbprintf(&sb, "\tdelay_%s_write_index: int,\n", node.id)
			if node.type == "Reverb" {
				fmt.sbprintf(&sb, "\treverb_%s_pre_buffer: [%d]f32,\n", node.id, MAX_REVERB_PREDELAY_SAMPLES)
				// C5: the damping lowpass's one sample of memory, declared only
				// when the DSP line that reads it is emitted (reverb_damping_active).
				if reverb_damping_active(graph, plan, node) {
					fmt.sbprintf(&sb, "\treverb_%s_damp: f32,\n", node.id)
				}
			}
		}
	}
	for node in all_nodes {
		if !bus_nodes[node.id] do continue
		switch node.type {
		case "Filter":
			fmt.sbprintf(&sb, "\tfilter_%s_low: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tfilter_%s_band: f32,\n", node.id)
		case "LFO":
			fmt.sbprintf(&sb, "\tlfo_%s_phase: f32,\n", node.id)
		case "Noise":
			fmt.sbprintf(&sb, "\tnoise_%s_rng: PRNG_State,\n", node.id)
			if noise_is_pink(node) {
				fmt.sbprintf(&sb, "\tnoise_%s_p0: f32,\n", node.id)
				fmt.sbprintf(&sb, "\tnoise_%s_p1: f32,\n", node.id)
				fmt.sbprintf(&sb, "\tnoise_%s_p2: f32,\n", node.id)
			}
		case "SampleHold":
			fmt.sbprintf(&sb, "\tsh_%s_counter: u64,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_rng: PRNG_State,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%s_current_value: f32,\n", node.id)
		case "Distortion":
			fmt.sbprintf(&sb, "\tdist_%s_tone: f32,\n", node.id)
		}
	}

    for res in plan.stable_resolutions {
        fmt.sbprintf(&sb, "\t%s: f32,\n", res.field_name)
    }

    fmt.sbprint(&sb, "}\n\n")

	if has_bus_tail {
		// B7-2-followup / SKB-016: this used to be what _is_playing counted
		// down from on EVERY sample anything was sounding, which meant every
		// exposed tail parameter's RANGE MAXIMUM baked itself in permanently —
		// 202.5s-415s on real shipped content for a tail that was actually
		// under 2s. The live countdown below (bus_tail_seconds) replaced it.
		// This constant is kept only as a documented, compile-time WORST CASE
		// upper bound: the longest this asset's tail could ever be driven to
		// by any legal set_param sequence, for tooling/diagnostics that want
		// that number without instantiating a processor. Nothing in this
		// generated file reads it for the countdown any more.
		fmt.sbprintf(&sb, "%s_BUS_TAIL_SECONDS :: f32(%.9f)\n\n", namespace_prefix, bus_tail_seconds)

		fmt.sbprint(&sb, "// B7-2-followup / SKB-016: the LIVE counterpart to the worst-case constant\n")
		fmt.sbprint(&sb, "// above. Sums, over the same Delay/Reverb nodes compute_bus_tail_seconds\n")
		fmt.sbprint(&sb, "// analyzed, the same feedback_tail_seconds formula — but against each\n")
		fmt.sbprint(&sb, "// parameter's CURRENT value instead of its range maximum. Safe to call\n")
		fmt.sbprint(&sb, "// outside the audio path (once per note-off, not once per sample)\n")
		fmt.sbprint(&sb, "// because no Delay/Reverb parameter has a modulation port: get_f32_param\n")
		fmt.sbprint(&sb, "// resolves every one of them to either a plain field read or a literal,\n")
		fmt.sbprint(&sb, "// both valid wherever `p` is in scope.\n")
		fmt.sbprintf(&sb, "%s_bus_tail_seconds :: proc(p: ^%s_Processor) -> f32 {{\n", namespace_prefix, namespace_prefix)
		fmt.sbprint(&sb, "\ttotal: f32 = 0.0\n")
		for node in all_nodes {
			switch node.type {
			case "Delay":
				mix_str := get_f32_param(graph, plan, node, "mix", "", 0.5)
				if _, has_mix := node.parameters["mix"]; !has_mix {
					mix_str = get_f32_param(graph, plan, node, "wetDryMix", "", 0.5)
				}
				emit_f32_local(&sb, "\t", fmt.tprintf("mix_%s", node.id), fmt.tprintf("(%s)", mix_str))
				fmt.sbprintf(&sb, "\tif mix_%s > 0.0 {{\n", node.id)
				if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
					emit_f32_local(&sb, "\t\t", fmt.tprintf("period_%s", node.id), "0.0")
					fmt.sbprint(&sb, "\t\tif p.bpm > 0.0 {\n")
					fmt.sbprintf(&sb, "\t\t\tperiod_%s = %s\n", node.id, sec_expr)
					fmt.sbprint(&sb, "\t\t}\n")
				} else {
					time_str := get_f32_param(graph, plan, node, "delayTime", "", 0.5)
					emit_f32_local(&sb, "\t\t", fmt.tprintf("period_%s", node.id), fmt.tprintf("(%s)", time_str))
				}
				fdbk_str := get_f32_param(graph, plan, node, "feedback", "", 0.5)
				emit_f32_local(&sb, "\t\t", fmt.tprintf("fdbk_%s", node.id), fmt.tprintf("(%s)", fdbk_str))
				fmt.sbprintf(&sb, "\t\ttotal += skald_feedback_tail_seconds(period_%s, fdbk_%s)\n", node.id, node.id)
				fmt.sbprint(&sb, "\t}\n")
			case "Reverb":
				mix_str := get_f32_param(graph, plan, node, "mix", "", 0.5)
				if _, has_mix := node.parameters["mix"]; !has_mix {
					mix_str = get_f32_param(graph, plan, node, "wetDryMix", "", 0.5)
				}
				emit_f32_local(&sb, "\t", fmt.tprintf("mix_%s", node.id), fmt.tprintf("(%s)", mix_str))
				fmt.sbprintf(&sb, "\tif mix_%s > 0.0 {{\n", node.id)
				pre_str := get_f32_param(graph, plan, node, "preDelay", "", 0.02)
				emit_f32_local(&sb, "\t\t", fmt.tprintf("pre_%s", node.id), fmt.tprintf("math.clamp(f32(%s), 0.0, 0.25)", pre_str))
				decay_str := get_f32_param(graph, plan, node, "decay", "", 0.5)
				// Identical to the decay_gain expression generate_reverb_code
				// emits (same REVERB_COMB_SECONDS, same 0.01 floor, same 0.95
				// ceiling) — analysis, DSP and this live tail proc must not
				// disagree about how fast the comb decays.
				emit_f32_local(&sb, "\t\t", fmt.tprintf("decay_gain_%s", node.id), fmt.tprintf("math.clamp(math.pow(f32(0.001), f32(%.9f) / math.max(f32(%s), 0.01)), 0.0, 0.95)", REVERB_COMB_SECONDS, decay_str))
				fmt.sbprintf(&sb, "\t\ttotal += pre_%s + skald_feedback_tail_seconds(f32(%.9f), decay_gain_%s)\n", node.id, REVERB_COMB_SECONDS, node.id)
				fmt.sbprint(&sb, "\t}\n")
			}
		}
		fmt.sbprint(&sb, "\treturn total\n")
		fmt.sbprint(&sb, "}\n\n")
	}

	fmt.sbprintf(&sb, "%s_init :: proc(p: ^%s_Processor, sr: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tp.sample_rate = sr\n")
    fmt.sbprintf(&sb, "\tp.bpm = %.9f\n", bpm)
    fmt.sbprintf(&sb, "\tp.volume = %.9f\n", instrument.volume)
    fmt.sbprintf(&sb, "\tp.prng.state = 12345\n")
    fmt.sbprint(&sb, "\tp.loop = true\n")

    // SKB-018: _init assigned the scalar settings and the Delay/Reverb ring
    // buffers, and left everything else holding the previous run's values.
    // Reloading a level — a perfectly ordinary reason to call _init a second
    // time on the same processor — therefore restarted with voices still
    // flagged active (the next note_on allocated a SECOND voice and both
    // sounded), with the bus filters/LFOs/S&H holding mid-stream state, and
    // with the step clock parked wherever the last pattern stopped. This block
    // makes the contract "after _init the processor is indistinguishable from a
    // freshly zeroed one" true, which is what the double_init fixture asserts
    // bit-for-bit.
    //
    // ORDER IS LOAD-BEARING: `p.voices = {}` has to precede the per-voice PRNG
    // seeding below, and the bus-state zeroing has to precede the bus PRNG
    // seeding, or the reset wipes the seeds it was supposed to keep and every
    // Noise/SampleHold in the patch restarts from state 0 (which xorshift
    // latches on: next_float32's `if x == 0` guard papers over it with a fixed
    // 0xDEADBEEF, so the symptom is a patch that sounds subtly identical on
    // every voice rather than an obvious silence).
    fmt.sbprint(&sb, "\tp.voices = {}\n")
    fmt.sbprint(&sb, "\tp.total_samples = 0\n")
    fmt.sbprint(&sb, "\tp.playing = false\n")
    fmt.sbprint(&sb, "\tp.current_step = 0\n")
    fmt.sbprint(&sb, "\tp.samples_until_next_step = 0\n")
    fmt.sbprint(&sb, "\tp.step_frac_acc = 0.0\n")
    fmt.sbprint(&sb, "\tp.ext_in_l = 0.0\n")
    fmt.sbprint(&sb, "\tp.ext_in_r = 0.0\n")
    if has_bus_tail {
        fmt.sbprint(&sb, "\tp.bus_tail_remaining = 0\n")
        fmt.sbprint(&sb, "\tp.bus_tail_armed = false\n")
    }
    // Mirrors the bus-domain field emission in the _Processor struct above,
    // case for case. A node type that grows a bus-domain field there and not
    // here reintroduces exactly this bug for that one node.
    for node in all_nodes {
        if !bus_nodes[node.id] do continue
        switch node.type {
        case "Filter":
            fmt.sbprintf(&sb, "\tp.filter_%s_low = 0.0\n", node.id)
            fmt.sbprintf(&sb, "\tp.filter_%s_band = 0.0\n", node.id)
        case "LFO":
            fmt.sbprintf(&sb, "\tp.lfo_%s_phase = 0.0\n", node.id)
        case "Noise":
            if noise_is_pink(node) {
                fmt.sbprintf(&sb, "\tp.noise_%s_p0 = 0.0\n", node.id)
                fmt.sbprintf(&sb, "\tp.noise_%s_p1 = 0.0\n", node.id)
                fmt.sbprintf(&sb, "\tp.noise_%s_p2 = 0.0\n", node.id)
            }
        case "SampleHold":
            fmt.sbprintf(&sb, "\tp.sh_%s_counter = 0\n", node.id)
            fmt.sbprintf(&sb, "\tp.sh_%s_current_value = 0.0\n", node.id)
        case "Distortion":
            fmt.sbprintf(&sb, "\tp.dist_%s_tone = 0.0\n", node.id)
        }
    }

    needs_voice_rng_seed := false
    for node in all_nodes {
        if (node.type == "Noise" || node.type == "SampleHold") && !bus_nodes[node.id] {
            needs_voice_rng_seed = true
            break
        }
    }
    voice_seed: u32 = 0xC0FFEE01
    if needs_voice_rng_seed {
        fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
        fmt.sbprint(&sb, "\t\tv := &p.voices[i]\n")
        for node in all_nodes {
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
    for node in all_nodes {
        if !bus_nodes[node.id] do continue
        if node.type == "Noise" {
            fmt.sbprintf(&sb, "\tp.noise_%s_rng.state = u32(0x%08X)\n", node.id, voice_seed)
            voice_seed += 1
        } else if node.type == "SampleHold" {
            fmt.sbprintf(&sb, "\tp.sh_%s_rng.state = u32(0x%08X)\n", node.id, voice_seed)
            voice_seed += 1
        }
    }

	for node in all_nodes {
		if node.type != "Reverb" && node.type != "Delay" do continue
		fmt.sbprintf(&sb, "\tp.delay_%s_buffer = {{}}\n", node.id)
		fmt.sbprintf(&sb, "\tp.delay_%s_write_index = 0\n", node.id)
		if node.type == "Reverb" {
			fmt.sbprintf(&sb, "\tp.reverb_%s_pre_buffer = {{}}\n", node.id)
			if reverb_damping_active(graph, plan, node) {
				fmt.sbprintf(&sb, "\tp.reverb_%s_damp = 0.0\n", node.id)
			}
		}
	}

    for res in plan.stable_resolutions {
        fmt.sbprintf(&sb, "\tp.%s = %.9f\n", res.field_name, res.default)
    }

	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(&sb, "%s_note_on :: proc(p: ^%s_Processor, note: u8, velocity: f32, duration: f32) {{\n", namespace_prefix, namespace_prefix)
	// SKB-029: both arguments come straight from game code and were used raw.
	// A note above 127 is outside MIDI range and reached
	// `440 * pow(2, (note-69)/12)` unguarded — note 200 is a 45 kHz partial
	// that aliases into whatever it likes at 48 kHz; a velocity outside [0,1]
	// scaled the envelope past unity (or inverted the whole voice at a
	// negative one). Clamping is SILENT on purpose: these are called at audio
	// rate, from the sequencer as well as from the host, so a per-call
	// diagnostic would be the louder bug. The clamp lives here rather than in
	// _trigger and the wasm shim's skald_note_on/skald_trigger because both of
	// those funnel through this proc — one gate, no second copy to drift.
	fmt.sbprint(&sb, "\t// note and velocity are clamped silently to their MIDI/normalized domains.\n")
	fmt.sbprint(&sb, "\tnote := note\n")
	fmt.sbprint(&sb, "\tif note > 127 do note = 127\n")
	fmt.sbprint(&sb, "\tvelocity := math.clamp(velocity, 0.0, 1.0)\n")
	fmt.sbprint(&sb, "\tvoice_idx := -1\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tif !p.voices[i].active {\n")
	fmt.sbprint(&sb, "\t\t\tvoice_idx = i\n")
	fmt.sbprint(&sb, "\t\t\tbreak\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\tstolen := false\n")
	fmt.sbprint(&sb, "\tif voice_idx == -1 {\n")
	fmt.sbprint(&sb, "\t\tstolen = true\n")
	// C6-1 (F-B03-3, F-B03-6): release-first, then oldest. A pure oldest-by-age
	// steal cut the note the player was still holding while a voice that was
	// only fading out kept its slot. A voice is "releasing" when every
	// voice-domain ADSR has left Attack/Decay/Sustain; note_off releases them
	// all at once, so one envelope lagging another cannot happen. Strict `>`
	// on age keeps the lowest index on a tie, so the same voice is stolen on
	// every run. A graph with no ADSR has no release tier and keeps the plain
	// oldest-voice rule.
	steal_adsr_ids := make([dynamic]string, context.temp_allocator)
	for node in all_nodes {
		if node.type == "ADSR" && !bus_nodes[node.id] do append(&steal_adsr_ids, node.id)
	}
	if len(steal_adsr_ids) > 0 {
		fmt.sbprint(&sb, "\t\toldest_releasing_age: f32 = -1.0\n")
		fmt.sbprintf(&sb, "\t\tfor i in 0..<%d {{\n", polyphony)
		fmt.sbprint(&sb, "\t\t\treleasing := true\n")
		for id in steal_adsr_ids {
			fmt.sbprintf(&sb, "\t\t\tif p.voices[i].adsr_%s_stage != .Release && p.voices[i].adsr_%s_stage != .Idle do releasing = false\n", id, id)
		}
		fmt.sbprint(&sb, "\t\t\tif releasing && p.voices[i].age > oldest_releasing_age {\n")
		fmt.sbprint(&sb, "\t\t\t\toldest_releasing_age = p.voices[i].age\n")
		fmt.sbprint(&sb, "\t\t\t\tvoice_idx = i\n")
		fmt.sbprint(&sb, "\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t}\n")
		fmt.sbprint(&sb, "\t\tif voice_idx == -1 {\n")
		fmt.sbprint(&sb, "\t\t\toldest_age: f32 = -1.0\n")
		fmt.sbprintf(&sb, "\t\t\tfor i in 0..<%d {{\n", polyphony)
		fmt.sbprint(&sb, "\t\t\t\tif p.voices[i].age > oldest_age {\n")
		fmt.sbprint(&sb, "\t\t\t\t\toldest_age = p.voices[i].age\n")
		fmt.sbprint(&sb, "\t\t\t\t\tvoice_idx = i\n")
		fmt.sbprint(&sb, "\t\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t}\n")
	} else {
		fmt.sbprint(&sb, "\t\toldest_age: f32 = -1.0\n")
		fmt.sbprintf(&sb, "\t\tfor i in 0..<%d {{\n", polyphony)
		fmt.sbprint(&sb, "\t\t\tif p.voices[i].age > oldest_age {\n")
		fmt.sbprint(&sb, "\t\t\t\toldest_age = p.voices[i].age\n")
		fmt.sbprint(&sb, "\t\t\t\tvoice_idx = i\n")
		fmt.sbprint(&sb, "\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t}\n")
	}
	fmt.sbprint(&sb, "\t}\n\n")

	fmt.sbprint(&sb, "\tv := &p.voices[voice_idx]\n")
	fmt.sbprint(&sb, "\tprev_freq := v.current_freq\n")
	for node in all_nodes {
		if node.type != "ADSR" || bus_nodes[node.id] do continue
		release_str := get_f32_param(graph, plan, node, "release", "", 0.1)
		fmt.sbprintf(&sb, "\tadsr_%s_prev_level: f32 = 0.0\n", node.id)
		fmt.sbprintf(&sb, "\tif stolen && v.adsr_%s_stage != .Idle {{\n", node.id)
		fmt.sbprintf(&sb, "\t\tadsr_%s_prev_level = v.adsr_%s_release_level\n", node.id, node.id)
		fmt.sbprintf(&sb, "\t\tif v.adsr_%s_stage == .Release {{\n", node.id)
		emit_f32_local(&sb, "\t\t\t", fmt.tprintf("rel_t_%s", node.id), fmt.tprintf("(%s)", release_str))
		fmt.sbprintf(&sb, "\t\t\tif rel_t_%s > 0.0 {{\n", node.id)
		fmt.sbprintf(&sb, "\t\t\t\trf_%s := 1.0 - (v.age - v.time_released) / math.max(rel_t_%s, 0.000001)\n", node.id, node.id)
		fmt.sbprintf(&sb, "\t\t\t\tif rf_%s < 0.0 do rf_%s = 0.0\n", node.id, node.id)
		fmt.sbprintf(&sb, "\t\t\t\tadsr_%s_prev_level *= rf_%s\n", node.id, node.id)
		fmt.sbprint(&sb, "\t\t\t} else {\n")
		fmt.sbprintf(&sb, "\t\t\t\tadsr_%s_prev_level = 0.0\n", node.id)
		fmt.sbprint(&sb, "\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t}\n")
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "\tv.active = true\n")
	fmt.sbprint(&sb, "\tv.note = note\n")
	fmt.sbprint(&sb, "\tv.velocity = velocity\n")
    fmt.sbprint(&sb, "\tv.age = 0.0\n")
    fmt.sbprint(&sb, "\tv.time_released = 0.0\n")
    fmt.sbprint(&sb, "\tfreq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)\n")
	fmt.sbprint(&sb, "\tv.target_freq = freq\n")
    fmt.sbprintf(&sb, "\tv.glide_time = %.9f\n", instrument.glide)
	fmt.sbprint(&sb, "\tif stolen && v.glide_time > 0.0 && prev_freq > 0.0 {\n")
	fmt.sbprint(&sb, "\t\tv.current_freq = prev_freq\n")
	fmt.sbprint(&sb, "\t} else {\n")
	fmt.sbprint(&sb, "\t\tv.current_freq = freq\n")
	fmt.sbprint(&sb, "\t}\n")
    fmt.sbprint(&sb, "\tv.duration = duration\n")

	for node in all_nodes {
		if bus_nodes[node.id] do continue
		if node.type != "ADSR" do continue
		fmt.sbprintf(&sb, "\tv.adsr_%s_stage = .Attack\n", node.id)
		fmt.sbprintf(&sb, "\tv.adsr_%s_attack_start = adsr_%s_prev_level\n", node.id, node.id)
		fmt.sbprintf(&sb, "\tv.adsr_%s_release_level = adsr_%s_prev_level\n", node.id, node.id)
	}
	{
		reset_sb := strings.builder_make()
		defer strings.builder_destroy(&reset_sb)
		for node in all_nodes {
			if bus_nodes[node.id] do continue
			switch node.type {
			case "Filter":
				fmt.sbprintf(&reset_sb, "\t\tv.filter_%s_low = 0.0\n", node.id)
				fmt.sbprintf(&reset_sb, "\t\tv.filter_%s_band = 0.0\n", node.id)
			case "Oscillator":
				fmt.sbprintf(&reset_sb, "\t\tv.osc_%s_phase = {{}}\n", node.id)
			case "FmOperator":
				fmt.sbprintf(&reset_sb, "\t\tv.fm_%s_phase = {{}}\n", node.id)
			case "Wavetable":
				fmt.sbprintf(&reset_sb, "\t\tv.wavetable_%s_phase = {{}}\n", node.id)
			case "Distortion":
				fmt.sbprintf(&reset_sb, "\t\tv.dist_%s_tone = 0.0\n", node.id)
			// C6-2 (F-B03-2): the reset used to stop at the audio-path nodes, so a
			// per-voice LFO carried its phase over from the previous note and the
			// same patch sounded different on every retrigger. The rule is now
			// "a fresh voice starts every TIME-based state from zero": LFO phase
			// restarts, Sample & Hold draws a new held value at note start and
			// steps one full interval later. Noise is deliberately NOT touched:
			// its only state is an RNG stream (reseeding it would make every note
			// the same noise burst) and the pink filter's smoothing memory.
			case "LFO":
				fmt.sbprintf(&reset_sb, "\t\tv.lfo_%s_phase = 0.0\n", node.id)
			case "SampleHold":
				fmt.sbprintf(&reset_sb, "\t\tv.sh_%s_counter = 0\n", node.id)
				fmt.sbprintf(&reset_sb, "\t\tv.sh_%s_current_value = next_float32(&v.sh_%s_rng) * 2.0 - 1.0\n", node.id, node.id)
			}
		}
		if strings.builder_len(reset_sb) > 0 {
			fmt.sbprint(&sb, "\tif !stolen {\n")
			fmt.sbprint(&sb, strings.to_string(reset_sb))
			fmt.sbprint(&sb, "\t}\n")
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	first_adsr_id := ""
	for node in all_nodes {
		if node.type == "ADSR" {
			first_adsr_id = node.id
			break
		}
	}
	fmt.sbprintf(&sb, "%s_note_off :: proc(p: ^%s_Processor, note: u8) {{\n", namespace_prefix, namespace_prefix)
	// SKB-029: this clamp is not defence in depth, it is the OTHER HALF of the
	// one in _note_on. `note` is the voice-lookup key, so the two procs have to
	// agree on the mapping or the key stops matching: _note_on(200) stores
	// v.note = 127, and an unclamped _note_off(200) then finds no voice with
	// note == 200 and releases nothing. On the held-note path (duration 0, the
	// documented "drive _note_on/_note_off yourself" API) that voice never
	// leaves .active — it burns a polyphony slot and pins _is_playing true
	// forever. Clamping only the setter side turned an out-of-range note from
	// an aliased pitch into a permanently stuck voice.
	fmt.sbprint(&sb, "\t// Clamped to match _note_on: `note` is the voice key, so both must map it.\n")
	fmt.sbprint(&sb, "\tnote := note\n")
	fmt.sbprint(&sb, "\tif note > 127 do note = 127\n")
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
		for node in all_nodes {
			if node.type == "ADSR" {
				fmt.sbprintf(&sb, "\t\tp.voices[best].adsr_%s_stage = .Release\n", node.id)
			}
		}
	} else {
		fmt.sbprint(&sb, "\t\tp.voices[best].active = false\n")
	}
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_trigger :: proc(p: ^%s_Processor, note: u8 = 60, velocity: f32 = 1.0, duration: f32 = 0.0) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\td := duration\n")
	fmt.sbprint(&sb, "\tif d <= 0.0 {\n")
	{
		has_adsr := false
		for node in all_nodes {
			if node.type == "ADSR" && !bus_nodes[node.id] {
				has_adsr = true
				break
			}
		}
		if has_adsr {
			fmt.sbprint(&sb, "\t\td = 0.0\n")
			for node in all_nodes {
				if node.type != "ADSR" || bus_nodes[node.id] do continue
				atk := get_f32_param(graph, plan, node, "attack", "", 0.1)
				dec := get_f32_param(graph, plan, node, "decay", "", 0.1)
				fmt.sbprintf(&sb, "\t\tif (%s) + (%s) > d do d = (%s) + (%s)\n", atk, dec, atk, dec)
			}
			fmt.sbprint(&sb, "\t\tif d <= 0.0 do d = 0.001\n")
		} else {
			fmt.sbprint(&sb, "\t\td = 1.0\n")
		}
	}
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprintf(&sb, "\t%s_note_on(p, note, velocity, d)\n", namespace_prefix)
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_feed_input :: proc(p: ^%s_Processor, in_left: f32, in_right: f32) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.ext_in_l = in_left\n")
	fmt.sbprint(&sb, "\tp.ext_in_r = in_right\n")
	fmt.sbprint(&sb, "}\n\n")

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

	fmt.sbprintf(
		&sb,
		"%s_stop :: proc(p: ^%s_Processor) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.playing = false\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_set_loop :: proc(p: ^%s_Processor, loop: bool) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.loop = loop\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_set_volume :: proc(p: ^%s_Processor, value: f32) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tp.volume = math.clamp(value, 0.0, 1.0)\n")
	fmt.sbprint(&sb, "}\n\n")

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
	if has_bus_tail {
		fmt.sbprint(&sb, "\t// The effect tail counts as playing: it is still audible after every\n")
		fmt.sbprint(&sb, "\t// voice went inactive, and reporting false here is what let a game free\n")
		fmt.sbprint(&sb, "\t// the asset mid-echo.\n")
		fmt.sbprint(&sb, "\tif p.bus_tail_remaining > 0 do return true\n")
	}
	fmt.sbprint(&sb, "\treturn false\n")
	fmt.sbprint(&sb, "}\n\n")

	for res in plan.stable_resolutions {
		fmt.sbprintf(
			&sb,
			"%s_set_%s :: proc(p: ^%s_Processor, value: f32) {{\n",
			namespace_prefix,
			res.field_name,
			namespace_prefix,
		)
		fmt.sbprint(&sb, "\tv := value\n")
		fmt.sbprintf(&sb, "\tif v < %.9f do v = %.9f\n", res.range_min, res.range_min)
		fmt.sbprintf(&sb, "\tif v > %.9f do v = %.9f\n", res.range_max, res.range_max)
		fmt.sbprintf(&sb, "\tp.%s = v\n", res.field_name)
		fmt.sbprint(&sb, "}\n\n")
	}

	fmt.sbprintf(&sb, "%s_PARAMS := []Skald_Param_Info{{\n", namespace_prefix)
	for res in plan.stable_resolutions {
		fmt.sbprintf(
			&sb,
			"\t{{\"%s\", %.9f, %.9f, %.9f, \"%s\"}},\n",
			res.field_name,
			res.range_min,
			res.range_max,
			res.default,
			res.unit,
		)
	}
	fmt.sbprint(&sb, "}\n\n")

	param_aliases := make([]string, len(plan.stable_resolutions))
	defer delete(param_aliases)
	{
		seen_aliases := make(map[string]bool)
		defer delete(seen_aliases)
		for res, i in plan.stable_resolutions {
			raw := res.node_raw_id
			if raw == "" do raw = res.node_id
			if !node_key_emittable(raw) do continue
			alias := fmt.aprintf("%s::%s", raw, res.param_name)
			if seen_aliases[alias] do continue
			seen_aliases[alias] = true
			param_aliases[i] = alias
		}
	}

	fmt.sbprintf(
		&sb,
		"%s_set_param :: proc(p: ^%s_Processor, name: string, value: f32) -> bool {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	if len(plan.stable_resolutions) > 0 {
		fmt.sbprint(&sb, "\tswitch name {\n")
		for res, i in plan.stable_resolutions {
			emit_param_case(&sb, res, param_aliases[i])
			fmt.sbprintf(&sb, "\t\t%s_set_%s(p, value)\n", namespace_prefix, res.field_name)
			fmt.sbprint(&sb, "\t\treturn true\n")
		}
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "\treturn false\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_get_param :: proc(p: ^%s_Processor, name: string) -> (f32, bool) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	if len(plan.stable_resolutions) > 0 {
		fmt.sbprint(&sb, "\tswitch name {\n")
		for res, i in plan.stable_resolutions {
			emit_param_case(&sb, res, param_aliases[i])
			fmt.sbprintf(&sb, "\t\treturn p.%s, true\n", res.field_name)
		}
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "\treturn 0.0, false\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(
		&sb,
		"%s_process :: proc(p: ^%s_Processor) -> (f32, f32) {{\n",
		namespace_prefix,
		namespace_prefix,
	)
	fmt.sbprint(&sb, "\tsample_rate := p.sample_rate\n")
	fmt.sbprint(&sb, "\toutput_left: f32 = 0.0\n")
	fmt.sbprint(&sb, "\toutput_right: f32 = 0.0\n")

    if asset_type == .Music_Layer {
        fmt.sbprintf(&sb, "\t%s_process_sequence(p)\n", namespace_prefix)
    }
    fmt.sbprint(&sb, "\tp.total_samples += 1\n\n")

	for var_name in cross_vars_ordered {
		fmt.sbprintf(&sb, "\t%s_vsum: f32 = 0.0\n", var_name)
	}

	fmt.sbprintf(&sb, "\tfor v_idx in 0..<%d {{\n", polyphony)
	fmt.sbprint(&sb, "\t\tvoice := &p.voices[v_idx]\n")
	fmt.sbprint(&sb, "\t\tif !voice.active do continue\n\n")
    fmt.sbprint(&sb, "\t\tvoice.age += 1.0 / sample_rate;\n")

	if instrument.glide > 0.0 {
		fmt.sbprint(&sb, "\t\tif voice.current_freq != voice.target_freq {\n")
		fmt.sbprint(&sb, "\t\t\tglide_k := 1.0 / math.max(voice.glide_time * sample_rate, 1.0)\n")
		fmt.sbprint(&sb, "\t\t\tif glide_k > 1.0 do glide_k = 1.0\n")
		fmt.sbprint(&sb, "\t\t\tvoice.current_freq += (voice.target_freq - voice.current_freq) * glide_k\n")
		fmt.sbprint(&sb, "\t\t\tif abs(voice.target_freq - voice.current_freq) < 0.1 do voice.current_freq = voice.target_freq\n")
		fmt.sbprint(&sb, "\t\t}\n")
	}
    
    fmt.sbprint(&sb, "\t\tif voice.age >= voice.duration && voice.duration > 0.0 {\n")
	for node in all_nodes {
		if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\t\t\tif voice.adsr_%s_stage != .Release && voice.adsr_%s_stage != .Idle {{\n", node.id, node.id)
			fmt.sbprintf(&sb, "\t\t\t\tvoice.adsr_%s_stage = .Release\n", node.id)
			fmt.sbprint(&sb, "\t\t\t\tvoice.time_released = voice.age\n")
			fmt.sbprint(&sb, "\t\t\t}\n")
		}
	}
    fmt.sbprint(&sb, "\t\t}\n")

    has_adsr_in_graph := false
    for node in all_nodes {
        if node.type == "ADSR" {
            has_adsr_in_graph = true
            break
        }
    }
    if has_adsr_in_graph {
        fmt.sbprint(&sb, "\t\tvoice_busy := false\n")
    }
    // C6-3: without an ADSR nothing shapes the voice's end, so the processor
    // applies the de-click fade itself, on every path a voice feeds — the
    // direct GraphOutput adds and the per-voice sums that carry it into bus
    // nodes. With an ADSR the envelope owns the tail and the suffix is empty,
    // which also keeps every ADSR patch's emitted text unchanged.
    voice_gain_suffix := has_adsr_in_graph ? "" : " * voice_gain"
    if !has_adsr_in_graph {
        fmt.sbprint(&sb, "\t\tvoice_gain: f32 = 1.0\n")
        fmt.sbprint(&sb, "\t\tif voice.duration > 0.0 && voice.age > voice.duration {\n")
        fmt.sbprintf(&sb, "\t\t\tvoice_gain = 1.0 - (voice.age - voice.duration) / %s\n", f32_literal(NOADSR_FADE_SECONDS))
        fmt.sbprint(&sb, "\t\t\tif voice_gain < 0.0 do voice_gain = 0.0\n")
        fmt.sbprint(&sb, "\t\t}\n")
    }

	for node in all_nodes {
		if bus_nodes[node.id] do continue
		fmt.sbprintf(&sb, "\t\tnode_%s_out: f32 = 0.0\n", node.id)
		if node.type == "Panner" {
			fmt.sbprintf(&sb, "\t\tnode_%s_out_left: f32 = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\t\tnode_%s_out_right: f32 = 0.0\n", node.id)
		}
	}
	fmt.sbprint(&sb, "\n")

    for node in sorted_nodes {
        if bus_nodes[node.id] && node.type != "GraphOutput" do continue
        switch node.type {
        case "Oscillator":
            generate_oscillator_code(&sb, node, graph, plan, instrument)
        case "ADSR":
            generate_adsr_code(&sb, node, graph, plan)
        case "Filter":
             generate_filter_code(&sb, node, graph, plan, "voice.")
        case "Gain":
             generate_gain_code(&sb, node, graph, plan)
        case "Distortion":
             generate_distortion_code(&sb, node, graph, plan, "voice.")
        case "Noise":
             generate_noise_code(&sb, node, graph, plan, "voice.")
        case "Mixer":
             generate_mixer_code(&sb, node, graph, plan)
        case "Mapper":
             generate_mapper_code(&sb, node, graph, plan)
        case "MidiInput":
             generate_midi_input_code(&sb, node, graph, plan)
        case "Panner":
             generate_panner_code(&sb, node, graph, plan)
        case "LFO":
             generate_lfo_code(&sb, node, graph, plan, "voice.")
        case "FmOperator":
             generate_fm_operator_code(&sb, node, graph, plan, instrument)
        case "Wavetable":
             generate_wavetable_code(&sb, node, graph, plan, instrument)
        case "SampleHold":
             generate_sample_hold_code(&sb, node, graph, plan, "voice.")
        case "GraphOutput":
             generate_graph_output_adds(&sb, node, graph, bus_nodes, false, voice_gain_suffix)
        case:
            // The message has always said "refusing"; until packet B9-1 the
            // branch then fell through, the file was written and main printed
            // "Codegen OK" (the nested-Instrument case, SKB-028, reached here
            // and exited 0 with the node's output stuck at 0.0). Exit for real.
            fmt.eprintf(
                "Error: unknown node type %q (node id %s) in instrument %q — no code generator exists for it. Refusing to generate a silently-broken patch.\n",
                node.type, node.id, instrument.name)
            os.exit(1)
        }
    }

	for var_name in cross_vars_ordered {
		fmt.sbprintf(&sb, "\t\t%s_vsum += %s%s\n", var_name, var_name, voice_gain_suffix)
	}

        has_adsr := false
        for node in all_nodes {
            if node.type == "ADSR" {
                has_adsr = true
                fmt.sbprintf(&sb, "\t\tif voice.adsr_%s_stage != .Idle do voice_busy = true\n", node.id)
            }
        }

        if has_adsr {
            fmt.sbprint(&sb, "\t\tif !voice_busy do voice.active = false\n")
        } else {
            fmt.sbprintf(
                &sb,
                "\t\tif voice.duration > 0.0 && voice.age >= voice.duration + %s do voice.active = false\n",
                f32_literal(NOADSR_FADE_SECONDS),
            )
        }

	fmt.sbprint(&sb, "\t}\n")

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
		for var_name in cross_vars_ordered {
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
			case "GraphInput":
				fmt.sbprintf(&sb, "\t\t// --- Instrument Input %s (fed by <Foo>_feed_input) ---\n", node.id)
				fmt.sbprintf(&sb, "\t\tnode_%s_out = (p.ext_in_l + p.ext_in_r) * 0.5\n\n", node.id)
			case "Filter":
				generate_filter_code(&sb, node, graph, plan, "p.")
			case "Gain":
				generate_gain_code(&sb, node, graph, plan)
			case "Distortion":
				generate_distortion_code(&sb, node, graph, plan, "p.")
			case "Delay":
				generate_delay_code(&sb, node, graph, plan)
			case "Reverb":
				generate_reverb_code(&sb, node, graph, plan)
			case "Noise":
				generate_noise_code(&sb, node, graph, plan, "p.")
			case "Mixer":
				generate_mixer_code(&sb, node, graph, plan)
			case "Mapper":
				generate_mapper_code(&sb, node, graph, plan)
			case "Panner":
				generate_panner_code(&sb, node, graph, plan)
			case "LFO":
				generate_lfo_code(&sb, node, graph, plan, "p.")
			case "SampleHold":
				generate_sample_hold_code(&sb, node, graph, plan, "p.")
			case "GraphOutput":
				generate_graph_output_adds(&sb, node, graph, bus_nodes, true)
			case:
				fmt.eprintf(
					"Error: node type %q (node id %s) in instrument %q cannot run downstream of a Delay/Reverb (bus domain) — it would have been silently dropped. Move it upstream of the Delay/Reverb or remove that wire.\n",
					node.type, node.id, instrument.name)
			}
		}
		fmt.sbprint(&sb, "\t}\n")
	}

	if has_bus_tail {
		fmt.sbprint(&sb, "\n\t// B7-2-followup / SKB-016: a baked worst-case constant here held\n")
		fmt.sbprint(&sb, "\t// is_playing true for minutes on real content (every exposed tail param\n")
		fmt.sbprint(&sb, "\t// contributed its range maximum, so glassy-fm-pluck alone baked 202.5s\n")
		fmt.sbprint(&sb, "\t// for a true tail under 2s). Arm on the FALLING EDGE instead, from the\n")
		fmt.sbprint(&sb, "\t// live field values — that is one ln/pow per note-off rather than per\n")
		fmt.sbprint(&sb, "\t// sample, which is what keeps this proc off the audio path.\n")
		fmt.sbprint(&sb, "\t{\n")
		fmt.sbprint(&sb, "\t\tvoice_alive := false\n")
		fmt.sbprintf(&sb, "\t\tfor i in 0..<%d {{\n", polyphony)
		fmt.sbprint(&sb, "\t\t\tif p.voices[i].active {\n")
		fmt.sbprint(&sb, "\t\t\t\tvoice_alive = true\n")
		fmt.sbprint(&sb, "\t\t\t\tbreak\n")
		fmt.sbprint(&sb, "\t\t\t}\n")
		fmt.sbprint(&sb, "\t\t}\n")
		fmt.sbprint(&sb, "\t\tif voice_alive || p.playing {\n")
		fmt.sbprint(&sb, "\t\t\tp.bus_tail_armed = false\n")
		fmt.sbprint(&sb, "\t\t\tp.bus_tail_remaining = 0\n")
		fmt.sbprint(&sb, "\t\t} else if !p.bus_tail_armed {\n")
		fmt.sbprint(&sb, "\t\t\tp.bus_tail_armed = true\n")
		fmt.sbprintf(&sb, "\t\t\tp.bus_tail_remaining = u64(%s_bus_tail_seconds(p) * sample_rate)\n", namespace_prefix)
		fmt.sbprint(&sb, "\t\t} else if p.bus_tail_remaining > 0 {\n")
		fmt.sbprint(&sb, "\t\t\tp.bus_tail_remaining -= 1\n")
		fmt.sbprint(&sb, "\t\t}\n")
		fmt.sbprint(&sb, "\t}\n")
	}

	if instrument.limit {
		fmt.sbprint(&sb, "\treturn skald_soft_limit(output_left * p.volume, output_right * p.volume)\n")
	} else {
		fmt.sbprint(&sb, "\t// limit: false authored on this instrument — output is deliberately unclamped.\n")
		fmt.sbprint(&sb, "\treturn output_left * p.volume, output_right * p.volume\n")
	}
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}
