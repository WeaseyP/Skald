## AdsrEnvelopeEditor
### Purpose
Provides a graphical interface for editing ADSR (Attack, Decay, Sustain, Release) envelope parameters. Users can drag control points to visually manipulate the envelope shape.

### Props / Inputs
| Prop      | Type                      | Description                                                                 |
|-----------|---------------------------|-----------------------------------------------------------------------------|
| `value`   | `AdsrData`                | An object containing the current `attack`, `decay`, `sustain`, and `release` values. |
| `onChange`| `(newValue: AdsrData) => void` | Callback function that is called with the new ADSR data when the envelope is modified. |
| `width`   | `number` (optional)       | The width of the SVG editor canvas. Defaults to `300`.                        |
| `height`  | `number` (optional)       | The height of the SVG editor canvas. Defaults to `150`.                       |
| `maxTime` | `number` (optional)       | The maximum time in seconds for the envelope's X-axis. Defaults to `4.0`.     |

### Emitted Events / Outputs
- Calls the `onChange` prop function with the updated `AdsrData` object whenever a control point is moved.

### Dependencies
- `React`