import React, { useState, useEffect, FocusEvent, KeyboardEvent } from 'react';
import { formatDisplayValue } from '../../utils/formatDisplayValue';

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
    // Local state stores string to allow empty/intermediate states.
    // Display is rounded to at most 2dp (BUG-PARAM-DISPLAY-PRECISION) — this
    // is purely cosmetic, `value` itself (and what we hand back via
    // onChange) is never touched by the rounding.
    const [localValue, setLocalValue] = useState<string>(formatDisplayValue(value));
    const [isfocused, setIsFocused] = useState(false);

    // Sync only when not focused to avoid interfering with typing
    useEffect(() => {
        if (!isfocused) {
            setLocalValue(formatDisplayValue(value));
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
            setLocalValue(formatDisplayValue(value));
            return;
        }

        // Clamp
        if (min !== undefined && parsed < min) parsed = min;
        if (max !== undefined && parsed > max) parsed = max;

        // Apply. `onChange` always gets the exact parsed number (whatever
        // precision the user typed) — only the redisplayed string is
        // rounded, so the stored value is never quantized by this.
        setLocalValue(formatDisplayValue(parsed));
        onChange(parsed);
    };

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        commitValue();
        if (onBlur) onBlur(e);
    };

    const handleFocus = () => {
        setIsFocused(true);
        // Show full precision while actively editing, so (a) the user can
        // see/refine digits beyond the 2dp display and (b) focusing then
        // blurring without any edit re-commits the exact original value
        // instead of silently rounding it down to the display precision.
        setLocalValue(value.toString());
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
