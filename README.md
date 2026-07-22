# Skald

**Visual Audio Programming Language & Code Generator for Odin**

Skald is a hybrid development tool that combines a modern visual editor with a high-performance code generation engine. Users construct audio processing graphs visually, and Skald compiles them into pure, dependency-free **Odin** source code, ready to be dropped into games or audio applications.

> **v0.1.0 game-production preview** - the core workflow is implemented, but bugs and breaking pre-1.0 changes are expected.

Windows releases include an installer and portable ZIP. See [release notes](docs/releases/v0.1.0.md) and the [release guide](docs/RELEASING.md).

## 🚀 Getting Started

### Prerequisites

* **Windows 10 or newer**
* **Node.js 22** and npm
* **Git**
* **Windows C++ build tools** required by Electron dependencies

Odin is pinned to `dev-2025-02` and installed inside this repository by the setup script, so no administrator access or system-wide Odin installation is required.

### Installation

```powershell
git clone https://github.com/WeaseyP/Skald.git
cd Skald
.\scripts\setup-dev.ps1
```

The script installs exact npm dependencies, downloads the pinned Odin compiler into the ignored `.tools/` directory when needed, and builds the code generator.

### Running the App

Start immediately after setup:

```powershell
.\scripts\setup-dev.ps1 -Start
```

For later launches:

```powershell
cd skald-ui
npm start
```

`npm start` uses the existing code generator. After changing the Odin backend, use `npm run start:rebuild` to rebuild it before Electron starts.

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
