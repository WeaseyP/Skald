# Skald

**Visual Audio Programming Language & Code Generator for Odin**

Skald is a hybrid development tool that combines a modern visual editor with a high-performance code generation engine. Users construct audio processing graphs visually, and Skald compiles them into pure, dependency-free **Odin** source code, ready to be dropped into games or audio applications.

## 🚀 Getting Started

### Prerequisites

*   **Node.js**: Required to run the user interface.
*   **Odin Compiler**: Required to build the backend generator. Ensure `odin` is in your system `PATH`.

### Installation

```bash
git clone https://github.com/WeaseyP/Skald.git
cd skald/skald-ui
npm install
```

### Running the App

All development operations are driven from the `skald-ui` directory.

```bash
# Inside skald-ui/
npm start
```

This command automatically:
1.  Compiles the Odin backend (`skald-backend/`).
2.  Copies the resulting executable to the UI folder.
3.  Launches the Electron application.

## 🎛️ Available Audio Nodes

Skald supports a robust set of audio building blocks. These are the nodes currently available in the engine:

| Node Type | Parameters | Description |
| :--- | :--- | :--- |
| **Oscillator** | Frequency, Waveform (Sine, Saw, Square, Triangle), PulseWidth, Phase | The primary sound source. Supports Unison and Detune at the Instrument level. |
| **FM Operator** | Ratio, ModIndex | Designed for Frequency Modulation synthesis. Frequency acts as a ratio of the base pitch. |
| **Wavetable** | Frequency, Position | Wavetable oscillator. |
| **Noise** | Amplitude, Type (White) | Noise generator useful for percussion or textures. |
| **LFO** | Frequency, Amplitude, Waveform | Low Frequency Oscillator for modulating other parameters. |
| **Sample & Hold**| Rate, Amplitude | Generates random stepped values at a specific rate. |
| **ADSR** | Attack, Decay, Sustain, Release, Depth | Standard Envelope Generator for shaping amplitude or modulation. |
| **Filter** | Cutoff, Resonance, Type (LowPass, HighPass, BandPass, Notch) | Chamberlin State Variable Filter (SVF). |
| **Delay** | Time, Feedback, Mix | Delay line effect. |
| **Reverb** | Decay, Mix | Simple Feedback Delay Network (FDN) reverb. |
| **Distortion** | Drive, Shape (SoftClip, HardClip) | Waveshaping distortion for adding grit or saturation. |
| **Mixer** | Gain (per channel) | Simple utility to sum multiple signals. |
| **Panner** | Pan | Stereo panning control. |
| **Gain** | Gain | Volume control / VCA. |
| **Mapper** | InMin, InMax, OutMin, OutMax | Math utility to re-map a signal from one range to another. |
| **MIDI Input** | - | Interface for incoming Note On/Off events. Outputs Pitch (V/Oct), Gate, and Velocity. |

## 🏗️ Architecture

*   **Frontend (`skald-ui/`)**: A **React + TypeScript** application wrapped in **Electron**. It manages the visual node graph (via React Flow) and user interaction.
*   **Backend (`skald-backend/`)**: A headless CLI tool written in **Odin**. It accepts a JSON representation of the audio graph via `stdin` and outputs optimized Odin source code via `stdout`.

## 🛠️ Testing Generated Code

To verify the audio engine without the UI:

1.  Generate code using the Skald UI.
2.  Replace the contents of `skald-backend/tester/generated_audio/generated_audio.odin` with the output. (Don't add a second `.odin` file next to it — the package would end up with duplicate symbols — and don't paste into `tester/test_harness.odin`, which is the player, not the generated code.)
3.  Run the test harness:

```bash
cd skald-backend
# Windows
.\build_and_test.bat
```
