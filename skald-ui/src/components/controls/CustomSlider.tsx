import React, { useState, useEffect, useCallback } from 'react';
import { formatDisplayValue } from '../../utils/formatDisplayValue';

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
    // Bends the slider travel without changing the stored value's meaning:
    //   value    = min + (max - min) * (position/100) ** exponent
    //   position = 100 * ((value - min) / (max - min)) ** (1/exponent)
    // 1 (the default) is exactly the old linear mapping. >1 expands the bottom
    // of the range, which is what a parameter whose musical values sit in the
    // first few percent of a wide linear range needs (Mod Index: 0–1000, useful
    // under ~10). Unlike `scale: 'log'` this works when `min` is 0, so 0 stays
    // reachable at the left stop. Ignored when `scale === 'log'`.
    exponent?: number;
    className?: string; // Allow className to be passed
    // Snap TYPED commits (text blur / Enter) onto the `step` grid. Set for
    // integer-contract params (Voice Count, Unison, ...) so a typed "17.151"
    // commits as 17 — mirrors NumberInput's `quantize` prop. Fractional
    // controls leave this off so precise typed input is preserved exactly
    // (clamped to min/max only). Pointer drags and arrow keys always snap
    // to the step grid regardless — "drag to explore, type to land".
    quantize?: boolean;
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

// Power-law (a.k.a. "audio taper") mapping between the 0..100 range input
// position and the parameter value. exponent === 1 collapses to the plain
// linear mapping, so it is bit-identical for every control that doesn't opt in.
const toTaperedValue = (position: number, min: number, max: number, exponent: number) =>
    min + (max - min) * Math.pow(position / 100, exponent);

const fromTaperedValue = (value: number, min: number, max: number, exponent: number) => {
    if (max === min) return 0;
    const normalized = (value - min) / (max - min);
    if (!(normalized > 0)) return 0; // at/below min, or NaN
    return 100 * Math.pow(Math.min(normalized, 1), 1 / exponent);
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
    exponent = 1,
    quantize = false,
}) => {
    // Internal state for immediate UI feedback
    const [localValue, setLocalValue] = useState(value);
    // Separate state for the text input to allow temporary invalid strings.
    // Displayed text is rounded to at most 2dp (BUG-PARAM-DISPLAY-PRECISION)
    // — display only; `localValue`/`onChange` always carry the exact number.
    const [textValue, setTextValue] = useState(formatDisplayValue(value));
    const [isTextFocused, setIsTextFocused] = useState(false);

    // Sync local state if the incoming prop changes. Skip the text field
    // while the user is actively editing it so an external value change
    // doesn't clobber what they're typing.
    useEffect(() => {
        setLocalValue(value);
        if (!isTextFocused) {
            setTextValue(formatDisplayValue(value));
        }
    }, [value, isTextFocused]);

    const getSliderPosition = useCallback(() => {
        if (scale === 'log') return fromLogValue(localValue, min, max);
        if (exponent !== 1) return fromTaperedValue(localValue, min, max, exponent);
        return ((localValue - min) / (max - min)) * 100;
    }, [localValue, min, max, scale, exponent]);

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
        } else if (exponent !== 1) {
            newValue = toTaperedValue(newPosition, min, max, exponent);
        } else {
            newValue = min + (max - min) * (newPosition / 100);
        }
        // Quantize to `step` (and clamp) so pointer drags commit only on-grid
        // values — an integer control must never emit a fractional value.
        const finalValue = quantizeToStep(newValue);

        setLocalValue(finalValue);
        setTextValue(formatDisplayValue(finalValue));
        onChange(finalValue);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTextValue(e.target.value);
    };

    const handleInputFocus = () => {
        setIsTextFocused(true);
        // Show full precision while editing so the user can see/refine
        // digits beyond the 2dp display, and so focusing+blurring without
        // an edit re-commits the exact original value rather than the
        // rounded display string.
        setTextValue(localValue.toString());
    };

    const handleInputBlur = () => {
        setIsTextFocused(false);
        let parsed = parseFloat(textValue);
        if (textValue.toLowerCase().includes('k')) {
            parsed = parseFloat(textValue.replace(/k/i, '')) * 1000;
        }

        if (isNaN(parsed)) {
            setLocalValue(defaultValue);
            setTextValue(formatDisplayValue(defaultValue));
            onChange(defaultValue);
        } else {
            // Typing is "landing on the exact value you meant": preserve the
            // typed number at full precision, clamped to min/max only. Only
            // integer-contract controls (`quantize`) snap typed commits to
            // the step grid so e.g. "17.151" commits as 17 — the default
            // step of 0.01 must NOT truncate a deliberate "30.02413...".
            const finalValue = quantize
                ? quantizeToStep(parsed)
                : Math.max(min, Math.min(max, parsed));
            setLocalValue(finalValue);
            setTextValue(formatDisplayValue(finalValue));
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
            setTextValue(formatDisplayValue(finalValue));
            onChange(finalValue);
        }
    };

    // Plain double-click resets — the DAW convention. (The old version
    // demanded Ctrl/Cmd AND never propagated the reset value through
    // onChange, so even when triggered it didn't actually reset the param.)
    const handleDoubleClick = () => {
        setLocalValue(defaultValue);
        setTextValue(formatDisplayValue(defaultValue));
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
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                style={numberInputStyles}
            />
        </div>
    );
};

