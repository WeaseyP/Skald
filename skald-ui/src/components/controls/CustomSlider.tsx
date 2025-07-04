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
    defaultValue: number;
    onChange: (newValue: number) => void;
    onReset: () => void;
    scale?: 'log' | 'exp' | 'linear';
    exponent?: number;
    step?: number;
}

// --- HELPER FUNCTIONS for scaling ---

const toLogValue = (position: number, min: number, max: number) => {
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / 100;
    return Math.exp(minLog + scale * position);
};

const fromLogValue = (value: number, min: number, max: number) => {
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / 100;
    return (Math.log(value) - minLog) / scale;
};

const toExpValue = (position: number, min: number, max: number, exponent: number) => {
    return min + (max - min) * Math.pow(position / 100, exponent);
};

const fromExpValue = (value: number, min: number, max: number, exponent: number) => {
    return 100 * Math.pow((value - min) / (max - min), 1 / exponent);
};


// --- MAIN COMPONENT ---

export const CustomSlider: React.FC<CustomSliderProps> = ({
    min,
    max,
    value,
    defaultValue,
    onChange,
    onReset,
    scale = 'linear',
    exponent = 2,
    step = 0.01,
}) => {
    const [internalValue, setInternalValue] = useState(value.toString());

    useEffect(() => {
        setInternalValue(value.toString());
    }, [value]);

    const getSliderPosition = useCallback(() => {
        if (scale === 'log') return fromLogValue(value, min, max);
        if (scale === 'exp') return fromExpValue(value, min, max, exponent);
        return ((value - min) / (max - min)) * 100;
    }, [value, min, max, scale, exponent]);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPosition = parseFloat(e.target.value);
        let newValue: number;
        if (scale === 'log') {
            newValue = toLogValue(newPosition, min, max);
        } else if (scale === 'exp') {
            newValue = toExpValue(newPosition, min, max, exponent);
        } else {
            newValue = min + (max - min) * (newPosition / 100);
        }
        onChange(newValue);
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInternalValue(e.target.value);
    };

    const handleInputBlur = () => {
        let parsed = parseFloat(internalValue);
        // Smart parsing for 'k' for thousands
        if (internalValue.toLowerCase().includes('k')) {
            parsed = parseFloat(internalValue.replace(/k/i, '')) * 1000;
        }

        if (isNaN(parsed)) {
            onChange(defaultValue); // Reset if invalid input
        } else {
            // Clamp the value within min/max bounds
            const clampedValue = Math.max(min, Math.min(max, parsed));
            onChange(clampedValue);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleInputBlur();
            (e.target as HTMLInputElement).blur();
        }
        // Fine-grained control with Shift + Arrow Keys
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const smallStep = step * (e.shiftKey ? 0.1 : 1);
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            const newValue = Math.max(min, Math.min(max, value + smallStep * direction));
            onChange(newValue);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            onReset();
        }
    };

    return (
        <div style={containerStyles} onDoubleClick={handleDoubleClick} title="Ctrl/Cmd + Double Click to Reset">
            <input
                type="range"
                min="0"
                max="100"
                value={getSliderPosition()}
                onChange={handleSliderChange}
                style={sliderStyles}
            />
            <input
                type="text" // Use text to allow for 'k' input
                value={internalValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                style={numberInputStyles}
            />
        </div>
    );
};
