## MixerNode
### Purpose
Represents a mixer with a variable number of inputs and a single output.

### Props / Inputs
| Prop         | Type     | Description                                                        |
|--------------|----------|--------------------------------------------------------------------|
| `data`       | `object` | An object containing node data.                                    |
| `data.label` | `string` | (Optional) A custom label for the node.                            |
| `data.inputCount` | `number` | (Optional) The number of input handles to create. Defaults to 4. |

### Emitted Events / Outputs
- None

### Dependencies
- `React`
- `reactflow`