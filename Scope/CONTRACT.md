# **Skald JSON Contract v2**

This document defines the official JSON data structure that is passed from a client (like the Skald UI) to the skald\_codegen Odin backend. The backend consumes this structure from its standard input (stdin).

## **Root Object: AudioGraph**

| Field | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| nodes | Array of Node | A list of all audio nodes in the graph. | Yes |
| connections | Array of Connection | A list of all connections (edges) between nodes. | Yes |

## **Object: Node**

Represents a single audio processing unit, like an oscillator, or a complex, encapsulated instrument.

| Field | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| id | Integer | A unique integer identifier for the node. | Yes |
| type | String | The type of the node (e.g., "Oscillator", "Filter", "Instrument"). This determines the code generation logic. | Yes |
| position | Object (Vec2) | The {x, y} coordinates of the node on the UI canvas. Used by the frontend only. | Yes |
| parameters | Object | A key-value map of the node's specific parameters. Keys are strings, values can be string, number, or boolean. | Yes |
| subgraph | Object (AudioGraph) | **If type is "Instrument"**, this field contains the complete definition of the instrument's internal graph. | Only if type is "Instrument" |

## **Object: Connection**

Represents a directed edge from one node's output port to another node's input port.

| Field | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| from\_node | Integer | The id of the source node. | Yes |
| from\_port | String | The name of the output port on the source node (e.g., "output"). | Yes |
| to\_node | Integer | The id of the target node. | Yes |
| to\_port | String | The name of the input port on the target node (e.g., "input", "frequency\_mod"). | Yes |

## **The "Instrument" Node Type**

The Instrument node is a special, composite node. It encapsulates an entire AudioGraph within its subgraph property. This allows for creating complex, reusable patches that can be treated as a single unit, which is the foundation for polyphony.

* The subgraph within an Instrument has its own set of nodes and connections.  
* Node ids within a subgraph must be unique within that subgraph, but do not need to be unique globally. The backend parser should handle this namespacing.  
* To define how the outside graph connects to the inside graph, the subgraph uses special node types:  
  * "InstrumentInput": Represents an input port on the parent Instrument node. It has a name parameter corresponding to the to\_port of a connection to the parent.  
  * "InstrumentOutput": Represents an output port on the parent Instrument node. It has a name parameter corresponding to the from\_port of a connection from the parent.

### **Example: Instrument Node**

Here is an example of an AudioGraph containing a single Instrument node. The instrument itself contains a simple oscillator and an ADSR envelope.  
{  
  "nodes": \[  
    {  
      "id": 1,  
      "type": "MidiInput",  
      "position": { "x": 100, "y": 150 },  
      "parameters": {}  
    },  
    {  
      "id": 10,  
      "type": "Instrument",  
      "position": { "x": 300, "y": 150 },  
      "parameters": {  
        "name": "SimplePolySynth"  
      },  
      "subgraph": {  
        "nodes": \[  
          {  
            "id": 101,  
            "type": "InstrumentInput",  
            "position": { "x": 50, "y": 100 },  
            "parameters": { "name": "gate" }  
          },  
          {  
            "id": 102,  
            "type": "InstrumentInput",  
            "position": { "x": 50, "y": 200 },  
            "parameters": { "name": "note" }  
          },  
          {  
            "id": 103,  
            "type": "Oscillator",  
            "position": { "x": 250, "y": 200 },  
            "parameters": { "type": "SQUARE" }  
          },  
          {  
            "id": 104,  
            "type": "ADSR",  
            "position": { "x": 450, "y": 150 },  
            "parameters": { "attack": 0.01, "release": 0.3 }  
          },  
          {  
            "id": 105,  
            "type": "InstrumentOutput",  
            "position": { "x": 650, "y": 150 },  
            "parameters": { "name": "output" }  
          }  
        \],  
        "connections": \[  
          { "from\_node": 102, "from\_port": "output", "to\_node": 103, "to\_port": "frequency" },  
          { "from\_node": 101, "from\_port": "output", "to\_node": 104, "to\_port": "gate" },  
          { "from\_node": 103, "from\_port": "output", "to\_node": 104, "to\_port": "input" },  
          { "from\_node": 104, "from\_port": "output", "to\_node": 105, "to\_port": "input" }  
        \]  
      }  
    },  
    {  
        "id": 20,  
        "type": "GraphOutput",  
        "position": { "x": 500, "y": 150 },  
        "parameters": {}  
    }  
  \],  
  "connections": \[  
      { "from\_node": 1, "from\_port": "gate", "to\_node": 10, "to\_port": "gate" },  
      { "from\_node": 1, "from\_port": "note", "to\_node": 10, "to\_port": "note" },  
      { "from\_node": 10, "from\_port": "output", "to\_node": 20, "to\_port": "input" }  
  \]  
}  
