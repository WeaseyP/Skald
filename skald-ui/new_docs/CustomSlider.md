## CustomSlider
### Purpose
A versatile slider component combined with a text input for precise value entry. It supports both linear and logarithmic scales and can be reset to a default value.

### Props / Inputs
| Prop           | Type                           | Description                                                              |
|----------------|--------------------------------|--------------------------------------------------------------------------|
| `min`          | `number`                       | The minimum value of the slider range.                                   |
| `max`          | `number`                       | The maximum value of the slider range.                                   |
| `value`        | `number`                       | The current controlled value of the slider.                              |
| `onChange`     | `(newValue: number) => void`   | Callback function that is called with the new value when the slider or input changes. |
| `scale`        | `'log' \| 'linear'` (optional) | The scale to use for the slider's movement. Defaults to `linear`.        |
| `step`         | `number` (optional)            | The increment/decrement step used for arrow keys in the text input. Defaults to `0.01`. |
| `defaultValue` | `number` (optional)            | The value to which the slider resets on Ctrl/Cmd+DoubleClick. Defaults to `0`. |
| `onReset`      | `() => void` (optional)        | A callback function that is triggered when the slider is reset.          |
| `className`    | `string` (optional)            | Allows passing a CSS class to the component's container.                 |

### Emitted Events / Outputs
- Calls the `onChange` prop with the new numeric value when the slider is moved or the text input is updated.
- Calls the `onReset` prop when the user Ctrl/Cmd+DoubleClicks the component.

### Dependencies
- `React`