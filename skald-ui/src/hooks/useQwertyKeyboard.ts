/*
================================================================================
| FILE: skald-ui/src/hooks/useQwertyKeyboard.ts                                |
|                                                                              |
| The computer keyboard as a one-octave MIDI keyboard (roadmap E1, §9.7).      |
|                                                                              |
| Before this, hearing a timbre meant sequencing a note step for it: place a   |
| note, press Play, listen, stop, change a knob, repeat. The preview engine    |
| already accepted live notes — the Web MIDI listener in useWasmAudioEngine    |
| has been feeding it note-on/note-off for as long as it has existed — but     |
| only from hardware nobody is guaranteed to own.                              |
================================================================================
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '../utils/keyboardTarget';

/**
 * Semitones above the base octave's C, by key. The Ableton/Live layout, which
 * is the one most sound designers already have in their fingers: the home row
 * is the white keys and the row above holds the black keys over their gaps.
 *
 * There is deliberately only ONE octave here. The obvious second row (Q 2 W 3
 * E…) is the layout used by hosts that put the black keys on the number row,
 * and it collides with this one on W, E, T, Y and U — the same physical keys
 * would have to be two different notes. One unambiguous octave plus Z/X to
 * move it is the version that cannot mis-fire.
 */
export const QWERTY_SEMITONES: Readonly<Record<string, number>> = {
    a: 0,  // C
    w: 1,  // C#
    s: 2,  // D
    e: 3,  // D#
    d: 4,  // E
    f: 5,  // F
    t: 6,  // F#
    g: 7,  // G
    y: 8,  // G#
    h: 9,  // A
    u: 10, // A#
    j: 11, // B
    k: 12, // C, one octave up
};

export const OCTAVE_DOWN_KEY = 'z';
export const OCTAVE_UP_KEY = 'x';

/** `a` at this octave is MIDI 60 — the same middle C the piano roll labels C4. */
export const DEFAULT_BASE_OCTAVE = 4;

/**
 * Octave 8's top key (C8 + 12 semitones) is MIDI 120 and octave -1's bottom key
 * is MIDI 0, so every key of every reachable octave is a legal note number.
 * Clamping the octave rather than the note keeps the mapping injective: two
 * keys clamped to the same note would send one note-off for two note-ons.
 */
export const MIN_BASE_OCTAVE = -1;
export const MAX_BASE_OCTAVE = 8;

/**
 * Every asset, matching what the Web MIDI listener addresses
 * (`sendNoteOn(-1, …)` in useWasmAudioEngine). A QWERTY keyboard that played a
 * different set of instruments from a MIDI keyboard would make the two
 * disagree about what "audition" means, and re-deriving a concrete asset list
 * here would break the moment a rebuild changed the asset count.
 */
export const QWERTY_ASSET = -1;

/** No velocity sensitivity on a computer keyboard; a firm-but-not-full press. */
export const QWERTY_VELOCITY = 0.8;

const MIDI_NOTE_MIN = 0;
const MIDI_NOTE_MAX = 127;

/** MIDI note number for a semitone offset above the given octave's C. */
export const midiForOctave = (octave: number, semitone: number): number =>
    (octave + 1) * 12 + semitone;

export interface QwertyKeyboardOptions {
    /** True while the preview engine is running and can actually make sound. */
    enabled: boolean;
    sendNoteOn: (asset: number, note: number, velocity: number, duration: number) => void;
    sendNoteOff: (asset: number, note: number) => void;
    /** The live scale quantiser, so QWERTY and a MIDI keyboard agree. */
    nearestInScale: (note: number) => number;
}

export interface QwertyKeyboardState {
    /** Base octave; the `a` key plays this octave's C. */
    octave: number;
    /** MIDI notes currently sounding from held keys, in the order pressed. */
    activeNotes: number[];
    /**
     * A note key was pressed with the preview stopped. Drives the "press Play"
     * hint; see the note on `enabled` below for why this asks rather than acts.
     */
    needsPreview: boolean;
}

export const useQwertyKeyboard = ({
    enabled,
    sendNoteOn,
    sendNoteOff,
    nearestInScale,
}: QwertyKeyboardOptions): QwertyKeyboardState => {
    const [octave, setOctave] = useState(DEFAULT_BASE_OCTAVE);
    const [activeNotes, setActiveNotes] = useState<number[]>([]);
    const [needsPreview, setNeedsPreview] = useState(false);

    // Physical key → the note number that was actually SENT for it. Keyup must
    // release that number and not re-derive one: `nearestInScale` closes over a
    // live context value, so changing the scale between press and release would
    // otherwise name a note the module never started and leave the real voice
    // sounding with nothing left holding a reference to it. (The MIDI listener
    // has the same exposure and answers it by re-quantising identically; here
    // remembering is both cheaper and exact.)
    const heldKeys = useRef<Map<string, number>>(new Map());

    // Read through refs inside the window listener so the listener can be
    // installed once. Re-subscribing on every octave change or every rebuild of
    // the quantiser would drop keydowns that arrive during the swap, and a lost
    // keydown is merely a missing note — a lost keyup is a stuck voice.
    const latest = useRef({ enabled, sendNoteOn, sendNoteOff, nearestInScale, octave });
    latest.current = { enabled, sendNoteOn, sendNoteOff, nearestInScale, octave };

    const releaseAll = useCallback(() => {
        const { sendNoteOff: off } = latest.current;
        for (const note of heldKeys.current.values()) off(QWERTY_ASSET, note);
        heldKeys.current.clear();
        setActiveNotes([]);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // A chord belongs to whoever owns the chord: Ctrl+Z is undo, and
            // `z` alone is octave-down. Alt is left alone too — it is the
            // system menu accelerator on Windows and the note grid's
            // probability modifier in the sequencer.
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;

            const key = e.key.toLowerCase();

            if (key === OCTAVE_DOWN_KEY || key === OCTAVE_UP_KEY) {
                // Held keys keep the note they were sent with, so a shift
                // mid-chord transposes what comes next and never orphans what
                // is already sounding.
                if (e.repeat) return;
                e.preventDefault();
                setOctave(o => Math.min(MAX_BASE_OCTAVE, Math.max(MIN_BASE_OCTAVE,
                    o + (key === OCTAVE_UP_KEY ? 1 : -1))));
                return;
            }

            const semitone = QWERTY_SEMITONES[key];
            if (semitone === undefined) return;

            // Auto-repeat fires a keydown every few tens of milliseconds for as
            // long as the key is down, and exactly ONE keyup at the end. Both
            // guards are needed: `e.repeat` is the cheap one, and the held set
            // is the one that still holds when a platform does not set it.
            if (e.repeat || heldKeys.current.has(key)) return;
            e.preventDefault();

            const { enabled: live, sendNoteOn: on, nearestInScale: quantise } = latest.current;
            if (!live) {
                // Deliberately does NOT start the preview. Play starts the
                // transport as well as the engine, so a keypress that started
                // it would launch the whole sequenced pattern underneath the
                // note the user wanted to audition — far more surprising than
                // silence. The Play button is one click away in the sidebar;
                // this only points at it.
                setNeedsPreview(true);
                return;
            }

            const raw = midiForOctave(latest.current.octave, semitone);
            const note = Math.max(MIDI_NOTE_MIN, Math.min(MIDI_NOTE_MAX, Math.round(quantise(raw))));
            heldKeys.current.set(key, note);
            // duration 0 = sustaining. sendNoteOn only records a note as held
            // (and so only replays it across a hot-swap, SKB-023) when the
            // duration is zero; a one-shot would release itself mid-key.
            on(QWERTY_ASSET, note, QWERTY_VELOCITY, 0);
            setActiveNotes([...heldKeys.current.values()]);
        };

        const onKeyUp = (e: KeyboardEvent) => {
            // No modifier or typing guard on the way UP. A key pressed as a
            // note and released after the user happened to touch Ctrl — or
            // after focus moved into a text field — still has to be released,
            // or the guard itself becomes the thing that strands the voice.
            const key = e.key.toLowerCase();
            const note = heldKeys.current.get(key);
            if (note === undefined) return;
            heldKeys.current.delete(key);
            latest.current.sendNoteOff(QWERTY_ASSET, note);
            setActiveNotes([...heldKeys.current.values()]);
        };

        // Alt+Tab, a click into the dev tools, a dragged window: the keyup for
        // whatever was down is delivered to someone else, and without this the
        // voice sustains until the user finds the same key again.
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', releaseAll);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', releaseAll);
            releaseAll();
        };
    }, [releaseAll]);

    useEffect(() => {
        if (enabled) {
            setNeedsPreview(false);
        } else {
            // Stop tears the worklet down; anything still tracked here would be
            // a phantom the on-screen readout kept insisting was sounding.
            releaseAll();
        }
    }, [enabled, releaseAll]);

    return { octave, activeNotes, needsPreview };
};
