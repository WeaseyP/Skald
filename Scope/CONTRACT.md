# **Skald JSON Contract v4.0**

This document defines the official JSON data structure that is passed from a client (like the Skald UI) to the `skald_codegen` Odin backend. The backend consumes this structure from its standard input (stdin).

## **Root Object: AudioGraph**

The top-level object representing the entire audio processing chain.

| Field       | Type              | Description                                        | Required |
| :---------- | :---------------- | :------------------------------------------------- | :------- |
| `nodes`     | Array of Node     | A list of all audio nodes in the graph.            | Yes      |
| `connections` | Array of Connection | A list of all connections (edges) between nodes. | Yes      |

---

## **Object: Node**

Represents a single audio processing unit.

| Field        | Type                 | Description                                                                                                                              | Required                         |
| :----------- | :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| `id`         | Integer              | A unique integer identifier for the node within its current graph scope.                                                                 | Yes                              |
| `type`       | String               | The type of the node. See **Node Reference** below for supported types.                                                                  | Yes                              |
| `position`   | Object (`{x, y}`)    | The coordinates of the node on the UI canvas. Used by the frontend only.                                                                 | Yes                              |
| `parameters` | Object               | A key-value map of the node's specific parameters. Keys are strings, values can be `string`, `number`, or `boolean`.                      | Yes                              |
| `subgraph`   | Object (`AudioGraph`) | **If `type` is "Instrument"**, this field contains the complete definition of the instrument's internal graph.                            | Only if `type` is "Instrument"   |

---

## **Object: Connection**

Represents a directed edge from one node's output port to another node's input port.

| Field       | Type   | Description                                                        | Required |
| :---------- | :----- | :----------------------------------------------------------------- | :------- |
| `from_node` | Integer| The `id` of the source node.                                       | Yes      |
| `from_port` | String | The name of the output port on the source node (e.g., "output").   | Yes      |
| `to_node`   | Integer| The `id` of the target node.                                       | Yes      |
| `to_port`   | String | The name of the input port on the target node (e.g., "input_freq").| Yes      |

---

## **Node Reference**

### **Generators**

#### **`MidiInput`**
Serves as the primary control source for an instrument, providing Pitch, Gate, and Velocity signals from a MIDI device.
* **Parameters**:
    * `device` (string): The name or ID of the MIDI input device to listen to. (Default: `"All"`).
    * `useMpe` (boolean): Whether to enable Multidimensional Polyphonic Expression support. (Default: `false`).
* **Ports**:
    * Outputs: `pitch`, `gate`, `velocity`

#### **`Oscillator`**
Generates a periodic waveform.
* **Parameters**:
    * `waveform` (string): `"Sine"`, `"Sawtooth"`, `"Square"`, `"Triangle"`.
    * `frequency` (number): The base frequency in Hz (e.g., `440.0`).
    * `amplitude` (number): The output amplitude, `0.0` to `1.0`.
    * `pulseWidth` (number): For `"Square"` wave, the duty cycle from `0.01` to `0.99`. (Default: `0.5`).
    * `phase` (number): The starting phase in degrees, `0` to `360`. (Default: `0`).
* **Ports**:
    * Inputs: `input_freq`, `input_amp`, `input_pulseWidth`
    * Outputs: `output`

#### **`Noise`**
Generates a noise signal.
* **Parameters**:
    * `type` (string): `"White"`, `"Pink"`.
    * `amplitude` (number): The output amplitude, `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input_amp`
    * Outputs: `output`

#### **`FMOperator`**
A sine wave oscillator configured for Frequency Modulation synthesis.
* **Parameters**:
    * `frequency` (number): The base frequency of the carrier wave in Hz.
    * `modIndex` (number): The modulation depth.
* **Ports**:
    * Inputs: `input_mod` (the modulating signal)
    * Outputs: `output`

#### **`Wavetable`**
(Placeholder) Plays back a waveform from a lookup table.
* **Parameters**:
    * `tableName` (string): The identifier for the wavetable to use.
    * `frequency` (number): The playback frequency in Hz.
* **Ports**:
    * Inputs: `input_freq`, `input_pos` (for wavetable position)
    * Outputs: `output`

### **Modulators**

#### **`ADSR`**
Shapes a signal with an Attack-Decay-Sustain-Release envelope.
* **Parameters**:
    * `attack` (number): Attack time in seconds (e.g., `0.01`).
    * `decay` (number): Decay time in seconds (e.g., `0.2`).
    * `sustain` (number): Sustain level, `0.0` to `1.0`.
    * `release` (number): Release time in seconds (e.g., `0.5`).
    * `depth` (number): The overall impact of the envelope, `0.0` to `1.0`. (Default: `1.0`).
* **Ports**:
    * Inputs: `input` (signal to shape), `gate` (to trigger the envelope)
    * Outputs: `output`

#### **`LFO`**
A Low-Frequency Oscillator for creating cyclical modulation.
* **Parameters**:
    * `waveform` (string): `"Sine"`, `"Sawtooth"`, `"Square"`, `"Triangle"`.
    * `frequency` (number): The oscillation rate in Hz. The frontend converts from a musical subdivision to Hz if `bpmSync` is active.
    * `amplitude` (number): The output depth, `0.0` to `1.0`.
    * `bpmSync` (boolean): A flag used by the frontend to determine if `frequency` should be calculated from a musical time division.
    * `syncRate` (string): A musical time division (e.g., "1/4", "1/8t") used by the frontend when `bpmSync` is true.
* **Ports**:
    * Outputs: `output`

#### **`SampleHold`**
Generates random values at a specified rate.
* **Parameters**:
    * `rate` (number): The rate at which to generate new values in Hz. The frontend converts from a musical subdivision to Hz if `bpmSync` is active.
    * `amplitude` (number): The output depth, `0.0` to `1.0`.
    * `bpmSync` (boolean): A flag used by the frontend to determine if `rate` should be calculated from a musical time division.
    * `syncRate` (string): A musical time division (e.g., "1/4", "1/8t") used by the frontend when `bpmSync` is true.
* **Ports**:
    * Outputs: `output`

### **Effects**

#### **`Filter`**
Attenuates specific frequencies of a signal.
* **Parameters**:
    * `type` (string): `"Lowpass"`, `"Highpass"`, `"Bandpass"`, `"Notch"`.
    * `cutoff` (number): The center/cutoff frequency in Hz.
    * `resonance` (number): The emphasis (Q factor) at the cutoff frequency.
* **Ports**:
    * Inputs: `input`, `input_cutoff`, `input_resonance`
    * Outputs: `output`

#### **`Delay`**
Creates echoes of an input signal.
* **Parameters**:
    * `delayTime` (number): The delay time in seconds. The frontend converts from a musical subdivision to seconds if `bpmSync` is active.
    * `feedback` (number): The amount of output fed back into the input, `0.0` to `1.0`.
    * `mix` (number): The balance between the original and delayed signal, `0.0` to `1.0`.
    * `bpmSync` (boolean): A flag used by the frontend to determine if `delayTime` should be calculated from a musical time division.
    * `syncRate` (string): A musical time division (e.g., "1/4", "1/8t") used by the frontend when `bpmSync` is true.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

#### **`Reverb`**
Simulates the acoustic reflections of a space.
* **Parameters**:
    * `decay` (number): The time it takes for reflections to fade out, in seconds.
    * `preDelay` (number): The time between the direct sound and the first reflections, in seconds.
    * `mix` (number): The balance between the original and reverberated signal, `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

#### **`Distortion`**
Adds harmonic content to a signal.
* **Parameters**:
    * `drive` (number): The amount of gain applied before clipping, from `1.0` up.
    * `tone` (number): A low-pass filter cutoff (Hz) to shape the distorted signal.
    * `mix` (number): The balance between the original and distorted signal, `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

### **Utilities**

#### **`Mixer`**
Combines multiple signals.
* **Parameters**:
    * `inputCount` (integer): The number of inputs available on the node.
    * `level1`, `level2`, ... (number): The gain for each corresponding input, `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input1`, `input2`, ...
    * Outputs: `output`

#### **`Panner`**
Positions a signal in the stereo field.
* **Parameters**:
    * `pan` (number): Stereo position, `-1.0` (left) to `1.0` (right).
* **Ports**:
    * Inputs: `input`, `input_pan`
    * Outputs: `output_left`, `output_right`

### **Composition**

#### **`Instrument`**
A special composite node that encapsulates a subgraph for polyphonic playback.
* **Parameters**:
    * `name` (string): A user-defined name for the instrument.
    * `voiceCount` (integer): Number of voices that can play simultaneously. (Default: `8`).
    * `glide` (number): Time in seconds to slide between notes. (Default: `0.05`).
    * `unison` (integer): Number of internal oscillators to stack for a thicker sound. (Default: `1`).
    * `detune` (number): The amount in cents to detune the unison voices. (Default: `5`).
* **Ports**:
    * Inputs/Outputs: Defined dynamically by `GraphInput` and `GraphOutput` nodes within its `subgraph`.

#### **`GraphInput`**
Defines an input port for a parent `Instrument` node. Used inside an Instrument's subgraph.
* **Parameters**:
    * `name` (string): The name of the port to expose on the parent Instrument (e.g., `"gate"`).
* **Ports**:
    * Outputs: `output`

#### **`GraphOutput`**
Represents the final audio output of an `Instrument`'s subgraph.
* **Parameters**: None.
* **Ports**:
    * Inputs: `input`