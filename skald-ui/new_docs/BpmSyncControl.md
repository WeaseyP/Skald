## BpmSyncControl
### Purpose
A dropdown menu that allows the user to select a musical note division (e.g., "1/4", "1/8t") for parameters that need to be synchronized with the global BPM.

### Props / Inputs
| Prop       | Type                        | Description                                          |
|------------|-----------------------------|------------------------------------------------------|
| `value`    | `string`                    | The currently selected note division value.          |
| `onChange` | `(newDivision: string) => void` | Callback function triggered when a new division is selected. |

### Emitted Events / Outputs
- Calls the `onChange` prop with the new string value when a selection is made.

### Dependencies
- `React`