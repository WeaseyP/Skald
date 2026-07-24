import React, { useState, useEffect, useCallback } from 'react';

// --- STYLES ---

const containerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
};

const sliderStyles: React.CSSProperties = {
    flexGrow: 1,
    marginRight: '10px',
    accentColor: '#3182CE',
};

const numberInputStyles: React.CSSProperties = {
    width: '70px',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    outline: 'none',
    textAlign: 'right',
};

// --- PROPS INTERFACE ---

interface CustomSliderProps {
    min: number;
    max: number;
    value: number;
    onChange: (newValue: number) => void;
    scale?: 'log' | 'linear';
    step?: number;
    defaultValue?: number;
    onReset?: () => void;
    exponent?: number;
    className?: string; // Allow className to be passed
}

// --- HELPER FUNCTIONS for scaling ---

const toLogValue = (position: number, min: number, max: number) => {
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / 100;
    return Math.exp(minLog + scale * position);
};

const fromLogValue = (value: number, min: number, max: number) => {
    if (value <= 0) return 0; // Avoid log(0)
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / 100;
    return (Math.log(value) - minLog) / scale;
};

// --- MAIN COMPONENT ---

export const CustomSlider: React.FC<CustomSliderProps> = ({
    min,
    max,
    value,
    onChange,
    scale = 'linear',
    step = 0.01,
    defaultValue = 0,
    onReset,
}) => {
    // Internal state for immediate UI feedback
    const [localValue, setLocalValue] = useState(value);
    // Separate state for the text input to allow temporary invalid strings
    const [textValue, setTextValue] = useState(value.toString());

    // Sync local state if the incoming prop changes
    useEffect(() => {
        setLocalValue(value);
        setTextValue(value.toString());
    }, [value]);

    const getSliderPosition = useCallback(() => {
        if (scale === 'log') return fromLogValue(localValue, min, max);
        return ((localValue - min) / (max - min)) * 100;
    }, [localValue, min, max, scale]);

    // Snap a committed value onto the control's `step` grid, anchored at `min`,
    // then clamp. Integer controls (step === 1) therefore commit only whole
    // numbers; fractional controls land on clean multiples of their step rather
    // than the floating-point noise a raw pointer position produces. This is the
    // fix for BUG-INTEGER-CONTROLS-EMIT-FLOATS: a 1..32 Voice Count slider at
    // pointer position 52.1% used to commit 1 + 31 * 0.521 = 17.151, which the
    // Odin backend refuses to unmarshal into an `int` field.
    const quantizeToStep = useCallback((raw: number): number => {
        if (!Number.isFinite(raw)) return raw;
        if (!Number.isFinite(step) || step <= 0) return Math.max(min, Math.min(max, raw));
        const snapped = Math.round((raw - min) / step) * step + min;
        const clamped = Math.max(min, Math.min(max, snapped));
        // Strip binary FP dust from the divide/multiply so integer steps yield
        // exact integers and fractional steps keep only their own precision.
        const decimals = (String(step).split('.')[1] ?? '').length;
        return parseFloat(clamped.toFixed(Math.min(decimals, 12)));
    }, [min, max, step]);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPosition = parseFloat(e.target.value);
        let newValue: number;
        if (scale === 'log') {
            newValue = toLogValue(newPosition, min, max);
        } else {
            newValue = min + (max - min) * (newPosition / 100);
        }
        // Quantize to `step` (and clamp) so pointer drags commit only on-grid
        // values — an integer control must never emit a fractional value.
        const finalValue = quantizeToStep(newValue);

        setLocalValue(finalValue);
        setTextValue(finalValue.toString());
        onChange(finalValue);
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTextValue(e.target.value);
    };

    const handleInputBlur = () => {
        let parsed = parseFloat(textValue);
        if (textValue.toLowerCase().includes('k')) {
            parsed = parseFloat(textValue.replace(/k/i, '')) * 1000;
        }

        if (isNaN(parsed)) {
            setLocalValue(defaultValue);
            setTextValue(defaultValue.toString());
            onChange(defaultValue);
        } else {
            // Quantize to `step` (and clamp) so a typed value like "17.151"
            // commits as a whole, on-grid value for integer controls.
            const finalValue = quantizeToStep(parsed);
            setLocalValue(finalValue);
            setTextValue(finalValue.toString());
            onChange(finalValue);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleInputBlur();
            (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            // Nudge by whole `step` units (Shift = x10 coarse jump) and re-snap
            // to the grid. Sub-step nudging is intentionally gone: an integer
            // control must not drift to a fractional value via the arrow keys.
            const magnitude = step * (e.shiftKey ? 10 : 1);
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            const finalValue = quantizeToStep(localValue + magnitude * direction);

            setLocalValue(finalValue);
            setTextValue(finalValue.toString());
            onChange(finalValue);
        }
    };

    // Plain double-click resets — the DAW convention. (The old version
    // demanded Ctrl/Cmd AND never propagated the reset value through
    // onChange, so even when triggered it didn't actually reset the param.)
    const handleDoubleClick = () => {
        setLocalValue(defaultValue);
        setTextValue(defaultValue.toString());
        onChange(defaultValue);
        onReset?.();
    };

    return (
        <div style={containerStyles} title="Double-click to reset">
            <input
                type="range"
                min="0"
                max="100"
                value={getSliderPosition()}
                onChange={handleSliderChange}
                onDoubleClick={handleDoubleClick}
                style={sliderStyles}
                step="0.1" // Finer control on the range input itself
            />
            <input
                type="text"
                value={textValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                style={numberInputStyles}
            />
        </div>
    );
};

