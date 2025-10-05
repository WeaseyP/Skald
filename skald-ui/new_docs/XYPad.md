## XYPad
### Purpose
A two-dimensional control surface that allows the user to manipulate two values (X and Y) simultaneously by dragging a handle within a bounded area. It supports both linear and logarithmic scaling for each axis.

### Props / Inputs
| Prop     | Type                                       | Description                                                                 |
|----------|--------------------------------------------|-----------------------------------------------------------------------------|
| `xValue` | `number`                                   | The controlled value for the X-axis.                                        |
| `yValue` | `number`                                   | The controlled value for the Y-axis.                                        |
| `minX`   | `number`                                   | The minimum value of the X-axis range.                                      |
| `maxX`   | `number`                                   | The maximum value of the X-axis range.                                      |
| `minY`   | `number`                                   | The minimum value of the Y-axis range.                                      |
| `maxY`   | `number`                                   | The maximum value of the Y-axis range.                                      |
| `onChange`| `(values: { x: number; y: number }) => void` | Callback function that is called with the new `{x, y}` values when the user releases the handle. |
| `xScale` | `'log' \| 'linear'` (optional)             | The scale to use for the X-axis. Defaults to `linear`.                      |
| `yScale` | `'log' \| 'linear'` (optional)             | The scale to use for the Y-axis. Defaults to `linear`.                      |
| `width`  | `number` (optional)                        | The width of the control pad. Defaults to `250`.                            |
| `height` | `number` (optional)                        | The height of the control pad. Defaults to `200`.                           |

### Emitted Events / Outputs
- Calls the `onChange` prop with an object containing the new `x` and `y` values when the user finishes dragging the handle.

### Dependencies
- `React`