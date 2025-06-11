// File: tester/test_harness.odin
package main 

import "core:fmt"
import "core:time"
import "core:mem"
import "core:sync"
import "core:thread"
import ma "vendor:miniaudio"
import ga "generated_audio"

// A simple ring buffer to hold pre-calculated samples.
Ring_Buffer :: struct {
    data:       []f32,
    write_pos:  int,
    read_pos:   int,
}

App_State :: struct {
    processor:      ga.AudioProcessor,
    device:         ma.device,
    ring_buffer:    Ring_Buffer,
    mutex:          sync.Mutex,
    is_running:     bool,
}

// THE PRODUCER THREAD (Corrected)
sample_generator_thread_proc :: proc(data: rawptr) {
    app_state := (^App_State)(data)
    
    for app_state.is_running {
        // We will check if the buffer is full *after* we acquire the lock.
        // This prevents the data race.
        buffer_was_full := false

        sync.lock(&app_state.mutex)
        
        // Calculate the number of samples currently in the buffer.
        samples_in_buffer := app_state.ring_buffer.write_pos - app_state.ring_buffer.read_pos
        if samples_in_buffer < 0 {
            samples_in_buffer += len(app_state.ring_buffer.data)
        }
        
        // Check if there is enough free space for at least 2 more samples (left & right).
        // We leave 1 slot empty to distinguish between a full and empty buffer.
        if samples_in_buffer < len(app_state.ring_buffer.data) - 2 {
            
            // It's safe to generate and write a new sample pair.
            left, right := ga.process_sample(&app_state.processor, f32(app_state.device.sampleRate))

            app_state.ring_buffer.data[app_state.ring_buffer.write_pos] = left
            app_state.ring_buffer.write_pos = (app_state.ring_buffer.write_pos + 1) % len(app_state.ring_buffer.data)
            
            app_state.ring_buffer.data[app_state.ring_buffer.write_pos] = right
            app_state.ring_buffer.write_pos = (app_state.ring_buffer.write_pos + 1) % len(app_state.ring_buffer.data)

        } else {
            // The buffer is full, so we tell our outer logic to wait.
            buffer_was_full = true
        }

        sync.unlock(&app_state.mutex)

        // If the buffer was full, we sleep for a tiny duration to prevent
        // this thread from consuming 100% of a CPU core.
        if buffer_was_full {
            time.sleep(1 * time.Millisecond)
        }
    }
}


// THE CONSUMER (No changes needed, it was already safe)
audio_callback :: proc "c" (p_device: ^ma.device, p_output: rawptr, p_input: rawptr, frame_count: u32) {
    app_state := (^App_State)(p_device.pUserData)
    output_buffer := mem.slice_ptr((^f32)(p_output), int(frame_count * p_device.playback.channels))

    sync.lock(&app_state.mutex)
    for i in 0..<len(output_buffer) {
        if app_state.ring_buffer.read_pos == app_state.ring_buffer.write_pos {
            output_buffer[i] = 0.0 // Buffer is empty, output silence.
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

    app_state.ring_buffer.data = make([]f32, 4096)

    device_config := ma.device_config_init(.playback)
    device_config.playback.format    = .f32
    device_config.playback.channels  = 2
    device_config.sampleRate         = 48000
    device_config.dataCallback       = audio_callback
    device_config.pUserData          = &app_state

    if ma.device_init(nil, &device_config, &app_state.device) != .SUCCESS {
        fmt.eprintln("Failed to initialize audio device.")
        return
    }
    defer ma.device_uninit(&app_state.device)
    fmt.printf("Audio device initialized: %s\n", app_state.device.playback.name)
    
    thread.run_with_data(&app_state, sample_generator_thread_proc)
    
    if ma.device_start(&app_state.device) != .SUCCESS {
        fmt.eprintln("Failed to start audio device.")
        app_state.is_running = false
        return
    }

    fmt.println("Playing 440Hz tone. Press Ctrl+C to quit.")

    for {
        time.sleep(1 * time.Second)
    }

    app_state.is_running = false
    ma.device_stop(&app_state.device)
}