/*
================================================================================
| FILE: skald-ui/src/definitions/types.ts                                      |
|                                                                              |
| This file defines the core data structures and type contracts for the        |
| Skald audio graph nodes. By centralizing these type definitions, we enforce  |
| data consistency across the application, from the UI controls to the audio   |
| engine.                                                                      |
================================================================================
*/

// === Base Parameter Interfaces ===

/**
 * @interface BaseNodeParams
 * @property {string} [label] - The display name of the node instance in the UI.
 * @property {string[]} [exposedParameters] - A list of parameter names that are exposed for external control (e.g., via MIDI mapping or automation).
 */
export interface BaseNodeParams {
  label?: string;
  exposedParameters?: string[];
  analyser?: any; // AnalyserNode instance for visualization
  // React Flow v12 (@xyflow/react) constrains a node's data to
  // `Record<string, unknown>`. This index signature lets every NodeParams
  // variant satisfy `Node<NodeParams>` while keeping the named fields typed.
  // `any` (not `unknown`) preserves the loose `data.<x>` access the app relied
  // on under v11, where the default `Node` type carried `data: any`.
  [key: string]: any;
}

/**
 * @interface BpmSynchronizable
 * @property {boolean} [bpmSync] - If true, the node's timing is synchronized to the global BPM.
 * @property {string} [syncRate] - The note division to use for BPM sync (e.g., "1/4", "1/8t").
 */
export interface BpmSynchronizable {
  bpmSync?: boolean;
  syncRate?: string;
}

// === Node-Specific Parameter Interfaces ===

export interface FmOperatorParams extends BaseNodeParams {
  frequency: number;
  modIndex: number;
  // C5 (F-A02-7): output level, 0..1, with an input_amp port. Absent = 1.0,
  // the full-scale sin() every operator emitted before the field existed.
  amplitude?: number;
}

export interface WavetableParams extends BaseNodeParams {
  // Same note-vs-fixed pitch opt-in as OscillatorParams.fixedPitch.
  fixedPitch?: boolean;
  tableName: 'Sine' | 'Triangle' | 'Sawtooth' | 'Square';
  frequency: number;
  position: number;
  // C5 (F-A01-7): duty cycle of the square end of the morph, 0.01..0.99,
  // with an input_pulseWidth port. Absent = 0.5, the symmetric square the
  // engine always drew.
  pulseWidth?: number;
  // C5 (F-A01-8): start-point offset in degrees, as on the Oscillator.
  // Absent = 0.
  phase?: number;
  // Output level (0..1), multiplied into the wavetable sample. The engine has
  // always read it (with a 1.0 fallback) and the node card has always shown a
  // control for it; it was missing from this interface and from the defaults,
  // so a fresh node had no stored value and the card rendered "Amp 0" while
  // the generated code played unity. Optional because patches saved before
  // this field existed legitimately have no value — read it as 1.0.
  amplitude?: number;
}

export interface SampleHoldParams extends BaseNodeParams, BpmSynchronizable {
  rate: number;
  amplitude: number;
}

export type LfoWaveform = 'Sine' | 'Sawtooth' | 'Triangle' | 'Square';
export interface LfoParams extends BaseNodeParams, BpmSynchronizable {
  waveform: LfoWaveform;
  frequency: number;
  amplitude: number;
}

export type OscillatorWaveform = 'Sawtooth' | 'Sine' | 'Triangle' | 'Square';
export interface OscillatorParams extends BaseNodeParams {
  frequency: number;
  waveform: OscillatorWaveform;
  amplitude: number;
  pulseWidth: number;
  phase: number;
  // When true the oscillator ignores the played note and uses `frequency`
  // (drones, SFX layers that must not track pitch). Default: note-wins,
  // and `frequency` is unused.
  fixedPitch?: boolean;
}

export type FilterType = 'Lowpass' | 'Highpass' | 'Bandpass' | 'Notch';
export interface FilterParams extends BaseNodeParams {
  type: FilterType;
  cutoff: number;
  resonance: number;
}

export type NoiseType = 'White' | 'Pink';
export interface NoiseParams extends BaseNodeParams {
  type: NoiseType;
  amplitude: number;
}

export interface AdsrParams extends BaseNodeParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  depth: number;
  velocitySensitivity: number;
  // Roadmap E8 (9.4 item 2): per-stage curve tension, -1..1, 0 = linear —
  // the shape every ADSR generated before this packet, and what an
  // exposed-but-untouched curve field still generates at (schema/nodes.json).
  attackCurve: number;
  decayCurve: number;
  releaseCurve: number;
  lastTrigger?: number;
}

export interface DelayParams extends BaseNodeParams, BpmSynchronizable {
  delayTime: number;
  feedback: number;
  mix: number;
}

export interface ReverbParams extends BaseNodeParams {
  decay: number;
  preDelay: number;
  mix: number;
  // C5 (F-A07-7): one-pole lowpass on the fed-back sample, 0..1. Absent or
  // 0 = the undamped comb every existing patch has.
  damping?: number;
}

export interface DistortionParams extends BaseNodeParams {
  drive: number;
  shape: 'classic' | 'soft' | 'hard' | 'asymmetric';
  tone: number;
  mix: number;
}

export interface MixerChannelParams {
  id: number;
  level: number;
  pan: number; // Added pan for more realistic mixing
}

export interface MixerParams extends BaseNodeParams {
  inputCount: number;
  levels: MixerChannelParams[];
}

export interface PannerParams extends BaseNodeParams {
  pan: number;
}

export interface GainParams extends BaseNodeParams {
  gain: number;
  // C4 (F-A04-4): how the Gain port combines with the knob. 'multiply' —
  // what every new VCA gets — is `audio * knob * incoming`, so a bare
  // envelope shapes a note from silence. 'add' is the pre-C4 form
  // (`audio * (knob + incoming)`) every existing file keeps; the 2->3
  // migration stamps it. Absent reads as 'add' in the generator.
  gainMode?: 'multiply' | 'add';
}

export interface OutputParams extends BaseNodeParams {
  lastTrigger?: number;
}

export interface MidiInputParams extends BaseNodeParams {
  device: string;
  useMpe: boolean;
}

export interface MapperParams extends BaseNodeParams {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

// === Generic Graph Interfaces (for Subgraphs) ===

/**
 * @interface SkaldGraphNode
 * @property {string} id - A unique identifier for this specific node instance within its graph.
 * @property {string} type - The type of the node (e.g., 'oscillator', 'filter').
 * @property {object} position - The x/y coordinates for UI positioning.
 * @property {NodeParams} data - The parameter data for the node.
 */
export interface SkaldGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeParams;
}

/**
 * @interface SkaldGraphConnection
 * @property {string} from_node - The ID of the source SkaldGraphNode.
 * @property {string} from_port - The name of the source output port (e.g., 'output').
 * @property {string} to_node - The ID of the target SkaldGraphNode.
 * @property {string} to_port - The name of the target input port (e.g., 'input').
 */
export interface SkaldGraphConnection {
  from_node: string;
  from_port: string;
  to_node: string;
  to_port: string;
}


export interface InstrumentParams extends BaseNodeParams {
  name: string;
  // C3 (F-B05-4): the symbol prefix the game compiles against
  // (<exportId>_trigger, _note_on, _set_<param>…), decoupled from the display
  // `name` so a cosmetic rename no longer breaks the game's build. Absent =
  // derive from `name`, the pre-C3 rule; the 1->2 migration backfills it.
  exportId?: string;
  // C3 (F-A09-8): one-shot SFX or self-playing music layer. Absent = infer
  // from the tracks at Generate time (the pre-C3 rule, shown as "Auto").
  assetType?: 'sfx' | 'music';
  // Instrument output level (0..1). The serializer floors it at 0.001 —
  // the backend treats an exact 0 as "absent, default to unity".
  volume?: number;
  voiceCount: number;
  voiceStealing: 'oldest' | 'newest';
  glide: number;
  unison: number;
  detune: number;
  inputs: string[];
  outputs: string[];
  subgraph: {
    nodes: SkaldGraphNode[];
    connections: SkaldGraphConnection[];
  };
}

// === Union Type for All Node Parameters ===

/**
 * @type NodeParams
 * A union of all possible node parameter types. This is the primary type
 * used for node data objects throughout the application.
 */
export type NodeParams =
  | FmOperatorParams
  | WavetableParams
  | SampleHoldParams
  | LfoParams
  | OscillatorParams
  | FilterParams
  | NoiseParams
  | AdsrParams
  | DelayParams
  | ReverbParams
  | DistortionParams
  | MixerParams
  | PannerParams
  | GainParams
  | OutputParams
  | MidiInputParams
  | MapperParams
  | InstrumentParams;

// === Sequencer Types ===

/**
 * @interface NoteEvent
 * Represents a single musical event (note on) in the sequencer.
 */
export interface NoteEvent {
  step: number;       // 0-15 (for a 1-bar loop initially)
  note: number;       // MIDI Note Number (e.g., 60 for C4)
  velocity: number;   // 0.0 to 1.0
  duration: number;   // In steps (defaults to 1)
  probability?: number; // 0.0 to 1.0, chance to play. Default 1.0 (100%)
  /**
   * "<NodeLabel>:<param>" -> per-step override value.
   *
   * `unknown`, not `number`: the step editor's controls write whatever the
   * parameter holds, so a waveform string or a BPM-Sync boolean really can be
   * in here (SKB-045) — projectSerializer then drops it, because the generated
   * per-step setter takes an f32. Declaring `number` made the value look
   * pre-validated and made `isExportablePlockValue` look like dead code, while
   * every write site went through an `any` and stored the string anyway.
   */
  patchOverrides?: Record<string, unknown>;
}

/**
 * @interface SequencerTrack
 * Represents a track dedicated to controlling one Instrument Node.
 */
export interface SequencerTrack {
  id: string;             // Unique ID (UUID)
  targetNodeId: string;   // The ID of the Instrument Node in the ReactFlow graph
  name: string;           // Display name (synced with Instrument label)
  color: string;          // Visual color
  steps: number;          // Total step count (default 16)
  notes: NoteEvent[];     // Array of active notes
  isMuted: boolean;
  isSolo: boolean;
  /**
   * F4: which editor "Edit" opens for this track — the chromatic Piano Roll
   * or the one-row Drum Roll. Editor-only: `projectSerializer` never reads it
   * and the generated code is byte-identical either way, because both editors
   * write the same `NoteEvent` shape.
   *
   * Absent ⇒ 'auto' (components/Sequencer/trackViewMode.ts::storedViewMode),
   * which is why adding this field owes no save migration: every track saved
   * before F4 keeps behaving exactly as the detection says it should.
   */
  viewMode?: 'melodic' | 'percussive' | 'auto';
  /**
   * F2: the MIDI note a new hit painted in the Drum Roll is written at. A row
   * with no pitch axis still has to name one, because (step, pitch) is the
   * address Step Properties, Export Step and the de-duplicator all use.
   *
   * Editor-only and optional; absent is resolved from the track's own notes,
   * then the GM drum map, then middle C
   * (components/Sequencer/drumKit.ts::canonicalDrumPitch). Round-trips raw for
   * the same reason `viewMode` does, and owes no migration for the same reason.
   */
  defaultNote?: number;
}

/**
 * @interface SequencerState
 * The root state object for the sequencer.
 */
export interface SequencerState {
  isPlaying: boolean;
  currentStep: number;    // The current playback step (0-15)
  tracks: SequencerTrack[];
}
