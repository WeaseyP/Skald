import React, { useState, useEffect, FocusEvent, KeyboardEvent } from 'react';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}

export const NumberInput: React.FC<NumberInputProps> = ({
    value,
    onChange,
    min,
    max,
    step,
    onBlur,
    onKeyDown,
    className,
    ...props
}) => {
    // Local state stores string to allow empty/intermediate states
    const [localValue, setLocalValue] = useState<string>(value.toString());
    const [isfocused, setIsFocused] = useState(false);

    // Sync only when not focused to avoid interfering with typing
    useEffect(() => {
        if (!isfocused) {
            setLocalValue(value.toString());
        }
    }, [value, isfocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);

        // Optional: Trigger change immediately if valid? 
        // Or wait for blur? User requested "can highlight and type over", 
        // implying immediate updates are nice, but empty state must be valid locally.

        // Let's try attempting update if it is a valid number, 
        // but NOT reverting if it's invalid (until blur).
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed) && newVal.trim() !== '') {
            onChange(parsed);
        }
    };

    const commitValue = () => {
        let parsed = parseFloat(localValue);

        if (isNaN(parsed) || localValue.trim() === '') {
            // Revert to last known valid prop
            setLocalValue(value.toString());
            return;
        }

        // Clamp
        if (min !== undefined && parsed < min) parsed = min;
        if (max !== undefined && parsed > max) parsed = max;

        // Apply
        setLocalValue(parsed.toString());
        onChange(parsed);
    };

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        commitValue();
        if (onBlur) onBlur(e);
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commitValue();
            e.currentTarget.blur();
        }
        if (onKeyDown) onKeyDown(e);
    };

    return (
        <input
            {...props}
            type="number"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            step={step}
            className={className}
        />
    );
};
