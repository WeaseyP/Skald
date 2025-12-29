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
}

export interface WavetableParams extends BaseNodeParams {
  tableName: 'Sine' | 'Triangle' | 'Sawtooth' | 'Square';
  frequency: number;
  position: number;
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

export type AdsrCurve = 'linear' | 'exponential';
export interface AdsrParams extends BaseNodeParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  depth: number;
  velocitySensitivity: number;
  attackCurve: AdsrCurve;
  decayCurve: AdsrCurve;
  releaseCurve: AdsrCurve;
  loop?: boolean;
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
}

export interface DistortionParams extends BaseNodeParams {
  drive: number;
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
}

export interface OutputParams extends BaseNodeParams {
  lastTrigger?: number;
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
