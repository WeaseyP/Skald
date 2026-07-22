// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';

describe('NodeParameterControls ADSR manual controls', () => {
    it('renders wrapped A/D/S/R number inputs and writes exact values', () => {
        const onChange = vi.fn();
        const wrappedKeys: string[] = [];

        render(
            <NodeParameterControls
                node={{
                    id: 'adsr-1',
                    type: 'adsr',
                    position: { x: 0, y: 0 },
                    data: {
                        attack: 0.1,
                        decay: 0.2,
                        sustain: 0.5,
                        release: 1,
                        depth: 1,
                        velocitySensitivity: 0.5,
                    },
                }}
                onChange={onChange}
                renderControlWrapper={(paramKey, label, control) => {
                    wrappedKeys.push(paramKey);
                    return <label key={paramKey}>{label}{control}</label>;
                }}
            />
        );

        expect(wrappedKeys).toEqual([
            'attack',
            'decay',
            'sustain',
            'release',
            'depth',
            'velocitySensitivity',
        ]);

        fireEvent.change(screen.getByLabelText('Attack (s)'), { target: { value: '0.008' } });
        fireEvent.change(screen.getByLabelText('Decay (s)'), { target: { value: '0.125' } });
        fireEvent.change(screen.getByLabelText('Sustain'), { target: { value: '0.85' } });
        fireEvent.change(screen.getByLabelText('Release (s)'), { target: { value: '0.18' } });

        expect(onChange).toHaveBeenCalledWith('attack', 0.008);
        expect(onChange).toHaveBeenCalledWith('decay', 0.125);
        expect(onChange).toHaveBeenCalledWith('sustain', 0.85);
        expect(onChange).toHaveBeenCalledWith('release', 0.18);
    });
});
