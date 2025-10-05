## OscillatorNode
### Purpose
Represents an oscillator as a node in the graph, with inputs to control frequency and amplitude.

### Props / Inputs
| Prop      | Type           | Description                                  |
|-----------|----------------|----------------------------------------------|
| `data`    | `object`       | An object containing node data, including an optional `label`. |

#### Handles
- **Target `input_freq`**: Controls the frequency of the oscillator.
- **Target `input_amp`**: Controls the amplitude of the oscillator.
- **Source `output`**: The output signal of the oscillator.

### Emitted Events / Outputs
- None

### Dependencies
- `React`
- `reactflow`