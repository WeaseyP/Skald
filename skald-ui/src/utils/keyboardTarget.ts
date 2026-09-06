/*
================================================================================
| FILE: skald-ui/src/utils/keyboardTarget.ts                                   |
|                                                                              |
| "Is this keystroke the user typing, or the user reaching for a shortcut?"    |
================================================================================
*/

/**
 * True when a keyboard event originated inside something the user is typing
 * into, and a window-level shortcut must therefore keep its hands off.
 *
 * Every global handler in the editor needs this answer, and each one used to
 * answer it for itself with an inline `['INPUT', 'TEXTAREA'].includes(tagName)`
 * — which misses a `<select>` (where letter keys jump to an option) and misses
 * `contenteditable` entirely. That mattered the moment letters became notes
 * (roadmap E1): a name field that swallowed `a` in one handler and played a
 * middle C in another is the same class of divergence as two readers of any
 * other rule, so there is one reader of this one.
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element || typeof element.tagName !== 'string') return false;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return true;
    // `isContentEditable` is undefined on elements jsdom has not attached, so
    // the attribute is the fallback rather than the primary test.
    return element.isContentEditable === true || element.getAttribute?.('contenteditable') === 'true';
};
