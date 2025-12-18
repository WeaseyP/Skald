package test_dsp

import "core:fmt"
import "core:os"

main :: proc() {
    fmt.println("[DSP Verification] Starting...")
    
    // Check arguments for test case
    // Usage: verify.exe [osc|filter] [filename.csv]
    
    mode := "osc"
    filename := "output.csv"
    
    if len(os.args) > 1 do mode = os.args[1]
    if len(os.args) > 2 do filename = os.args[2]

    pass := true
    
    switch mode {
    case "osc":
        // Expect 440Hz Sine
        fmt.println("Verifying Oscillator (440Hz)...")
        if !analyze_audio_file(filename, 440.0, 5.0) do pass = false

    case "filter":
        // Filter verification logic... (TODO)
        fmt.println("Verifying Filter...")
        
    case:
        fmt.println("Unknown mode:", mode)
        pass = false
    }

    if pass {
        fmt.println("[SUCCESS] Verification Passed.")
        os.exit(0)
    } else {
        fmt.println("[FAILURE] Verification Failed.")
        os.exit(1)
    }
}
