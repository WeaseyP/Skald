/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/editorSnapshot.ts                        |
|                                                                              |
| The shape of ONE undo step, and the contract every editor hook talks to.     |
|                                                                              |
| SKB-008 / packet B3. The editor used to keep two independent undo stacks —   |
| one for {nodes, edges} in useGraphState (capped at 50) and one for tracks in |
| useSequencerState (uncapped) — and popped BOTH on one Ctrl+Z. Two stacks     |
| that grow at different rates and are trimmed by different rules cannot stay  |
| in step, so after the 51st graph edit one keystroke pulled graph entry N and  |
| sequencer entry N+k: a state the user never authored. Transport settings      |
| (bpm / pattern length / master volume) were in neither stack at all.          |
|                                                                              |
| So: ONE ordered history of {nodes, edges, tracks, session} snapshots, behind |
| a single labelled `pushHistory`. Every hook that owns a slice of the document|
| registers its slice through HistoryIO; nothing else keeps an undo stack.     |
================================================================================
*/
import { Node, Edge } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import { NoteName, ScaleName } from '../../contexts/ScaleContext';

// Song-level settings that live outside the graph/tracks but shape how the
// project sounds and exports. They are part of the undo document (F-B01-9:
// changing BPM used to be unundoable) and part of the save file.
//
// packageName (SKB-036 / F-B06-11): the export package name, e.g. so a save
// authored against `my_game_audio` doesn't reload as `generated_audio`. Its
// absence on read is treated as the current default, same as the other fields
// here — this is a value carried through an existing free-form block, not a
// schema change, so it needs no migration (roadmap §4 constraint 4).
// G3 (roadmap 9.5): the key/scale ScaleContext has always quantized notes
// with, now saved with the project instead of resetting to Chromatic/C on
// every reload. Additive and backward-compatible exactly like packageName
// above — an older save simply lacks the keys, and absence already means
// the same defaults ScaleProvider used to hardcode, so no migration or
// version bump is needed (see saveMigrations.ts's 3->4 pattern for what
// WOULD require one: a default that changes what an existing file sounds
// like, which this is not).
export interface SessionSettings {
    bpm: number;
    patternSteps: number;
    masterVolume: number;
    packageName: string;
    rootNote: NoteName;
    scaleName: ScaleName;
}

/** The whole undoable document. One history entry holds exactly one of these. */
export interface EditorSnapshot {
    nodes: Node<NodeParams>[];
    edges: Edge[];
    tracks: SequencerTrack[];
    session: SessionSettings;
}

/**
 * A history entry holds the document as it was BEFORE the edit named by
 * `label`, plus a monotonic id. The id is what lets a save point be identified
 * again after undo/redo shuffle the stacks (the B4 dirty-flag seam below).
 */
export interface HistoryEntry {
    id: number;
    label: string;
    snapshot: EditorSnapshot;
}

/**
 * Gesture-scoped coalescing (replaces the old 500 ms wall-clock window, which
 * merged unrelated edits inside the window and split any drag that lasted
 * longer than it — F-B07-9).
 *
 * `gesture` is a key identifying *what is being manipulated*: target + field,
 * e.g. `param:node7:cutoff` or `move:node7`. Repeated pushes with the same key
 * while that gesture is open are folded into the entry the gesture opened with.
 * Two different keys never merge, no matter how fast they arrive.
 *
 * A gesture closes when:
 *   - `endGesture()` is called (node drags do this on the `dragging:false` tick),
 *   - a push arrives with a different key or no key,
 *   - `scope: 'tick'` and the current task ends (used to fold one user action
 *     that arrives as several change callbacks — deleting a node also deletes
 *     its wires — into a single entry), or
 *   - `scope: 'idle'` (the default) and GESTURE_IDLE_MS passes with no further
 *     push for that key. This is an *idle* window, not a duration cap: a drag
 *     that lasts ten seconds keeps one entry as long as its ticks keep coming.
 */
export interface PushOptions {
    gesture?: string;
    scope?: 'idle' | 'tick';
}

export type PushHistory = (label: string, options?: PushOptions) => void;

/** How the composed editor state exposes its document to the history. */
export interface HistoryIO {
    capture: () => EditorSnapshot;
    restore: (snapshot: EditorSnapshot) => void;
}

export interface EditorHistoryApi {
    /** Record the document as it is NOW, labelled with the edit about to happen. */
    pushHistory: PushHistory;
    /** Close the open gesture (a drag ending), so the next push starts a new entry. */
    endGesture: (gesture?: string) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    /** Drop both stacks — used when Load replaces the whole document. */
    resetHistory: () => void;
    connect: (io: HistoryIO) => void;

    canUndo: boolean;
    canRedo: boolean;
    /** Real stack depths, for the toolbar buttons. */
    undoDepth: number;
    redoDepth: number;
    /** Label of the edit the next Undo/Redo would apply, for the button titles. */
    undoLabel: string | null;
    redoLabel: string | null;
    /** Oldest→newest labels. Lets a test assert WHICH gesture was recorded. */
    undoLabels: string[];
    redoLabels: string[];

    // ---- Seams for packet B4 (dirty flag / confirm-on-Load / autosave) ----
    // B3 deliberately stops here: it exposes the state B4 needs and implements
    // none of B4's behaviour (no confirm dialog, no window title, no autosave).
    /** True when the document differs from the last markSaved()/resetHistory(). */
    isDirty: boolean;
    /** Number of history entries pushed since the last save point. */
    editsSinceSave: number;
    /** Call after a successful Save: the current document becomes the clean point. */
    markSaved: () => void;
    /** The whole document, for an autosave/recovery writer. Null before connect. */
    captureSnapshot: () => EditorSnapshot | null;
}

/**
 * One cap for one stack. The graph stack was capped at 50 and the sequencer
 * stack was uncapped, which is what made the two diverge; the number matters
 * far less than there being exactly one of it. Snapshots share structure with
 * live state (every writer replaces arrays immutably), so an entry costs a few
 * pointers, not a deep clone.
 */
export const HISTORY_LIMIT = 100;

/** Idle window that closes a continuous-input gesture. See PushOptions. */
export const GESTURE_IDLE_MS = 700;
