# Audio Preview Fix Plan

This document outlines the plan to fix the audio preview functionality in the `skald-ui` application.

## 1. Diagnosis Validation

The `ANALYSIS_REPORT.md` correctly identified an issue in the `release` method of the `Voice` class in `skald-ui/src/hooks/nodeEditor/voice.ts`. The report stated that the release was effectively instantaneous.

Upon review, the diagnosis is slightly different. The code *does* schedule a ramp down to zero, but it uses `linearRampToValueAtTime`. While functional, a linear ramp produces an unnatural and abrupt-sounding fade-out for audio signals. For a more musical and professional-sounding release, an exponential ramp is the standard and preferred method. The `setTargetAtTime` method is the appropriate tool for this, as it creates a much smoother decay.

**Conclusion:** The diagnosis is confirmed, but the nature of the error is more nuanced. The problem is not a complete lack of a release, but an unnatural-sounding one due to the use of a linear ramp instead of an exponential one.

## 2. Proposed Solution

The proposed solution is to modify the `release` method in `skald-ui/src/hooks/nodeEditor/voice.ts` to use `setTargetAtTime` instead of `linearRampToValueAtTime`. This will change the gain reduction from a linear curve to an exponential curve, resulting in a more natural-sounding audio fade-out.

### Corrected Audio Graph and Data Flow

The audio graph itself remains correct. The change is in how the `gain` `AudioParam` on the ADSR's `GainNode` is scheduled.

**Before (Linear Ramp):**

```
gainNode.gain.linearRampToValueAtTime(0, startTime + release);
```

This causes the gain to decrease in a straight line, which can be perceived as cutting off suddenly at the end.

**After (Exponential Ramp):**

```
gainNode.gain.setTargetAtTime(0, startTime, release / 5); // A time constant of release/5 provides a good curve
```

This will cause the gain to decrease exponentially, which is much closer to how natural sounds decay.

## 3. Step-by-Step Implementation Plan

1.  **File to Modify:** `skald-ui/src/hooks/nodeEditor/voice.ts`
2.  **Action:** In the `release` method, replace the line that uses `linearRampToValueAtTime` with `setTargetAtTime`.

    *   **From (line 81):**
        ```typescript
        gainNode.gain.linearRampToValueAtTime(0, startTime + release);
        ```

    *   **To:**
        ```typescript
        gainNode.gain.setTargetAtTime(0, startTime, release / 5);
        ```
        *(Note: The time constant for `setTargetAtTime` is not the same as the duration for `linearRampToValueAtTime`. A value of `release / 5` is a good starting point for a natural-sounding decay.)*

3.  **Reason:** Using `setTargetAtTime` will create an exponential decay curve for the gain, which results in a more natural and pleasing audio fade-out compared to the abruptness of a linear ramp.

## 4. Verification and Testing

After implementing the change, the fix can be verified with the following steps:

1.  **Run the `skald-ui` application.**
2.  **Create a simple audio graph:** For instance, connect an `OscillatorNode` to an `ADSRNode`, and the `ADSRNode` to a `GraphOutputNode`.
3.  **Set a long release time:** In the `ADSRNode`'s settings, set the "release" parameter to a high value (e.g., 2 seconds).
4.  **Trigger a note:** Play a note and then release it.
5.  **Listen to the fade-out:** The note should now have a smooth, natural-sounding decay that lasts for the duration of the release time. It should not cut off abruptly.
6.  **Compare with the old behavior (optional):** If possible, compare the new audio fade-out with the behavior before the fix to confirm the improvement.