# Skald Adversarial Audit Report: Sequencer Readiness

**Auditor:** Jules (Principal Systems Architect)
**Phase:** Transition to Phase 14 (Beat Sequencer)
**Status:** **CRITICAL RISKS DETECTED**

## Executive Summary
The Skald codebase, while functional for single-voice sound design, is **structurally unfit** for a high-performance sequencer at 140 BPM.

The "Triangulation" audit revealed deceptive implementation gaps where the Frontend (Web Audio) promises features (Convolution Reverb, Wavetable Synthesis) that the Backend (Odin) fulfills with primitive placeholders (Delay lines, Sine waves).

Critically, the Sequencer architecture relies on main-thread `setInterval` and React state-based graph reconciliation. This guarantees timing jitter and UI freezing under load.

---

## 1. The Discrepancy Matrix (Triangulation Audit)
*A comparison of the UI Schema (Promise), Web Audio (Preview), and Odin (Product).*

| Node Type | Status | Severity | Details |
| :--- | :--- | :--- | :--- |
| **Reverb** | **CRITICAL FAILURE** | High | **UI:** Promises `decay`, `diffusion`. <br> **Frontend:** Convolution Reverb. <br> **Backend:** Simple tapped delay line. *Not a reverb.* |
| **Wavetable** | **DECEPTIVE** | High | **UI:** Selectable Tables. <br> **Frontend:** 4-table morphing. <br> **Backend:** Hardcoded Sine wave. |
| **FM Operator** | **LOGIC FAILURE** | High | **UI:** `Frequency` param. <br> **Frontend:** Fixed Hz (Monophonic). <br> **Backend:** Ratio-based (DX7 style). *Fundamentally different instruments.* |
| **Oscillator** | **FEATURE GAP** | Medium | **Frontend:** Monophonic. <br> **Backend:** Polyphonic Unison (Super Saw loops). <br> *Frontend sounds thin compared to backend.* |
| **ADSR** | **PARITY (BROKEN)** | Medium | **UI:** Promises "Exponential" curves. <br> **Both:** Implement strict Linear envelopes only. |
| **Filter** | **PASSABLE** | Low | **Frontend:** Biquad. <br> **Backend:** Chamberlin SVF. <br> *Different algorithms, but acceptably close.* |
| **Graph Input** | **BRITTLE** | Medium | **Backend:** Defaults to 0.0. Only defaults to 1.0 if named specifically "gate" (case-sensitive). |

---

## 2. Architectural Risk Report (Top 3)

### Risk 1: The `setInterval` Sequencer (Timing Jitter)
**Severity:** **BLOCKER**
The current `useSequencer.ts` drives the audio engine using `setInterval` on the JavaScript Main Thread.
*   **Why it fails:** At 140 BPM, a 16th note is ~107ms. JS timers are imprecise and blocked by UI rendering. A single React render taking 20ms will cause audible "stuttering" or "flams".
*   **Impact:** The sequencer will feel "loose" and unprofessional.

### Risk 2: React State Graph Reconciliation
**Severity:** **High**
`useAudioEngine.ts` runs a `useDeepCompareEffect` on the entire node graph.
*   **Why it fails:** If the sequencer updates UI state (e.g., a playhead or step highlighter), it triggers a React render. If `nodes` or `edges` reference identities change, the effect runs, tearing down and rebuilding parts of the Audio Graph.
*   **Impact:** Audio dropouts (clicks/pops) during playback when touching knobs or watching the playhead.

### Risk 3: Linear Voice Scaling (Frontend)
**Severity:** **Medium**
The `Instrument` class instantiates `N` full copies of the Web Audio graph (Nodes + Connections).
*   **Why it fails:** 8 Voices * 20 Nodes = 160 Web Audio Nodes per instrument. Browsers begin to throttle or glitch around 500-1000 nodes depending on hardware.
*   **Impact:** Limited polyphony in the preview engine compared to the compiled backend.

---

## 3. Novel Bug Log (Hunter/Killer Findings)

1.  **Backend Mixer Hard Limit:** `codegen.odin` hardcodes the Mixer loop to `1..=8`. Any inputs connected to ports > 8 are silently ignored.
2.  **Delay Buffer Overflow:** `codegen.odin` clamps delay buffers to 96,000 samples (~2s at 48k, 1s at 96k). If `delayTime` > 1.0s in a 96kHz context, the delay simply stops working or clips.
3.  **Graph Input Case Sensitivity:** Naming a Graph Input "Gate" (Capitalized) results in a default value of `0.0` (Silent) instead of `1.0` (Active) in the backend.

---

## 4. Refactoring Recommendations

### A. Fix the Sequencer Timing (The "Lookahead" Pattern)
**Action:** Move scheduling off `setInterval` directly triggering notes.
**Proposed Architecture:**
1.  Use `setInterval` only to "look ahead" (e.g., every 25ms).
2.  Schedule Web Audio events in the future using `audioContext.currentTime + offset`.
3.  **Critical:** Do *not* rely on React state for the tick loop. Use a `useRef` based scheduler or a dedicated Worker.

### B. Decouple UI from Audio Graph
**Action:** Stop using `useDeepCompareEffect` on the node graph for playback parameters.
**Proposed Architecture:**
1.  Separate `NodeStructure` (topology) from `NodeParameters` (values).
2.  Only rebuild the graph when topology changes (add/remove node).
3.  Stream parameter updates (Knob turns, Sequencer P-Locks) via `AudioParam.setValueAtTime` directly to the `audioNodes` ref map, bypassing React render cycles.

### C. Implement Backend Parity
**Action:** The backend DSP must be upgraded to match the Frontend's promise.
1.  **Reverb:** Replace the tapped delay with a proper Schroeder or FDN Reverb algorithm in Odin.
2.  **Wavetable:** Implement table lookups in Odin (export the table data from Frontend to JSON -> Odin).
3.  **FM:** Change Frontend `FmOperator` to use a `multiply` node to simulate Ratio-based frequency, matching the Backend.
