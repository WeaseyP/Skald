import { describe, expect, it } from 'vitest';
import { formatDisplayValue } from '../../utils/formatDisplayValue';

describe('formatDisplayValue', () => {
    it('rounds noisy floating point readings to at most two decimal places', () => {
        expect(formatDisplayValue(30.02413252345235)).toBe('30.02');
        expect(formatDisplayValue(0.0000000000)).toBe('0');
    });

    it('does not pad trailing zeros onto values that need fewer decimals', () => {
        expect(formatDisplayValue(0.1)).toBe('0.1');
        expect(formatDisplayValue(30)).toBe('30');
    });

    it('rounds using standard rounding, not truncation', () => {
        expect(formatDisplayValue(1.005)).toBe('1');
        expect(formatDisplayValue(2.999)).toBe('3');
    });

    it('normalizes negative-zero results to a plain "0"', () => {
        expect(formatDisplayValue(-0.001)).toBe('0');
    });

    it('supports a custom decimal cap', () => {
        expect(formatDisplayValue(1.23456, 3)).toBe('1.235');
        expect(formatDisplayValue(1.2, 3)).toBe('1.2');
    });

    it('never mutates the input number and returns a string', () => {
        const input = 30.02413252345235;
        const result = formatDisplayValue(input);
        expect(input).toBe(30.02413252345235);
        expect(typeof result).toBe('string');
    });

    it('passes non-finite values through unchanged rather than throwing', () => {
        expect(formatDisplayValue(NaN)).toBe('NaN');
        expect(formatDisplayValue(Infinity)).toBe('Infinity');
    });
});
