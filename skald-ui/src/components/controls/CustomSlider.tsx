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
        return ((localValue - min) / (max - min)) * 100;
    }, [localValue, min, max, scale]);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPosition = parseFloat(e.target.value);
        let newValue: number;
        if (scale === 'log') {
            newValue = toLogValue(newPosition, min, max);
        } else {
            newValue = min + (max - min) * (newPosition / 100);
        }
        // Clamp and format the value to avoid floating point inaccuracies
        const clampedValue = Math.max(min, Math.min(max, newValue));
        const finalValue = parseFloat(clampedValue.toPrecision(5));
        
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
            const clampedValue = Math.max(min, Math.min(max, parsed));
            setLocalValue(clampedValue);
            setTextValue(formatDisplayValue(clampedValue));
            onChange(clampedValue);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleInputBlur();
            (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const smallStep = step * (e.shiftKey ? 0.1 : 1);
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            const newValue = Math.max(min, Math.min(max, localValue + smallStep * direction));
            const finalValue = parseFloat(newValue.toPrecision(5));

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

