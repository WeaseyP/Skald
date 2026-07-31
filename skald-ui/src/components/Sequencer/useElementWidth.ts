/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/useElementWidth.ts                   |
|                                                                              |
| Reports the live pixel width of an element, so the step grid can size its    |
| cells to the space it actually has rather than a hard-coded guess.           |
================================================================================
*/
import { RefObject, useEffect, useRef, useState } from 'react';

/**
 * `[ref, width]` — attach the ref to the element to measure. Width is 0 until
 * the first measurement; callers treat 0 as "not measured yet".
 *
 * jsdom has no ResizeObserver, so this falls back to window resize events and
 * an initial read instead of throwing in tests.
 */
export const useElementWidth = <T extends HTMLElement>(
    externalRef?: RefObject<T | null>,
): [RefObject<T | null>, number] => {
    const ownRef = useRef<T | null>(null);
    const ref = externalRef ?? ownRef;
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const measure = () => setWidth(el.clientWidth);
        measure();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }

        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);

    return [ref, width];
};
