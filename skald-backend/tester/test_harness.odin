// File: tester/test_harness.odin
package main

import "core:fmt"
import "core:time"
import "core:mem"
import "core:sync"
import "core:thread"
import "core:os"
import "core:strings"
import "core:strconv"
import ma "vendor:miniaudio"
import ga "generated_audio"

// A simple ring buffer to hold pre-calculated samples.
Ring_Buffer :: struct {
	data:      []f32,
	write_pos: int,
	read_pos:  int,
}

App_State :: struct {
	p1:              ^ga.AudioProcessor_Enemy1,
	p2:              ^ga.AudioProcessor_Enemy2,
	p3:              ^ga.AudioProcessor_Enemy3,
	p4:              ^ga.AudioProcessor_Enemy4,
	p_ambient:       ^ga.AudioProcessor_Ambient,

	device:          ma.device,
	ring_buffer:     Ring_Buffer,
	mutex:           sync.Mutex,
	is_running:      bool,
	time_in_samples: u64,
}

// THE PRODUCER THREAD
sample_generator_thread_proc :: proc(data: rawptr) {
	app_state := (^App_State)(data)

	for app_state.is_running {
		buffer_was_full := false

		sync.lock(&app_state.mutex)

		samples_in_buffer := app_state.ring_buffer.write_pos - app_state.ring_buffer.read_pos
		if samples_in_buffer < 0 {
			samples_in_buffer += len(app_state.ring_buffer.data)
		}

		if samples_in_buffer < len(app_state.ring_buffer.data) - 2 {
            // Mix 5 tracks
			l1, r1 := ga.process_Enemy1(app_state.p1, f32(app_state.device.sampleRate), app_state.time_in_samples)
			l2, r2 := ga.process_Enemy2(app_state.p2, f32(app_state.device.sampleRate), app_state.time_in_samples)
			l3, r3 := ga.process_Enemy3(app_state.p3, f32(app_state.device.sampleRate), app_state.time_in_samples)
			l4, r4 := ga.process_Enemy4(app_state.p4, f32(app_state.device.sampleRate), app_state.time_in_samples)
			la, ra := ga.process_Ambient(app_state.p_ambient, f32(app_state.device.sampleRate), app_state.time_in_samples)

            // Normalize/Mix (Simple Summation with headroom)
            // Divide by ~2.5 to avoid clipping with 5 loud sources
            gain := f32(0.4) 
            left  := (l1 + l2 + l3 + l4 + la) * gain
            right := (r1 + r2 + r3 + r4 + ra) * gain

			app_state.time_in_samples += 1

			app_state.ring_buffer.data[app_state.ring_buffer.write_pos] = left
			app_state.ring_buffer.write_pos = (app_state.ring_buffer.write_pos + 1) % len(app_state.ring_buffer.data)

			app_state.ring_buffer.data[app_state.ring_buffer.write_pos] = right
			app_state.ring_buffer.write_pos = (app_state.ring_buffer.write_pos + 1) % len(app_state.ring_buffer.data)

		} else {
			buffer_was_full = true
		}

		sync.unlock(&app_state.mutex)

		if buffer_was_full {
			time.sleep(1 * time.Millisecond)
		}
	}
}

// THE CONSUMER
audio_callback :: proc "c" (p_device: ^ma.device, p_output: rawptr, p_input: rawptr, frame_count: u32) {
	app_state := (^App_State)(p_device.pUserData)
	output_buffer := mem.slice_ptr((^f32)(p_output), int(frame_count * p_device.playback.channels))

	sync.lock(&app_state.mutex)
	for i in 0..<len(output_buffer) {
		if app_state.ring_buffer.read_pos == app_state.ring_buffer.write_pos {
			output_buffer[i] = 0.0
		} else {
			output_buffer[i] = app_state.ring_buffer.data[app_state.ring_buffer.read_pos]
			app_state.ring_buffer.read_pos = (app_state.ring_buffer.read_pos + 1) % len(app_state.ring_buffer.data)
		}
	}
	sync.unlock(&app_state.mutex)
}

main :: proc() {
	app_state: App_State
	app_state.is_running = true
    
    // Initialize Processors
	app_state.p1 = new(ga.AudioProcessor_Enemy1)
	app_state.p2 = new(ga.AudioProcessor_Enemy2)
	app_state.p3 = new(ga.AudioProcessor_Enemy3)
	app_state.p4 = new(ga.AudioProcessor_Enemy4)
	app_state.p_ambient = new(ga.AudioProcessor_Ambient)

	defer free(app_state.p1)
	defer free(app_state.p2)
	defer free(app_state.p3)
	defer free(app_state.p4)
	defer free(app_state.p_ambient)

	ga.init_Enemy1(app_state.p1)
	ga.init_Enemy2(app_state.p2)
	ga.init_Enemy3(app_state.p3)
	ga.init_Enemy4(app_state.p4)
	ga.init_Ambient(app_state.p_ambient)

    // Note: No manual 'note_on' calls needed here anymore, the sequencer inside 'process' handles it!
    
    // Check Arguments
    // Removed Headless for brevity in this debug session, focusing on interactive playback.
    
    // --- Interactive Mode ---
	app_state.ring_buffer.data = make([]f32, 8192) // Increased buffer size
	defer delete(app_state.ring_buffer.data)

	device_config := ma.device_config_init(.playback)
	device_config.playback.format = .f32
	device_config.playback.channels = 2
	device_config.sampleRate = 48000
	device_config.dataCallback = audio_callback
	device_config.pUserData = &app_state

	if ma.device_init(nil, &device_config, &app_state.device) != .SUCCESS {
		fmt.eprintln("Failed to initialize audio device.")
		return
	}
	defer ma.device_uninit(&app_state.device)
	fmt.printf("Audio device initialized: %s\n", app_state.device.playback.name)
    fmt.println("Starting playback of 5 synchronized tracks...")

	thread.run_with_data(&app_state, sample_generator_thread_proc)

	if ma.device_start(&app_state.device) != .SUCCESS {
		fmt.eprintln("Failed to start audio device.")
		app_state.is_running = false
		return
	}
	defer ma.device_stop(&app_state.device)

	fmt.println("Playing audio... Press Ctrl+C to quit.")

	for {
		time.sleep(100 * time.Millisecond)
	}
}