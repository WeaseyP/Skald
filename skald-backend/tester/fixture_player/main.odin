// Fixture player — plays a single seed fixture through the speakers via
// miniaudio. Hardcodes the "Asset" instrument name (every seed fixture
// uses that). For SFX fixtures pass -mode:sfx so we periodically
// re-trigger Asset; for Music Layer pass -mode:layer (project_init's
// auto-start handles the sequencer). -dur:N controls run time in seconds.
//
//   fixture_player.exe -mode:sfx   -dur:5     (default)
//   fixture_player.exe -mode:layer -dur:6
package main

import "core:fmt"
import "core:mem"
import "core:os"
import "core:strconv"
import "core:strings"
import "core:sync"
import "core:thread"
import "core:time"
import ma "vendor:miniaudio"
import ga "generated_audio"

SAMPLE_RATE :: 48000
RING_CAPACITY :: 16384

Mode :: enum {
	Sfx,
	Layer,
}

Ring_Buffer :: struct {
	data:      [RING_CAPACITY]f32,
	write_pos: int,
	read_pos:  int,
}

App_State :: struct {
	project:    ga.Project_State,
	device:     ma.device,
	ring:       Ring_Buffer,
	mutex:      sync.Mutex,
	is_running: bool,
	mode:       Mode,

	frames:           u64,
	sfx_retrigger_at: u64, // sample at which to re-fire Asset_trigger
}

main :: proc() {
	mode := Mode.Sfx
	dur_s: f32 = 5.0
	fixture_name := ""

	for arg in os.args[1:] {
		switch {
		case strings.has_prefix(arg, "-mode:"):
			switch arg[6:] {
			case "sfx":   mode = .Sfx
			case "layer": mode = .Layer
			case:         fmt.eprintfln("unknown mode %q", arg[6:])
			}
		case strings.has_prefix(arg, "-dur:"):
			if v, ok := strconv.parse_f32(arg[5:]); ok do dur_s = v
		case strings.has_prefix(arg, "-name:"):
			fixture_name = arg[6:]
		}
	}

	app: App_State
	app.is_running = true
	app.mode = mode
	ga.project_init(&app.project, f32(SAMPLE_RATE))
	defer ga.project_destroy(&app.project)

	switch mode {
	case .Sfx:
		// SFX: trigger immediately and re-trigger every 1.8s so the user
		// hears multiple iterations within the run window. project_init
		// does NOT auto-start SFX assets.
		ga.Asset_trigger(app.project.Asset, 69, 1.0, 0.0)
		app.sfx_retrigger_at = u64(f32(SAMPLE_RATE) * 1.8)
	case .Layer:
		// Music Layer: project_init already called Asset_start; sequencer
		// runs autonomously. Nothing else to do here.
	}

	device_config := ma.device_config_init(.playback)
	device_config.playback.format = .f32
	device_config.playback.channels = 2
	device_config.sampleRate = SAMPLE_RATE
	device_config.dataCallback = audio_callback
	device_config.pUserData = &app

	if ma.device_init(nil, &device_config, &app.device) != .SUCCESS {
		fmt.eprintln("Failed to initialize audio device.")
		os.exit(1)
	}
	defer ma.device_uninit(&app.device)

	if fixture_name != "" {
		fmt.printfln(">>> Playing fixture: %s (%v) for %.1fs", fixture_name, mode, dur_s)
	} else {
		fmt.printfln(">>> Playing %v for %.1fs", mode, dur_s)
	}

	thread.run_with_data(&app, producer_thread)

	if ma.device_start(&app.device) != .SUCCESS {
		fmt.eprintln("Failed to start audio device.")
		app.is_running = false
		os.exit(1)
	}
	defer ma.device_stop(&app.device)

	// Wait out the duration, then shut down cleanly.
	target_frames := u64(f32(SAMPLE_RATE) * dur_s)
	for sync.atomic_load(&app.frames) < target_frames {
		time.sleep(50 * time.Millisecond)
	}

	// Allow the ring buffer to drain so the tail of the last note reaches
	// the speakers before the device tears down.
	time.sleep(150 * time.Millisecond)

	app.is_running = false
}

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

producer_thread :: proc(data: rawptr) {
	app := (^App_State)(data)

	for app.is_running {
		buffer_full := false
		sync.lock(&app.mutex)

		samples_in_buffer := app.ring.write_pos - app.ring.read_pos
		if samples_in_buffer < 0 do samples_in_buffer += RING_CAPACITY

		if samples_in_buffer < RING_CAPACITY - 2 {
			// SFX retrigger logic: fire Asset_trigger again every 1.8s so
			// short SFX (e.g., adsr_sine with 0.6s duration) repeat audibly.
			if app.mode == .Sfx && app.frames >= app.sfx_retrigger_at {
				ga.Asset_trigger(app.project.Asset, 69, 1.0, 0.0)
				app.sfx_retrigger_at = app.frames + u64(f32(SAMPLE_RATE) * 1.8)
			}

			l, r := ga.project_process(&app.project)

			app.ring.data[app.ring.write_pos] = l
			app.ring.write_pos = (app.ring.write_pos + 1) % RING_CAPACITY
			app.ring.data[app.ring.write_pos] = r
			app.ring.write_pos = (app.ring.write_pos + 1) % RING_CAPACITY

			sync.atomic_add(&app.frames, 1)
		} else {
			buffer_full = true
		}

		sync.unlock(&app.mutex)
		if buffer_full {
			time.sleep(1 * time.Millisecond)
		}
	}
}
