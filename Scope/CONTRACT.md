# **Skald JSON Contract v2.1**

This document defines the official JSON data structure that is passed from a client (like the Skald UI) to the `skald_codegen` Odin backend. The backend consumes this structure from its standard input (stdin).

## **Root Object: AudioGraph**

The top-level object representing the entire audio processing chain.

| Field       | Type              | Description                                        | Required |
| :---------- | :---------------- | :------------------------------------------------- | :------- |
| `nodes`     | Array of Node     | A list of all audio nodes in the graph.            | Yes      |
| `connections` | Array of Connection | A list of all connections (edges) between nodes. | Yes      |

---

## **Object: Node**

Represents a single audio processing unit, like an oscillator, or a complex, encapsulated instrument.

| Field        | Type                 | Description                                                                                                                              | Required                         |
| :----------- | :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| `id`         | Integer              | A unique integer identifier for the node within its current graph scope.                                                                 | Yes                              |
| `type`       | String               | The type of the node. This determines the code generation logic. See **Node Reference** below for supported types.                     | Yes                              |
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
| `to_port`   | String | The name of the input port on the target node (e.g., "input").     | Yes      |

---

## **Node Reference**

This section details the supported node types and their specific parameters and ports.

### **`Oscillator`**
Generates a periodic waveform.
* **Parameters**:
    * `frequency` (number): The base frequency in Hz (e.g., `440.0`).
    * `amplitude` (number): The output amplitude, typically from `0.0` to `1.0`.
    * `waveform` (string): The shape of the wave. Supported values: `"Sine"`, `"Sawtooth"`, `"Square"`, `"Triangle"`.
* **Ports**:
    * Inputs: `input_freq`, `input_amp`
    * Outputs: `output`

### **`ADSR`**
Shapes the volume of an incoming signal with an Attack-Decay-Sustain envelope. The release is implicit and happens when the note duration ends.
* **Parameters**:
    * `attack` (number): The attack time in seconds (e.g., `0.01`).
    * `decay` (number): The decay time in seconds (e.g., `0.2`).
    * `sustain` (number): The sustain level, from `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input` (for the audio signal to be shaped)
    * Outputs: `output`

### **`Noise`**
Generates a white noise signal.
* **Parameters**:
    * `amplitude` (number): The output amplitude, from `0.0` to `1.0`.
* **Ports**:
    * Inputs: `input_amp`
    * Outputs: `output`

### **`Filter`**
A simple low-pass filter.
* **Parameters**:
    * `cutoff` (number): The cutoff frequency in Hz.
* **Ports**:
    * Inputs: `input`
    * Outputs: `output`

### **`Instrument`**
A special composite node that encapsulates a subgraph.
* **Parameters**:
    * `name` (string): A user-defined name for the instrument.
* **Ports**:
    * Inputs/Outputs: Defined dynamically by the `InstrumentInput` and `InstrumentOutput` nodes within its `subgraph`.

### **`GraphInput`** (For use inside Instrument subgraphs)
Defines an input port for a parent `Instrument` node.
* **Parameters**:
    * `name` (string): The name of the port to expose on the parent Instrument (e.g., `"input_amp"`).
* **Ports**:
    * Outputs: `output`

### **`GraphOutput`**
Represents the final output of a graph or subgraph.
* **Parameters**: None.
* **Ports**:
    * Inputs: `input`

---

## **Example: Working Instrument**
This example shows a top-level graph with a single `Instrument` node connected to the final output. The instrument itself contains an Oscillator connected to an ADSR envelope. This structure is correctly parsed by the current `main.odin` code generator.

```json
{
  "nodes": [
    {
      "id": 4,
      "type": "Instrument",
      "position": { "x": 300, "y": 150 },
      "parameters": {
        "name": "SimpleADSRSynth"
      },
      "subgraph": {
        "nodes": [
          {
            "id": 1,
            "type": "Oscillator",
            "position": { "x": 100, "y": 100 },
            "parameters": {
              "frequency": 440.0,
              "amplitude": 0.5,
              "waveform": "Sawtooth"
            }
          },
          {
            "id": 2,
            "type": "ADSR",
            "position": { "x": 300, "y": 100 },
            "parameters": {
              "attack": 0.05,
              "decay": 0.15,
              "sustain": 0.44
            }
          },
          {
            "id": 3,
            "type": "GraphOutput",
            "position": { "x": 500, "y": 100 },
            "parameters": {}
          }
        ],
        "connections": [
          { "from_node": 1, "from_port": "output", "to_node": 2, "to_port": "input" },
          { "from_node": 2, "from_port": "output", "to_node": 3, "to_port": "input" }
        ]
      }
    },
    {
        "id": 5,
        "type": "GraphOutput",
        "position": { "x": 500, "y": 150 },
        "parameters": {}
    }
  ],
  "connections": [
      { "from_node": 4, "from_port": "output", "to_node": 5, "to_port": "input" }
  ]
}

