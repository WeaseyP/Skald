// Roadmap packet B10 — peak meter arithmetic, kept pure so the two traps the
// roadmap names can be pinned without a browser: the clip decision must be
// made on FLOAT samples (a byte-domain meter tops out at 0 dBFS and can never
// see an over), and the hold must fall at a known rate so a transient peak
// stays readable for a moment instead of vanishing in one frame.
import { describe, it, expect } from 'vitest';
import {
    CLIP_THRESHOLD,
    HOLD_DECAY_DB_PER_SECOND,
    METER_FLOOR_DB,
    advanceHold,
    isClipping,
    meterFill,
    peakOf,
    toDbfs,
} from '../../utils/meter';

describe('peakOf', () => {
    it('returns the largest absolute sample', () => {
        expect(peakOf(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
    });

    it('sees an over: float samples above 1.0 are reported as they are, not saturated', () => {
        // This is the whole reason the meter reads getFloatTimeDomainData.
        // getByteTimeDomainData maps [-1, 1] onto [0, 255]; 1.4 would come
        // back as 255 and be indistinguishable from exactly full scale.
        expect(peakOf(new Float32Array([0.2, 1.4, -0.9]))).toBeCloseTo(1.4, 6);
    });

    it('treats a non-finite sample as an over — a NaN in the mix is a fault, not silence', () => {
        expect(peakOf(new Float32Array([0.1, NaN, 0.2]))).toBe(Infinity);
        expect(peakOf(new Float32Array([0.1, -Infinity]))).toBe(Infinity);
    });

    it('is 0 for an empty buffer', () => {
        expect(peakOf(new Float32Array(0))).toBe(0);
    });
});

describe('toDbfs / meterFill', () => {
    it('maps full scale to 0 dBFS and half scale to about -6 dB', () => {
        expect(toDbfs(1)).toBeCloseTo(0, 6);
        expect(toDbfs(0.5)).toBeCloseTo(-6.02, 2);
        expect(toDbfs(0)).toBe(-Infinity);
    });

    it('fills 0 at the floor, 1 at full scale, and pins an over at 1', () => {
        expect(meterFill(0)).toBe(0);
        expect(meterFill(Math.pow(10, METER_FLOOR_DB / 20))).toBeCloseTo(0, 6);
        expect(meterFill(1)).toBe(1);
        expect(meterFill(2)).toBe(1);
        // -30 dB is exactly halfway up a -60 dB meter.
        expect(meterFill(Math.pow(10, -30 / 20))).toBeCloseTo(0.5, 6);
    });
});

describe('advanceHold', () => {
    it('jumps up to a new peak immediately', () => {
        expect(advanceHold(-40, -6, 1 / 60)).toBe(-6);
    });

    it('falls at HOLD_DECAY_DB_PER_SECOND when the signal is below the hold', () => {
        const after = advanceHold(-6, -60, 0.5);
        expect(after).toBeCloseTo(-6 - HOLD_DECAY_DB_PER_SECOND * 0.5, 6);
    });

    it('never falls below the current peak', () => {
        expect(advanceHold(-6, -10, 10)).toBe(-10);
    });
});

describe('isClipping', () => {
    it('lights at and above full scale, not below it', () => {
        expect(CLIP_THRESHOLD).toBe(1);
        expect(isClipping(0.999)).toBe(false);
        expect(isClipping(1)).toBe(true);
        expect(isClipping(1.3)).toBe(true);
        expect(isClipping(Infinity)).toBe(true);
    });
});
