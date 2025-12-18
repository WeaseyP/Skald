## GroupNode
### Purpose
A special node that acts as a container for other nodes, visually grouping them. It intelligently creates input and output handles based on the connections made to and from its child nodes.

### Props / Inputs
| Prop      | Type           | Description                                                               |
|-----------|----------------|---------------------------------------------------------------------------|
| `id`      | `string`       | The unique identifier of the group node, provided by React Flow.          |
| `data`    | `object`       | An object containing node data, including an optional `label` for the header. |

### Emitted Events / Outputs
- None

### Dependencies
- `React`
- `reactflow`