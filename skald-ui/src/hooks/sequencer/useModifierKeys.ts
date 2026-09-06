/*
================================================================================
| FILE: skald-ui/src/hooks/sequencer/useModifierKeys.ts                        |
|                                                                              |
| Live Ctrl/Shift/Alt state while the sequencer dock has focus, for a cursor   |
| hint on the note a modifier-drag would grab (StepGrid: Shift=duration,      |
| Ctrl=velocity, Alt=probability). Lived only in StepGrid.tsx; extracted so a  |
| third reader (roadmap F1's drum roll) does not have to copy the four         |
| window listeners a third time.                                              |
================================================================================
*/
import { useEffect, useState } from 'react';

export interface ModifierKeys {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
}

const NONE: ModifierKeys = { ctrl: false, shift: false, alt: false };

export const useModifierKeys = (): ModifierKeys => {
    const [modifiers, setModifiers] = useState<ModifierKeys>(NONE);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: true }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: true }));
            if (e.key === 'Alt') setModifiers(prev => ({ ...prev, alt: true }));
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: false }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: false }));
            if (e.key === 'Alt') setModifiers(prev => ({ ...prev, alt: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return modifiers;
};
