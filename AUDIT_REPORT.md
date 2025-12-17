# Skald Codebase Audit Report (Phase 13 -> 14 Transition)

**Auditor:** Jules (Systems Architect & Audio DSP Engineer)
**Date:** Current
**Target:** Phase 14 (Beat Sequencer) Readiness

---

## 1. Parity Matrix (Frontend vs. Backend)

This matrix compares the implementation of nodes in the React/Web Audio frontend (`skald-ui`) versus the Odin backend code generation (`skald-backend`).

| Node Type | Frontend Implementation | Backend Implementation | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Oscillator** | `createOscillatorNode.ts` | `generate_oscillator_code` | **Discrepancy** | Frontend lacks internal `unison`/`detune` logic (relies on `Instrument` polyphony). Backend implements internal unison loop. |
| **ADSR** | `adsr.worklet.ts` | `generate_adsr_code` | **Parity** | Both implement linear state machine. `velocitySensitivity` is missing in both. |
| **FM Operator** | `createFmOperatorNode.ts` | `generate_fm_operator_code` | **CRITICAL FAILURE** | Frontend treats `frequency` as Hz (Absolute). Backend treats `frequency` as Ratio (Relative). |
| **Wavetable** | `wavetable.worklet.ts` | `generate_wavetable_code` | **Feature Gap** | Backend is a placeholder (Sine wave). Frontend is functional. |
| **Filter** | `BiquadFilterNode` | `generate_filter_code` | **Partial** | Backend only fully implements LowPass/HighPass. Others default to LowPass. |
| **LFO** | `createLfoNode.ts` | `generate_lfo_code` | **Parity** | Standard waveforms match. |
| **S&H** | `sampleHold.worklet.ts` | `generate_sample_hold_code` | **Parity** | Logic consistent. |
| **Delay** | `DelayNode` + Feedback | `generate_delay_code` | **Parity** | Functional parity. |
| **Reverb** | `ConvolverNode` | `generate_reverb_code` | **Major Discrepancy** | Frontend uses Convolution. Backend uses simple Feedback Delay (Comb). Massive sound difference. |
| **Distortion** | `WaveShaperNode` | `generate_distortion_code` | **Feature Gap** | Backend missing `tone` filter and `mix`. Only implements simple clipping. |
| **Mixer** | `createMixerNode.ts` | `generate_mixer_code` | **Parity** | Logic consistent (assuming naming convention `input_N` holds). |
| **Panner** | `StereoPannerNode` | `generate_panner_code` | **Parity** | Both use standard pan laws. |
| **Group** | `useCodeGeneration.ts` | N/A (Flattened) | **Parity** | Flattening logic appears sound. |

---

## 2. Silent Failure Log

These are critical issues where the code runs without error but produces incorrect or unintended results.

### 1. Connection Logic Failure for Custom Node Parameters
*   **File:** `skald-ui/src/hooks/nodeEditor/audioNodeUtils.ts`
*   **Issue:** The `connectNodes` function attempts to connect to AudioParams by checking `targetNode[handle]`. However, many factory functions (e.g., `createOscillatorNode`) return a `GainNode` wrapper (the output) and attach the actual node logic to `_skaldNode`.
*   **Consequence:** Connecting a modulation source to a named parameter (e.g., "frequency" on an Oscillator) fails silently because the GainNode does not have that property. The modulation signal is instead connected to the GainNode's audio input (summed with output), resulting in no modulation effect.

### 2. FM Operator Frequency Interpretation
*   **File:** `skald-ui/src/hooks/nodeEditor/audioNodeFactory/createFmOperatorNode.ts` vs `skald-backend/codegen.odin`
*   **Issue:** Frontend sets `carrier.frequency.setValueAtTime(data.frequency)`. Backend calculates `carrier_freq = voice.current_freq * ratio`.
*   **Consequence:** A patch sounding like a harmonic bell in the backend export will sound like a sub-audio LFO rumble (or static tone) in the frontend preview, as the frontend interprets "2.0" as 2Hz, not the 2nd harmonic.

### 3. Missing AudioWorklet Loading
*   **File:** `skald-ui/src/hooks/nodeEditor/useAudioEngine.ts`
*   **Issue:** `useAudioEngine` loads worklets using `URL.createObjectURL` from a string blob. While this works, it bypasses module resolution.
*   **Risk:** If worklets grow complex and need imports, this method will fail.

---

## 3. Refactoring Roadmap (Prioritized)

### Priority 1: Core Engine Stability (The "Plumbing")
1.  **Fix Connection Logic:** Rewrite `connectNodes` to check for `_skaldNode` and inspect its properties/exposed parameters before falling back to native AudioNode connections.
2.  **Unify FM Logic:** Change Frontend FM Operator to use a `multiply` node (or custom worklet) to scale the incoming note frequency by the Ratio parameter, matching Backend behavior.

### Priority 2: DSP Parity (The "Sound")
3.  **Implement Backend Reverb:** Replace the simple delay line in `codegen.odin` with a proper Schroeder or FDN reverb to match the Frontend's quality (or switch Frontend to algorithmic to match Backend).
4.  **Implement Backend Wavetable:** Port the logic from `wavetable.worklet.ts` to `codegen.odin`.
5.  **Fix Distortion:** Add `tone` (LowPass) and `mix` logic to `generate_distortion_code`.

### Priority 3: Architecture (The "Future")
6.  **Decouple Audio Engine:** Extract `useAudioEngine` logic into a class-based `AudioGraphManager`. This removes the dependency on React renders for audio graph updates and allows for cleaner state management.
7.  **Standardize Parameter Access:** Create a strict interface for how nodes expose their parameters, removing the ad-hoc `_skaldNode` access.

---

## 4. Verification of Fixes

### Panner Initialization
*   **Status:** **Functional**
*   **Code:** `createPannerNode.ts` correctly calls `panner.pan.setValueAtTime(node.data.pan ?? 0, context.currentTime)`.
*   **Verdict:** Meets requirements.

### ADSR Release Logic
*   **Status:** **Functional (with caveats)**
*   **Code:** `voice.ts` uses `linearRampToValueAtTime(0, startTime + release)`.
*   **Caveat:** `voice.trigger` hard resets gain to 0 (`setValueAtTime(0, startTime)`). This will cause clicking if a voice is re-triggered during its release phase (voice stealing).
*   **Recommendation:** Change `voice.trigger` to ramp from the current value or use a very short fade-out before reset.

---

**Conclusion:**
The codebase has a solid foundation but suffers from significant divergence between the Preview engine and the Export engine. The "Silent Connection Failure" is the most critical bug preventing advanced sound design (Modulation). Addressing Priority 1 items is mandatory before starting the Sequencer phase.
