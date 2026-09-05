// @vitest-environment jsdom
//
// Roadmap E1 (§9.7 item 1) — "no more sequencing just to hear a sound".
//
// Auditioning from the computer keyboard is only useful if it cannot leave a
// voice ringing. The failure modes this pins are all note-off failures rather
// than note-on ones: a held key that auto-repeats would fire a fresh note-on
// every ~30 ms with only one note-off to close them; a key still down when the
// window loses focus never sees its keyup at all; and a scale change between
// press and release would compute a DIFFERENT note number for the note-off
// than the one that was sent, which is how the MIDI path (useWasmAudioEngine's
// listener) has to re-quantise on the way out to stay matched.
//
// It also pins the two guards that decide whether a letter is a note at all:
// typing in an input must stay typing, and a Ctrl/Cmd chord must stay a
// chord — `z` and `x` are the octave keys, and Ctrl+Z is undo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
    useQwertyKeyboard,
    QWERTY_SEMITONES,
    QWERTY_ASSET,
    QWERTY_VELOCITY,
    DEFAULT_BASE_OCTAVE,
    MIN_BASE_OCTAVE,
    MAX_BASE_OCTAVE,
    midiForOctave,
} from '../../hooks/useQwertyKeyboard';

const identity = (n: number) => n;

const makeHarness = (overrides: Partial<Parameters<typeof useQwertyKeyboard>[0]> = {}) => {
    const sendNoteOn = vi.fn();
    const sendNoteOff = vi.fn();
    const options = {
        enabled: true,
        sendNoteOn,
        sendNoteOff,
        nearestInScale: identity,
        ...overrides,
    };
    const view = renderHook((props: typeof options) => useQwertyKeyboard(props), {
        initialProps: options,
    });
    return { sendNoteOn, sendNoteOff, options, ...view };
};

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    });
};

const release = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
    });
};

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
});

describe('useQwertyKeyboard — E1 live auditioning', () => {
    it('maps the home row to one chromatic octave from the base, A = middle C', () => {
        expect(midiForOctave(DEFAULT_BASE_OCTAVE, QWERTY_SEMITONES.a)).toBe(60);
        expect(midiForOctave(DEFAULT_BASE_OCTAVE, QWERTY_SEMITONES.k)).toBe(72);
        // The thirteen keys are C..C with no gaps and no repeats.
        const semitones = Object.values(QWERTY_SEMITONES).sort((a, b) => a - b);
        expect(semitones).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('sends a sustaining note-on on keydown and the matching note-off on keyup', () => {
        const { sendNoteOn, sendNoteOff } = makeHarness();

        press('a');
        expect(sendNoteOn).toHaveBeenCalledTimes(1);
        // duration 0 = held. A one-shot duration would release itself and, per
        // sendNoteOn's own contract, never be recorded as held at all.
        expect(sendNoteOn).toHaveBeenCalledWith(QWERTY_ASSET, 60, QWERTY_VELOCITY, 0);

        release('a');
        expect(sendNoteOff).toHaveBeenCalledTimes(1);
        expect(sendNoteOff).toHaveBeenCalledWith(QWERTY_ASSET, 60);
    });

    it('ignores the auto-repeat storm a held key produces', () => {
        const { sendNoteOn } = makeHarness();

        press('a');
        press('a', { repeat: true });
        press('a', { repeat: true });
        expect(sendNoteOn).toHaveBeenCalledTimes(1);
    });

    it('ignores a second keydown for a key it already believes is down', () => {
        // Chrome fires no repeat flag for some IME/remote-desktop paths; the
        // held set, not `e.repeat` alone, is what makes a second note-on
        // impossible.
        const { sendNoteOn } = makeHarness();
        press('a');
        press('a');
        expect(sendNoteOn).toHaveBeenCalledTimes(1);
    });

    it('leaves typing alone: an input, a textarea and a contenteditable are never notes', () => {
        const { sendNoteOn } = makeHarness();

        const input = document.createElement('input');
        const textarea = document.createElement('textarea');
        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'true');
        document.body.append(input, textarea, editable);

        press('a', {}, input);
        press('a', {}, textarea);
        press('a', {}, editable);
        expect(sendNoteOn).not.toHaveBeenCalled();
    });

    it('leaves Ctrl/Cmd chords alone so Ctrl+Z is still undo, not an octave shift', () => {
        const { sendNoteOn, result } = makeHarness();

        press('z', { ctrlKey: true });
        press('z', { metaKey: true });
        press('a', { ctrlKey: true });
        expect(sendNoteOn).not.toHaveBeenCalled();
        expect(result.current.octave).toBe(DEFAULT_BASE_OCTAVE);
    });

    it('shifts the octave with Z and X, and clamps so no key can leave the MIDI range', () => {
        const { sendNoteOn, result } = makeHarness();

        press('x');
        expect(result.current.octave).toBe(DEFAULT_BASE_OCTAVE + 1);
        press('a');
        expect(sendNoteOn).toHaveBeenLastCalledWith(QWERTY_ASSET, 72, QWERTY_VELOCITY, 0);
        release('a');

        press('z');
        press('z');
        expect(result.current.octave).toBe(DEFAULT_BASE_OCTAVE - 1);
        press('a');
        expect(sendNoteOn).toHaveBeenLastCalledWith(QWERTY_ASSET, 48, QWERTY_VELOCITY, 0);
        release('a');

        for (let i = 0; i < 20; i += 1) press('z');
        expect(result.current.octave).toBe(MIN_BASE_OCTAVE);
        for (let i = 0; i < 40; i += 1) press('x');
        expect(result.current.octave).toBe(MAX_BASE_OCTAVE);
        // The clamp exists so the top key of the top octave is still a legal
        // MIDI note: C8 + 12 semitones = 120, inside 0..127.
        press('k');
        expect(sendNoteOn).toHaveBeenLastCalledWith(QWERTY_ASSET, 120, QWERTY_VELOCITY, 0);
    });

    it('releases the note number it actually sent, even after the scale changed under it', () => {
        // The quantiser is a live context value. If keyup re-derived the note
        // from the CURRENT scale it would name a note the module never
        // started, leaving the real one sounding forever.
        const { sendNoteOn, sendNoteOff, rerender, options } = makeHarness({
            nearestInScale: (n: number) => n,
        });

        press('w'); // C#4 = 61, unquantised
        expect(sendNoteOn).toHaveBeenCalledWith(QWERTY_ASSET, 61, QWERTY_VELOCITY, 0);

        rerender({ ...options, nearestInScale: (n: number) => (n === 61 ? 60 : n) });
        release('w');
        expect(sendNoteOff).toHaveBeenCalledWith(QWERTY_ASSET, 61);
    });

    it('quantises through nearestInScale so QWERTY and a MIDI keyboard agree', () => {
        const { sendNoteOn } = makeHarness({ nearestInScale: (n: number) => (n === 61 ? 60 : n) });
        press('w');
        expect(sendNoteOn).toHaveBeenCalledWith(QWERTY_ASSET, 60, QWERTY_VELOCITY, 0);
    });

    it('releases every held note when the window loses focus', () => {
        const { sendNoteOff, result } = makeHarness();

        press('a');
        press('e');
        press('g');
        expect(result.current.activeNotes).toEqual([60, 63, 67]);

        act(() => { window.dispatchEvent(new Event('blur')); });

        expect(sendNoteOff.mock.calls.map(c => c[1]).sort((a, b) => a - b)).toEqual([60, 63, 67]);
        expect(result.current.activeNotes).toEqual([]);
    });

    it('releases every held note when the preview is stopped mid-chord', () => {
        const { sendNoteOff, rerender, options } = makeHarness();

        press('a');
        press('e');
        rerender({ ...options, enabled: false });

        expect(sendNoteOff.mock.calls.map(c => c[1]).sort((a, b) => a - b)).toEqual([60, 63]);
    });

    it('asks for Play instead of starting it, and stops asking once the preview runs', () => {
        const { sendNoteOn, result, rerender, options } = makeHarness({ enabled: false });

        press('a');
        expect(sendNoteOn).not.toHaveBeenCalled();
        expect(result.current.needsPreview).toBe(true);

        rerender({ ...options, enabled: true });
        expect(result.current.needsPreview).toBe(false);
    });

    it('stops listening once unmounted', () => {
        const { sendNoteOn, unmount } = makeHarness();
        unmount();
        press('a');
        expect(sendNoteOn).not.toHaveBeenCalled();
    });
});
