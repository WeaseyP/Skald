## ParameterPanel
### Purpose
Renders a dynamic panel with controls to edit the parameters of a currently selected node from the graph.

### Props / Inputs
| Prop           | Type                                                     | Description                                                                          |
|----------------|----------------------------------------------------------|--------------------------------------------------------------------------------------|
| `selectedNode` | `Node | null`                                            | The node currently selected in the React Flow graph.                                 |
| `onUpdateNode` | `(nodeId: string, data: object, subNodeId?: string) => void` | Callback function to update the data of a node or a sub-node within an instrument/group. |
| `allNodes`     | `Node[]`                                                 | An array of all nodes in the graph, used for context.                                |
| `allEdges`     | `Edge[]`                                                 | An array of all edges in the graph.                                                  |
| `bpm`          | `number`                                                 | The current beats per minute, used for BPM-syncable controls.                        |

### Emitted Events / Outputs
- Calls the `onUpdateNode` prop function when a parameter is changed.

### Dependencies
- `React`
- `reactflow`
- `CustomSlider`
- `BpmSyncControl`
- `AdsrEnvelopeEditor`
- `XYPad`