# **Skald JSON Contract v3.0**

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
| `position`   | Object (`Vec2`)      | The `{x, y}` coordinates of the node on the UI canvas. Used by the frontend only.                                                        | Yes                              |
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
    * `frequencyRatio` (number): A multiplier for the incoming carrier frequency. (e.g., `2.0`).
    * `amplitude` (number): The amplitude of the modulating signal.
* **Ports**:
    * Inputs: `input_carrier`, `input_mod`
    * Outputs: `output`

#### **`Wavetable`**
Plays back a waveform from a lookup table.
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
    * Inputs: `input` (signal to shape), `input_gate` (to trigger the envelope)
    * Outputs: `output`

#### **`LFO`**
A Low-Frequency Oscillator for creating cyclical modulation.
* **Parameters**:
    * `waveform` (string): `"Sine"`, `"Sawtooth"`, `"Square"`, `"Triangle"`.
    * `frequency` (number): The oscillation rate in Hz.
    * `amplitude` (number): The output depth, `0.0` to `1.0`.
    * `bpmSync` (boolean): If true, `frequency` is interpreted as a beat division.
* **Ports**:
    * Outputs: `output`

#### **`SampleHold`**
Generates random values at a specified rate.
* **Parameters**:
    * `rate` (number): The rate at which to generate new values in Hz.
    * `amplitude` (number): The output depth, `0.0` to `1.0`.
    * `bpmSync` (boolean): If true, `rate` is interpreted as a beat division.
* **Ports**:
    * Outputs: `output`

### **Effects**

#### **`Filter`**
Attenuates specific frequencies of a signal.
* **Parameters**:
    * `type` (string): `"LowPass"`, `"HighPass"`, `"BandPass"`, `"Notch"`.
    * `cutoff` (number): The center/cutoff frequency in Hz.
    * `resonance` (number): The emphasis (Q factor) at the cutoff frequency.
* **Ports**:
    * Inputs: `input`, `input_cutoff`, `input_resonance`
    * Outputs: `output`

#### **`Delay`**
Creates echoes of an input signal.
* **Parameters**:
    * `delayTime` (number): The delay time in seconds.
    * `feedback` (number): The amount of output fed back into the input, `0.0` to `1.0`.
    * `wetDryMix` (number): The balance between the original and delayed signal, `0.0` to `1.0`.
    * `bpmSync` (boolean): If true, `delayTime` is interpreted as a beat division.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

#### **`Reverb`**
Simulates the acoustic reflections of a space.
* **Parameters**:
    * `roomSize` (number): The perceived size of the space, `0.0` to `1.0`.
    * `damping` (number): How quickly high frequencies fade, `0.0` to `1.0`.
    * `wetDryMix` (number): The balance between the original and reverberated signal, `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

#### **`Distortion`**
Adds harmonic content to a signal.
* **Parameters**:
    * `drive` (number): The amount of distortion, `0.0` to `1.0`.
    * `shape` (string): The type of distortion curve (e.g., `"SoftClip"`, `"HardClip"`).
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

### **Utilities**

#### **`Mixer`**
Combines multiple signals.
* **Parameters**:
    * `input_1_gain` (number): Gain for input 1, `0.0` to `1.0`.
    * `input_2_gain` (number): Gain for input 2, `0.0` to `1.0`.
    * `...`
    * `input_N_gain` (number): Gain for input N.
* **Ports**:
    * Inputs: `input_1`, `input_2`, `...`, `input_N`
    * Outputs: `output`

#### **`Panner`**
Positions a signal in the stereo field.
* **Parameters**:
    * `pan` (number): Stereo position, `-1.0` (left) to `1.0` (right).
* **Ports**:
    * Inputs: `input`, `input_pan`
    * Outputs: `output`

#### **`GraphOutput`**
Represents the final output of a graph or subgraph.
* **Parameters**: None.
* **Ports**:
    * Inputs: `input`

### **Composition**

#### **`Instrument`**
A special composite node that encapsulates a subgraph.
* **Parameters**:
    * `name` (string): A user-defined name for the instrument.
    * `polyphony` (integer): Number of voices that can play simultaneously. (Default: `1`).
    * `glideTime` (number): Time in seconds to slide between notes. (Default: `0`).
* **Ports**:
    * Inputs/Outputs: Defined dynamically by `GraphInput` and `GraphOutput` nodes within its `subgraph`.

#### **`GraphInput`** (For use inside Instrument subgraphs)
Defines an input port for a parent `Instrument` node.
* **Parameters**:
    * `name` (string): The name of the port to expose on the parent Instrument (e.g., `"input_amp"`).
* **Ports**:
    * Outputs: `output`