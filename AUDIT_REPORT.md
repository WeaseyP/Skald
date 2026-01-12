# Skald Audio Engine - Deep Dive Audit Report

**Date:** October 26, 2023
**Auditor:** Jules (DSP Specialist)
**Scope:** Backend Codegen, Frontend Parity, Architecture

## Executive Summary
The following audit identifies critical discrepancies between the Web Audio frontend (preview) and the Odin backend (export). Per user direction, the remediation strategy prioritizes **audio fidelity** and **parity**, mandating upgrades to the backend DSP algorithms (PolyBLEP Oscillators, RBJ Filters, Algorithmic Reverb) rather than downgrading the frontend.

---

## 1. Backend Code Generation

### Issue 1.1: Naive Oscillator Aliasing
*   **Severity:** **Critical**
*   **Component:** Backend Codegen (`generate_oscillator_code`)
*   **Location:** `skald-backend/core/codegen.odin` (approx line 45-85)
*   **The Issue:**
    The current oscillator implementation uses "naive" geometric waveform generation (e.g., `phase > PI ? 1 : -1`). In the digital domain, generating infinite-bandwidth edges (like the vertical line of a sawtooth or square wave) causes **aliasing**—audible, enharmonic frequencies that reflect back into the audible spectrum. This results in a harsh, "cheap" digital sound, especially at higher pitches.
*   **The Fix:**
    Implement **PolyBLEP** (Polynomial Band-Limited Step) anti-aliasing. This smooths the discontinuity at the waveform edges based on the current phase increment.

    **Odin Logic:**
    ```odin
    // Inside generate_oscillator_code
    // Calculate phase increment (dt)
    fmt.sbprintf(sb, "\t\t\t\tdt := %s / sample_rate;\n", freq_str)
    fmt.sbprintf(sb, "\t\t\t\tt := final_phase / (2.0 * f32(math.PI));\n") // 0.0 to 1.0

    // PolyBLEP function (inline or helper)
    // poly_blep(t, dt) returns the correction value
    fmt.sbprint(sb, "\t\t\t\tpoly_blep := proc(t: f32, dt: f32) -> f32 {\n")
    fmt.sbprint(sb, "\t\t\t\t\tif t < dt { return t / dt - t / dt - 1.0; }\n") // Simplified, needs full logic
    fmt.sbprint(sb, "\t\t\t\t\telse if t > 1.0 - dt { return (t - 1.0) / dt + (t - 1.0) / dt + 1.0; }\n")
    fmt.sbprint(sb, "\t\t\t\t\treturn 0.0;\n")
    fmt.sbprint(sb, "\t\t\t\t}\n")

    // Apply correction
    // Sawtooth: Naive - PolyBLEP
    fmt.sbprint(sb, "\t\t\t\tcase \"Sawtooth\":\n")
    fmt.sbprint(sb, "\t\t\t\t\tnaive := (2.0 * t) - 1.0;\n")
    fmt.sbprint(sb, "\t\t\t\t\tunison_out += naive - poly_blep(t, dt);\n")
    ```

### Issue 1.2: Filter Topology Mismatch (Instability)
*   **Severity:** **Major**
*   **Component:** Backend Codegen (`generate_filter_code`)
*   **Location:** `skald-backend/core/codegen.odin` (approx line 140)
*   **The Issue:**
    The backend uses a **Chamberlin State Variable Filter (SVF)**. While efficient, the Chamberlin topology becomes unstable when the cutoff frequency exceeds `Fs/6` (approx 7.3kHz at 44.1kHz). The Frontend uses Web Audio's `BiquadFilterNode` (Standard RBJ topology), which remains stable up to Nyquist. This discrepancy means high-frequency filter settings valid in the UI will "blow up" (output infinite volume/noise) in the game engine.
*   **The Fix:**
    Replace the Chamberlin implementation with a standard **RBJ Biquad** (Direct Form I or II).

    **Odin Logic:**
    ```odin
    // Calculate RBJ Coefficients based on type (LowPass)
    fmt.sbprintf(sb, "\t\t\tw0 := 2.0 * math.PI * (%s) / sample_rate;\n", cutoff_str)
    fmt.sbprint(sb, "\t\t\tcos_w0 := math.cos(w0);\n")
    fmt.sbprint(sb, "\t\t\talpha := math.sin(w0) / (2.0 * (%s));\n", res_str) // Q = res

    // LowPass Coeffs
    fmt.sbprint(sb, "\t\t\tb0 := (1.0 - cos_w0) / 2.0;\n")
    fmt.sbprint(sb, "\t\t\tb1 := 1.0 - cos_w0;\n")
    fmt.sbprint(sb, "\t\t\tb2 := (1.0 - cos_w0) / 2.0;\n")
    fmt.sbprint(sb, "\t\t\ta0 := 1.0 + alpha;\n")
    fmt.sbprint(sb, "\t\t\ta1 := -2.0 * cos_w0;\n")
    fmt.sbprint(sb, "\t\t\ta2 := 1.0 - alpha;\n")

    // Difference Equation (Direct Form I)
    // y[n] = (b0/a0)*x[n] + (b1/a0)*x[n-1] + (b2/a0)*x[n-2] - (a1/a0)*y[n-1] - (a2/a0)*y[n-2]
    fmt.sbprintf(sb, "\t\t\tnode_%s_out = (b0/a0)*input + ... \n", node.id)
    ```

### Issue 1.3: Reverb Type Discrepancy
*   **Severity:** **Major**
*   **Component:** Backend Codegen (`generate_reverb_code`)
*   **Location:** `skald-backend/core/codegen.odin` (approx line 290)
*   **The Issue:**
    The Frontend uses a `ConvolverNode` (high quality, realistic). The Backend uses a simple feedback delay line (slapback echo). These sound fundamentally different. The user requires a lush "Resonance Valley" sound.
*   **The Fix:**
    Implement a **Schroeder-Moorer** style algorithmic reverb (or "Freeverb"). This consists of parallel Comb Filters feeding into series All-Pass Filters.

    **Logic:**
    1.  Create 4 parallel Comb filters with prime delay lengths.
    2.  Sum their outputs.
    3.  Pass result through 2 series All-Pass filters to diffuse the sound.
    4.  Mix with dry signal.

### Issue 1.4: Wavetable "Placeholder" Logic
*   **Severity:** **Major**
*   **Component:** Backend Codegen (`generate_wavetable_code`)
*   **Location:** `skald-backend/core/codegen.odin` (approx line 270)
*   **The Issue:**
    The backend currently ignores the wavetable nature and outputs a hardcoded Sine wave. The Frontend morphs between 4 waveforms (Sine, Tri, Saw, Square) based on the `position` parameter.
*   **The Fix:**
    Replicate the Frontend's morphing logic mathematically (hardcoded parity).

    **Odin Logic:**
    ```odin
    // Calculate values for all 4 basic shapes at current phase
    // Interpolate based on 'position' (0.0 - 3.0)
    fmt.sbprintf(sb, "\t\t\tval_sin := math.sin(phase);\n")
    fmt.sbprintf(sb, "\t\t\tval_tri := ...;\n")

    // Lerp logic
    // if pos < 1.0: lerp(sin, tri, pos)
    // else if pos < 2.0: lerp(tri, saw, pos - 1.0)
    // ...
    ```

---

## 2. Frontend & Data

### Issue 2.1: Mixer Channel Count Mismatch
*   **Severity:** **Minor**
*   **Component:** Data / Codegen
*   **Location:** `skald-backend/core/codegen.odin` vs `skald-ui/.../types.ts`
*   **The Issue:**
    `skald-ui` defines the Mixer as having a dynamic list of inputs (`levels` array). However, `codegen.odin` (`generate_mixer_code`) hardcodes a loop from 1 to 8: `for i in 1..=8`.
*   **The Fix:**
    Update `codegen.odin` to either iterate based on the actual connections present in the graph or strictly respect the `inputCount` parameter passed from the node data.

### Issue 2.2: ADSR Curve Configuration
*   **Severity:** **Optimization / Missing Feature**
*   **Component:** Frontend & Backend
*   **Location:** `createAdsrNode.ts` & `codegen.odin`
*   **The Issue:**
    The data model supports `attackCurve`, `decayCurve`, etc. However, both the Frontend `adsr.worklet.ts` and Backend `codegen.odin` implement strictly **Linear** segments.
*   **The Fix:**
    **Status:** User decided to defer this. Marked as "Missing Feature".

### Issue 2.3: Frontend PWM Aliasing Risk
*   **Severity:** **Minor**
*   **Component:** Frontend (`createOscillatorNode.ts`)
*   **Location:** `skald-ui/src/hooks/nodeEditor/audioNodeFactory/createOscillatorNode.ts`
*   **The Issue:**
    The PWM implementation uses a Sawtooth `OscillatorNode` (bandlimited) fed into a high-gain Comparator (`Gain` * 1000 -> `WaveShaper` hard clip). While the source is bandlimited, the hard clipping introduces infinite harmonics (aliasing) at the edges.
*   **The Fix:**
    For strict parity with the new PolyBLEP backend, the Frontend should ideally use an `AudioWorklet` for PWM that implements PolyBLEP as well. However, given the priority is Backend quality, this is noted for future parity updates.

---

## 3. Architecture

### Issue 3.1: Voice Stealing Logic
*   **Severity:** **Minor**
*   **Component:** Backend Architecture
*   **Location:** `codegen.odin` (`note_on`)
*   **The Issue:**
    The voice stealing logic is a simple round-robin: `p.next_voice_index = (p.next_voice_index + 1) % polyphony`. It does not check if a voice is currently playing or find the "oldest" voice. This can result in cutting off a long tail of a currently active note even if other voices are free.
*   **The Fix:**
    Implement a "Find Free Voice" search loop first. If no voice is free, find the voice with the lowest envelope energy or oldest `time_active`.

### Issue 3.2: Graph Input/Output Code Generation
*   **Severity:** **Optimization**
*   **Component:** Backend Codegen
*   **Location:** `codegen.odin`
*   **The Issue:**
    The current codegen handles `GraphOutput` by summing inputs and returning them. It does not explicitly handle `GraphInput` nodes for instrument subgraphs in a generic way (it relies on `find_inputs_for_port` which might not traverse subgraph boundaries correctly depending on how the graph is flattened).
*   **The Fix:**
    Ensure `build_graph_from_raw` correctly flattens or links subgraph inputs to the parent node's connections.

---

## Summary of Recommendations

1.  **Immediate Action:** Rewrite `generate_oscillator_code` to use PolyBLEP.
2.  **Immediate Action:** Rewrite `generate_filter_code` to use RBJ Biquad struct.
3.  **Immediate Action:** Replace `generate_reverb_code` with a Schroeder-Moorer implementation.
4.  **Immediate Action:** Implement mathematical wavetable morphing in `generate_wavetable_code`.
