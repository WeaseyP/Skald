package backend_tests

import "core:testing"
import "core:fmt"
import "core:strings"
import json "core:encoding/json"
import core "../core" 

// --- Mock Data Helpers ---
make_node :: proc(id: int, type: string) -> core.Node {
    return core.Node{
        id = id,
        type = type,
        parameters = make(json.Object),
    }
}

// --- Test 1: Oscillator Generation ---
@(test)
test_oscillator_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    
    node := make_node(1, "Oscillator")
    node.parameters["frequency"] = json.Float(220.0)
    node.parameters["waveform"] = json.String("Square")
    
    // Create a dummy graph (needed for input checking, though empty here)
    graph := core.Graph{}
    instrument := make_node(99, "Instrument") // Dummy instrument parent

    core.generate_oscillator_code(&sb, node, &graph, instrument)
    
    code := strings.to_string(sb)
    fmt.println("--- Osc Code ---")
    fmt.println(code)
    fmt.println("----------------")
    
    // Verify Key Logic
    testing.expect(t, strings.contains(code, "voice.state.osc_1_phase"), "Missing phase state")
    testing.expect(t, strings.contains(code, "220.000"), "Missing frequency parameter")
    testing.expect(t, strings.contains(code, "case \"Square\":"), "Missing waveform switch")
}

// --- Test 2: ADSR Generation ---
@(test)
test_adsr_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)

    node := make_node(2, "ADSR")
    graph := core.Graph{}

    core.generate_adsr_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "voice.state.adsr_2_stage"), "Missing ADSR state stage")
     // Check for fixed typo/bug
    testing.expect(t, !strings.contains(code, "%!(MISSING"), "Found formatting error in ADSR code")
}

// --- Test 3: Gain Node (Additive Input Logic) ---
@(test)
test_gain_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)

    node := make_node(3, "Gain")
    node.parameters["gain"] = json.Float(0.5)
    graph := core.Graph{}

    core.generate_gain_code(&sb, node, &graph)
    code := strings.to_string(sb)
    fmt.println("--- Gain Code ---")
    fmt.println(code)
    fmt.println("-----------------")

    // Expect: node_3_out = (Input) * (0.500);
    // Since input is default 0.0: (0.000) * (0.500)
    testing.expect(t, strings.contains(code, "0.500"), "Missing gain parameter")
}

// --- Test 4: Filter Generation ---
@(test)
test_filter_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)

    node := make_node(4, "Filter")
    node.parameters["cutoff"] = json.Float(1200.0)
    node.parameters["resonance"] = json.Float(2.5)
    node.parameters["type"] = json.String("Lowpass")
    graph := core.Graph{}

    core.generate_filter_code(&sb, node, &graph)
    code := strings.to_string(sb)
    fmt.println("--- Filter Code ---")
    fmt.println(code)
    fmt.println("-------------------")

    testing.expect(t, strings.contains(code, "1200.000"), "Missing cutoff parameter")
    testing.expect(t, strings.contains(code, "2.500"), "Missing resonance parameter")
    // Verify filter type handling (assuming it generates comments or specific math)
    testing.expect(t, strings.contains(code, "Filter Node 4"), "Missing node comment")
}

// --- Test 5: FM Operator Generation ---
@(test)
test_fm_operator_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)

    node := make_node(5, "FmOperator")
    node.parameters["frequency"] = json.Float(1.5) // Ratio
    graph := core.Graph{}
    instrument := make_node(99, "Instrument")

    core.generate_fm_operator_code(&sb, node, &graph)
    code := strings.to_string(sb)

    // Should calculate carrier freq based on voice freq * ratio
    // carrier_freq_5 := voice.current_freq * (1.500000);
    testing.expect(t, strings.contains(code, "voice.current_freq * (1.500"), "Missing ratio calculation")
    testing.expect(t, strings.contains(code, "math.sin"), "Missing sine oscillator code")
}

// --- Test 6: Delay Generation ---
@(test)
test_delay_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)

    node := make_node(6, "Delay")
    node.parameters["delayTime"] = json.Float(0.35)
    node.parameters["feedback"] = json.Float(0.7)
    node.parameters["mix"] = json.Float(0.4)
    graph := core.Graph{}

    core.generate_delay_code(&sb, node, &graph)
    code := strings.to_string(sb)
    fmt.println("--- Delay Code ---")
    fmt.println(code)
    fmt.println("------------------")

    testing.expect(t, strings.contains(code, "p.delay_6_buffer"), "Missing buffer access")
    testing.expect(t, strings.contains(code, "0.350"), "Missing time parameter")
    testing.expect(t, strings.contains(code, "0.700"), "Missing feedback parameter")
}

// --- Test 7: LFO Generation ---
@(test)
test_lfo_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(7, "LFO")
    node.parameters["frequency"] = json.Float(6.0)
    node.parameters["waveform"] = json.String("Triangle")
    graph := core.Graph{}

    core.generate_lfo_code(&sb, node, &graph)
    code := strings.to_string(sb)
    fmt.println("--- LFO Code ---")
    fmt.println(code)
    fmt.println("----------------")

    testing.expect(t, strings.contains(code, "voice.state.lfo_7_phase"), "Missing LFO phase")
    testing.expect(t, strings.contains(code, "6.000"), "Missing frequency")
    // LFO compiles the waveform logic directly, no runtime switch
    testing.expect(t, strings.contains(code, "math.asin"), "Missing Triangle waveform math")
}

// --- Test 8: Distortion Generation ---
@(test)
test_distortion_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(8, "Distortion")
    node.parameters["drive"] = json.Float(50.0)
    node.parameters["shape"] = json.String("HardClip")
    graph := core.Graph{}

    core.generate_distortion_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "50.000"), "Missing drive param")
    testing.expect(t, strings.contains(code, "math.clamp"), "Missing HardClip logic")
}

// --- Test 9: Reverb Generation ---
@(test)
test_reverb_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(9, "Reverb")
    node.parameters["decay"] = json.Float(0.8)
    graph := core.Graph{}

    core.generate_reverb_code(&sb, node, &graph)
    code := strings.to_string(sb)

    // Reverb uses a delay buffer similar to Delay node
    testing.expect(t, strings.contains(code, "p.delay_9_buffer"), "Missing reverb buffer")
    testing.expect(t, strings.contains(code, "0.800"), "Missing decay param")
}

// --- Test 10: Mixer Generation ---
@(test)
test_mixer_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(10, "Mixer")
    // Mixer expects input_1..4 ports. Tests might fail if loop is empty? 
    // The loop iterates 1..8 and checks for connections. 
    // Without connections, it just generates "mix_sum... node_out = mix_sum".
    graph := core.Graph{}
    core.generate_mixer_code(&sb, node, &graph)
    code := strings.to_string(sb)
    
    testing.expect(t, strings.contains(code, "mix_sum_10"), "Missing mixer accumulator")
}

// --- Test 11: Panner Generation ---
@(test)
test_panner_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(11, "Panner")
    node.parameters["pan"] = json.Float(-0.5)
    graph := core.Graph{}

    core.generate_panner_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "-0.500"), "Missing pan param")
    testing.expect(t, strings.contains(code, "node_11_out_left"), "Missing left output")
    testing.expect(t, strings.contains(code, "node_11_out_right"), "Missing right output")
}

// --- Test 12: SampleHold Generation ---
@(test)
test_samplehold_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(12, "SampleHold")
    node.parameters["rate"] = json.Float(12.0)
    graph := core.Graph{}

    core.generate_sample_hold_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "voice.state.sh_12_rng"), "Missing RNG state")
    testing.expect(t, strings.contains(code, "12.000"), "Missing rate param")
}

// --- Test 13: Noise Generation ---
@(test)
test_noise_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(13, "Noise")
    node.parameters["amplitude"] = json.Float(0.9)
    graph := core.Graph{}

    core.generate_noise_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "voice.state.noise_13_rng"), "Missing RNG state")
    testing.expect(t, strings.contains(code, "0.900"), "Missing amplitude param")
}

// --- Test 14: Wavetable Generation ---
@(test)
test_wavetable_gen :: proc(t: ^testing.T) {
    sb := strings.builder_make()
    defer strings.builder_destroy(&sb)
    node := make_node(14, "Wavetable")
    node.parameters["frequency"] = json.Float(110.0)
    graph := core.Graph{}

    core.generate_wavetable_code(&sb, node, &graph)
    code := strings.to_string(sb)

    testing.expect(t, strings.contains(code, "voice.state.wavetable_14_phase"), "Missing phase state")
    testing.expect(t, strings.contains(code, "110.000"), "Missing frequency param")
}
