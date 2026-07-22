# Skald

Skald is a Windows desktop application for building audio instruments, sound effects, and songs with a node graph. It previews the audio and generates Odin source code for use in a game or audio application.

## Status

Version 0.1.0 is a prerelease. The main editing, sequencing, preview, save/load, and Odin export workflows are in place. Bugs are expected, and project files or generated APIs may change before 1.0.

See the [v0.1.0 release notes](docs/releases/v0.1.0.md), [release process](docs/RELEASING.md), and [bug list](BUGS.md).

## Install

Windows builds are available from the [GitHub releases page](https://github.com/WeaseyP/Skald/releases). Use the Setup executable for a normal installation or the ZIP for a portable copy.

### Build from source

Requirements:

- Windows 10 or newer
- Git
- Node.js 22 and npm
- Windows C++ build tools used by Electron dependencies

From the repository root:

~~~powershell
git clone https://github.com/WeaseyP/Skald.git
cd Skald
.\scripts\setup-dev.ps1
~~~

The setup script installs npm dependencies, downloads Odin `dev-2025-02` into the ignored `.tools` directory, and builds the Odin code generator. It does not install Odin system-wide.

## Run

After setup:

~~~powershell
cd skald-ui
npm start
~~~

To set up and start the application in one command:

~~~powershell
.\scripts\setup-dev.ps1 -Start
~~~

`npm start` uses the existing code generator. If you change the Odin backend, run:

~~~powershell
cd skald-ui
npm run start:rebuild
~~~

## Project layout

| Path | Purpose |
| --- | --- |
| `skald-ui/` | Electron, React, TypeScript, the instrument graph, sequencer, and audio preview |
| `skald-backend/` | Odin code generator and generated-code test harness |
| `examples/` | Importable sound-effect, instrument, and song projects |
| `scripts/` | Developer setup and Windows release scripts |
| `docs/` | Release documentation |

The UI sends a project description to `skald_codegen.exe`. The generator writes an Odin source file containing the instruments, effects, sequencing data, and control functions for that project.

## Nodes

| Node | Purpose |
| --- | --- |
| Oscillator | Sine, saw, triangle, and pulse-width square wave source |
| Noise | White-noise source |
| LFO | Free-running or BPM-synced modulation oscillator |
| Sample and Hold | Free-running or BPM-synced stepped random modulation |
| FM Operator | FM sine operator using a ratio of the played note |
| Wavetable | Position morphing between sine, triangle, saw, and square |
| ADSR | Attack, decay, sustain, and release envelope |
| Filter | Low-pass, high-pass, band-pass, and notch filtering |
| Delay | Delay time, feedback, mix, and BPM sync |
| Reverb | Decay, pre-delay, and wet/dry mix |
| Distortion | Waveshaping, tone, and wet/dry mix |
| Mixer | Multiple inputs with a level for each channel |
| Mapper | Maps a modulation signal from one range to another |
| Panner | Equal-power stereo panning |
| VCA | Gain stage with a modulation input |
| Output | Routes a patch to the master output |
| MIDI Input | Pitch, gate, and velocity from a MIDI device |

## Tests

Run the backend checks from `skald-backend`:

~~~powershell
.\run_acceptance.bat
.\run_golden.bat check
~~~

Run the UI checks from `skald-ui`:

~~~powershell
npm run lint
npm run typecheck
npm test
~~~

To build and test the Windows release from the repository root:

~~~powershell
.\scripts\build-release.ps1
~~~

## Test generated Odin code

Generate an Odin file from the application, then place its contents in:

`skald-backend/tester/generated_audio/generated_audio.odin`

Do not add a second Odin file to that directory, and do not replace `tester/test_harness.odin`. Odin expects one package per directory.

Run the harness:

~~~powershell
cd skald-backend
.\build_and_test.bat
~~~
