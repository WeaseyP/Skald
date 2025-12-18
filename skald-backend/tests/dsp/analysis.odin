package test_dsp

import "core:fmt"
import "core:os"
import "core:strings"
import "core:strconv"
import "core:math"

Audio_Sample :: struct {
    time: f32,
    left: f32,
    right: f32,
}

load_csv :: proc(filename: string) -> ([dynamic]Audio_Sample, bool) {
    data, ok := os.read_entire_file(filename)
    if !ok do return nil, false
    
    content := string(data)
    defer delete(data)

    samples := make([dynamic]Audio_Sample)
    
    lines := strings.split(content, "\n")
    defer delete(lines)

    for line, idx in lines {
        if idx == 0 || len(strings.trim_space(line)) == 0 do continue // Skip header or empty
        
        parts := strings.split(line, ",")
        defer delete(parts)
        
        if len(parts) >= 3 {
             t := strconv.atof(parts[0])
             l := strconv.atof(parts[1])
             r := strconv.atof(parts[2])
             
             if idx < 5 {
                 fmt.printf("[DSP Debug] Line %d: '%s' -> Left: %f\n", idx, strings.trim_space(line), l)
             }

             append(&samples, Audio_Sample{f32(t), f32(l), f32(r)})
        }
    }
    return samples, true
}

compute_rms :: proc(samples: []Audio_Sample) -> f32 {
    sum_sq: f32 = 0.0
    for s in samples {
        sum_sq += s.left * s.left // Analyze left channel
    }
    return math.sqrt(sum_sq / f32(len(samples)))
}

compute_peak :: proc(samples: []Audio_Sample) -> f32 {
    peak: f32 = 0.0
    for s in samples {
        abs_val := math.abs(s.left)
        if abs_val > peak do peak = abs_val
    }
    return peak
}

estimate_frequency_zero_crossing :: proc(samples: []Audio_Sample, sample_rate: f32 = 48000.0) -> f32 {
    crossings := 0
    if len(samples) < 2 {
        fmt.println("[DSP Debug] Too few samples:", len(samples))
        return 0.0
    }
    
    for i in 0..<len(samples)-1 {
        if (samples[i].left > 0 && samples[i+1].left <= 0) || (samples[i].left < 0 && samples[i+1].left >= 0) {
            crossings += 1
            if crossings <= 10 {
                fmt.printf("[DSP Debug] Crossing at index %d (Val: %f -> %f)\n", i, samples[i].left, samples[i+1].left)
            }
        }
    }
    
    duration := samples[len(samples)-1].time - samples[0].time
    fmt.printf("[DSP Debug] Samples: %d | Duration: %.4f | Crossings: %d\n", len(samples), duration, crossings)
    
    if duration <= 0 {
         fmt.println("[DSP Debug] Invalid duration.")
         return 0.0
    }
    
    return (f32(crossings) / 2.0) / duration
}

analyze_audio_file :: proc(filename: string, expected_freq: f32, tolerance_freq: f32) -> bool {
    samples, ok := load_csv(filename)
    if !ok {
        fmt.println("[DSP ERROR] Could not load CSV:", filename)
        return false
    }
    defer delete(samples)

    rms := compute_rms(samples[:])
    peak := compute_peak(samples[:])
    freq := estimate_frequency_zero_crossing(samples[:])
    
    fmt.printf("[DSP Analysis] File: %s | RMS: %.4f | Peak: %.4f | Est. Freq: %.2f Hz\n", filename, rms, peak, freq)
    
    if rms < 0.01 {
        fmt.println("[DSP FAIL] Signal is silent or too quiet.")
        return false
    }
    
    if math.abs(freq - expected_freq) > tolerance_freq {
         fmt.printf("[DSP FAIL] Frequency deviation too high (Got %.2f, Expected %.2f)\n", freq, expected_freq)
         return false
    }
    
    return true
}
