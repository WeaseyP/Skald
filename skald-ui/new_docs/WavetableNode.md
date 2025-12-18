## WavetableNode
### Purpose
Represents a wavetable oscillator, which generates sound by cycling through a table of waveform samples. It has inputs for frequency and table position.

### Props / Inputs
| Prop      | Type           | Description                                  |
|-----------|----------------|----------------------------------------------|
| `data`    | `object`       | An object containing node data, including an optional `label`. |

#### Handles
- **Target `input_freq`**: Controls the frequency of the oscillator.
- **Target `input_pos`**: Controls the position within the wavetable.
- **Source `output`**: The output signal of the oscillator.

### Emitted Events / Outputs
- None

### Dependencies
- `React`
- `reactflow`