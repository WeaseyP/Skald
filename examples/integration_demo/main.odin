// =====================================================================
// Skald integration demo — what consuming a generated `.odin` package
// from a real game looks like. No `project_*` wrapper used; the demo
// drives the per-asset SFX and Music Layer APIs directly, the same way
// game code would.
//
// Asset 1 — Sfx (SFX, exposed `cutoff`):
//   Sfx_init      — call once at startup with the device sample rate
//   Sfx_trigger   — fire a one-shot (note, velocity, duration=0 = play
//                   through full envelope to natural release)
//   Sfx_set_cutoff — runtime parameter sweep (also via Sfx_set_param)
//   Sfx_process   — pull (l, r) per audio frame
//
// Asset 2 — Layer (Music Layer):
//   Layer_init    — call once at startup
//   Layer_start   — kick off the sequencer pattern from step 0
//   Layer_stop    — halt; current voices release naturally via envelope
//   Layer_process — pull (l, r) per audio frame
//
// Modes:
//   integration_demo.exe                       — full scripted timeline (default)
//   integration_demo.exe -mode:sfx-once        — fire one SFX, exit when it finishes
//   integration_demo.exe -mode:sfx-loop        — re-trigger SFX every 1.5s
//   integration_demo.exe -mode:layer           — start music layer, run until Ctrl-C
//   integration_demo.exe -mode:full-demo       — same as default
//   integration_demo.exe -mode:silent-test     — render 1s in-memory, no audio device,
//                                                exit 0 if no crash. For CI / smoke check.
// =====================================================================
package main

import "core:fmt"
import "core:mem"
import "core:os"
import "core:strings"
import "core:sync"
import "core:thread"
import "core:time"
import ma "vendor:miniaudio"
import ga "generated_audio"

SAMPLE_RATE :: 48000
RING_CAPACITY :: 16384 // interleaved L,R samples — large enough to absorb scheduler jitter

Demo_Mode :: enum {
	Full_Demo,
	Sfx_Once,
	Sfx_Loop,
	Layer_Only,
	Silent_Test,
}

Ring_Buffer :: struct {
	data:      [RING_CAPACITY]f32,
	write_pos: int,
	read_pos:  int,
}

App_State :: struct {
	sfx:               ga.Sfx_Processor,
	layer:             ga.Layer_Processor,
	device:            ma.device,
	ring:              Ring_Buffer,
	mutex:             sync.Mutex,
	is_running:        bool,
	mode:              Demo_Mode,
	// Monotonic sample clock used to drive the scripted timeline so it stays
	// in lock-step with the audio rendering, regardless of OS scheduler jitter.
	frames_processed:  u64,
	// Per-mode state.
	sfx_loop_next:     u64, // next sample at which sfx-loop mode re-triggers
	timeline_index:    int, // index into demo_timeline[]
	sweep_started:     bool,
	sweep_start_frame: u64,
}

main :: proc() {
	mode := Demo_Mode.Full_Demo
	for arg in os.args[1:] {
		switch {
		case strings.has_prefix(arg, "-mode:"):
			tail := arg[6:]
			switch tail {
			case "sfx-once":    mode = .Sfx_Once
			case "sfx-loop":    mode = .Sfx_Loop
			case "layer":       mode = .Layer_Only
			case "full-demo":   mode = .Full_Demo
			case "silent-test": mode = .Silent_Test
			case:               fmt.eprintfln("unknown mode %q, defaulting to full-demo", tail)
			}
		}
	}

	app: App_State
	app.mode = mode
	app.is_running = true
	ga.Sfx_init(&app.sfx, f32(SAMPLE_RATE))
	ga.Layer_init(&app.layer, f32(SAMPLE_RATE))

	// Mode-specific setup that needs to run before the audio thread starts.
	switch mode {
	case .Sfx_Once:
		ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.5) // A4, 500ms
	case .Sfx_Loop:
		ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.5)
		app.sfx_loop_next = u64(f32(SAMPLE_RATE) * 1.5)
	case .Layer_Only:
		ga.Layer_start(&app.layer)
	case .Full_Demo:
		// Timeline events fire from the producer thread (see check_timeline).
	case .Silent_Test:
		run_silent_test(&app)
		return
	}

	// Audio device.
	device_config := ma.device_config_init(.playback)
	device_config.playback.format = .f32
	device_config.playback.channels = 2
	device_config.sampleRate = SAMPLE_RATE
	device_config.dataCallback = audio_callback
	device_config.pUserData = &app

	if ma.device_init(nil, &device_config, &app.device) != .SUCCESS {
		fmt.eprintln("Failed to initialize audio device. (Try -mode:silent-test for a no-device smoke check.)")
		os.exit(1)
	}
	defer ma.device_uninit(&app.device)

	fmt.printf("Audio device: %s @ %d Hz, mode=%v\n", app.device.playback.name, SAMPLE_RATE, mode)

	thread.run_with_data(&app, producer_thread)

	if ma.device_start(&app.device) != .SUCCESS {
		fmt.eprintln("Failed to start audio device.")
		app.is_running = false
		os.exit(1)
	}
	defer ma.device_stop(&app.device)

	// Per-mode shutdown semantics.
	switch mode {
	case .Sfx_Once:
		// Wait for the SFX to drain, then exit. Polling is_playing is the
		// game-side check the prompt's API contract guarantees.
		for ga.Sfx_is_playing(&app.sfx) {
			time.sleep(50 * time.Millisecond)
		}
		// Allow the ring buffer to drain so the tail of the envelope reaches
		// the speakers before we tear down the device.
		time.sleep(200 * time.Millisecond)
		fmt.println("SFX finished playing.")
	case .Full_Demo:
		// 8-second timeline; producer handles events. Wait for it to finish.
		target_frames := u64(f32(SAMPLE_RATE) * 8.5)
		for sync.atomic_load(&app.frames_processed) < target_frames {
			time.sleep(100 * time.Millisecond)
		}
		fmt.println("Full demo timeline complete.")
	case .Silent_Test:
		// already returned above
	case .Sfx_Loop, .Layer_Only:
		fmt.println("Playing... Press Ctrl+C to quit.")
		for {
			time.sleep(100 * time.Millisecond)
		}
	}

	app.is_running = false
}

// ----- Audio thread (consumer) -----

audio_callback :: proc "c" (p_device: ^ma.device, p_output: rawptr, p_input: rawptr, frame_count: u32) {
	app := (^App_State)(p_device.pUserData)
	out := mem.slice_ptr((^f32)(p_output), int(frame_count * p_device.playback.channels))

	sync.lock(&app.mutex)
	for i in 0 ..< len(out) {
		if app.ring.read_pos == app.ring.write_pos {
			out[i] = 0
		} else {
			out[i] = app.ring.data[app.ring.read_pos]
			app.ring.read_pos = (app.ring.read_pos + 1) % RING_CAPACITY
		}
	}
	sync.unlock(&app.mutex)
}

// ----- Producer thread (renders frames into the ring) -----

producer_thread :: proc(data: rawptr) {
	app := (^App_State)(data)

	for app.is_running {
		buffer_full := false
		sync.lock(&app.mutex)

		samples_in_buffer := app.ring.write_pos - app.ring.read_pos
		if samples_in_buffer < 0 do samples_in_buffer += RING_CAPACITY

		if samples_in_buffer < RING_CAPACITY - 2 {
			// Mode-specific event firing: must run BEFORE this frame is
			// rendered so newly-triggered notes are heard at the expected
			// sample boundary.
			handle_mode_events(app)

			// Mix the two assets. In a real game this would happen alongside
			// any number of other Sfx/Layer/etc. processors.
			sfx_l, sfx_r := ga.Sfx_process(&app.sfx)
			layer_l, layer_r := ga.Layer_process(&app.layer)
			l := (sfx_l + layer_l) * 0.6
			r := (sfx_r + layer_r) * 0.6

			app.ring.data[app.ring.write_pos] = l
			app.ring.write_pos = (app.ring.write_pos + 1) % RING_CAPACITY
			app.ring.data[app.ring.write_pos] = r
			app.ring.write_pos = (app.ring.write_pos + 1) % RING_CAPACITY

			sync.atomic_add(&app.frames_processed, 1)
		} else {
			buffer_full = true
		}

		sync.unlock(&app.mutex)
		if buffer_full {
			time.sleep(1 * time.Millisecond)
		}
	}
}

// ----- Mode dispatch (called per-frame from producer) -----

handle_mode_events :: proc(app: ^App_State) {
	#partial switch app.mode {
	case .Sfx_Loop:
		if app.frames_processed >= app.sfx_loop_next {
			ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.5)
			app.sfx_loop_next = app.frames_processed + u64(f32(SAMPLE_RATE) * 1.5)
		}
	case .Full_Demo:
		check_timeline(app)
	}
}

// Demo timeline. Each event has a sample-count timestamp and a callback.
// Sample-count is monotonic (driven by frames_processed) and integer-clean
// at 48kHz, so the scheduling is exactly repeatable.
Timeline_Event :: struct {
	at_seconds: f32,
	desc:       string,
	fn:         proc(app: ^App_State),
}

demo_timeline := [?]Timeline_Event{
	{0.5, "Sfx_trigger #1", proc(app: ^App_State) { ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.4) }},
	{1.5, "Sfx_trigger #2", proc(app: ^App_State) { ga.Sfx_trigger(&app.sfx, 72, 1.0, 0.4) }},
	{2.0, "Layer_start", proc(app: ^App_State) { ga.Layer_start(&app.layer) }},
	{4.0, "Sfx_trigger + cutoff sweep", proc(app: ^App_State) {
			ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.6)
			app.sweep_started = true
			app.sweep_start_frame = app.frames_processed
	}},
	{6.0, "Layer_stop", proc(app: ^App_State) { ga.Layer_stop(&app.layer) }},
	{8.0, "shutdown", proc(app: ^App_State) { app.is_running = false }},
}

check_timeline :: proc(app: ^App_State) {
	// Fire any timeline events whose timestamp has been reached.
	now_s := f32(app.frames_processed) / f32(SAMPLE_RATE)
	for app.timeline_index < len(demo_timeline) {
		ev := demo_timeline[app.timeline_index]
		if now_s < ev.at_seconds do break
		fmt.printfln("[t=%.3fs] %s", now_s, ev.desc)
		ev.fn(app)
		app.timeline_index += 1
	}

	// Continuous parameter sweep: 200ms after the t=4.0 trigger, sweep
	// cutoff from 200 → 4000 Hz over ~200ms.
	if app.sweep_started {
		elapsed := app.frames_processed - app.sweep_start_frame
		sweep_len := u64(f32(SAMPLE_RATE) * 0.2)
		if elapsed < sweep_len {
			t := f32(elapsed) / f32(sweep_len)
			cutoff := f32(200.0) + t * f32(3800.0)
			ga.Sfx_set_cutoff(&app.sfx, cutoff)
		}
	}
}

// ----- Silent test mode -----

// Renders 1 second of audio into /dev/null, fires a single Sfx_trigger and
// Layer_start, exits 0 if no NaN/Inf and no crash. Useful for CI / smoke
// without an audio device.
run_silent_test :: proc(app: ^App_State) {
	ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.3)
	ga.Layer_start(&app.layer)
	bad: int = 0
	for i in 0 ..< SAMPLE_RATE {
		sfx_l, sfx_r := ga.Sfx_process(&app.sfx)
		layer_l, layer_r := ga.Layer_process(&app.layer)
		l := sfx_l + layer_l
		r := sfx_r + layer_r
		if l != l || r != r do bad += 1 // NaN
		if l > 8.0 || l < -8.0 || r > 8.0 || r < -8.0 do bad += 1 // wildly out of range
	}
	if bad > 0 {
		fmt.eprintfln("silent-test FAIL: %d bad frames in %d total", bad, SAMPLE_RATE)
		os.exit(1)
	}
	fmt.printfln("silent-test PASS (%d frames clean, mode=Silent_Test)", SAMPLE_RATE)
}
