## Sidebar
### Purpose
Provides the main user interface for creating nodes, controlling global settings like BPM, and triggering application-level actions like generating code, playback, and saving/loading the graph.

### Props / Inputs
| Prop                | Type                        | Description                                                                 |
|---------------------|-----------------------------|-----------------------------------------------------------------------------|
| `onGenerate`        | `() => void`                | Callback when the 'Generate' button is clicked.                             |
| `onPlay`            | `() => void`                | Callback when the 'Play' button is clicked.                                 |
| `onStop`            | `() => void`                | Callback when the 'Stop' button is clicked.                                 |
| `isPlaying`         | `boolean`                   | Indicates if audio is currently playing.                                    |
| `onSave`            | `() => void`                | Callback when the 'Save' button is clicked.                                 |
| `onLoad`            | `() => void`                | Callback when the 'Load' button is clicked.                                 |
| `onCreateInstrument`| `() => void`                | Callback to group selected nodes into an instrument.                        |
| `onCreateGroup`     | `() => void`                | Callback to group selected nodes visually.                                  |
| `canCreateInstrument` | `boolean`                 | Determines if the 'Create Instrument' button should be enabled.             |
| `bpm`               | `number`                    | The current beats per minute of the application.                            |
| `onBpmChange`       | `(newBpm: number) => void`  | Callback when the BPM value is changed.                                     |
| `isLooping`         | `boolean`                   | Indicates if the playback is currently looping.                             |
| `onLoopToggle`      | `() => void`                | Callback when the loop toggle button is clicked.                            |

### Emitted Events / Outputs
- Drag events for creating new nodes (`oscillator`, `noise`, etc.).
- Calls various prop functions (`onGenerate`, `onPlay`, etc.) on user interaction.

### Dependencies
- `React`