      
# Skald JSON Contract v1

This document defines the official JSON data structure that is passed from a client (like the Skald UI) to the `skald_codegen` Odin backend. The backend consumes this structure from its standard input (`stdin`).

## Root Object: `AudioGraph`

| Field       | Type                 | Description                                    | Required |
| :---------- | :------------------- | :--------------------------------------------- | :------- |
| `nodes`     | Array of `Node`      | A list of all audio nodes in the graph.        | Yes      |
| `connections` | Array of `Connection` | A list of all connections (edges) between nodes. | Yes      |

---

## Object: `Node`

Represents a single audio processing unit, like an oscillator or filter.

| Field      | Type           | Description                                                                          | Required |
| :--------- | :------------- | :----------------------------------------------------------------------------------- | :------- |
| `id`         | Integer        | A unique integer identifier for the node.                                            | Yes      |
| `type`       | String         | The type of the node (e.g., "Oscillator", "Filter", "GraphOutput"). This determines the code generation logic. | Yes      |
| `position`   | Object (`Vec2`) | The `{x, y}` coordinates of the node on the UI canvas. Used by the frontend only.     | Yes      |
| `parameters` | Object         | A key-value map of the node's specific parameters. Keys are strings, values can be string, number, or boolean. | Yes      |

---

## Object: `Connection`

Represents a directed edge from one node's output port to another node's input port.

| Field       | Type    | Description                                                             | Required |
| :---------- | :------ | :---------------------------------------------------------------------- | :------- |
| `from_node` | Integer | The `id` of the source node.                                            | Yes      |
| `from_port` | String  | The name of the output port on the source node (e.g., "output").          | Yes      |
| `to_node`   | Integer | The `id` of the target node.                                            | Yes      |
| `to_port`   | String  | The name of the input port on the target node (e.g., "input", "frequency_mod"). | Yes      |

    