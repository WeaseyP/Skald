// Display-only number formatting for interactive controls (sliders, ADSR
// graph readouts, on-canvas number boxes, etc).
//
// BUG-PARAM-DISPLAY-PRECISION: raw floating-point state (e.g. automation
// output, log-scale slider math, `0.1 + 0.2`-style rounding noise) was being
// rendered verbatim, producing readouts like `0.0000000000` or
// `30.02413252345235`. This trims what's shown on screen to at most
// `maxDecimals` places without touching the underlying number in any way —
// callers still store/emit the exact value the user typed or the exact
// value produced by DSP/automation. Never call this on a value before
// storing it, serializing it, or passing it to onChange — it is for
// rendered text only.
export function formatDisplayValue(value: number, maxDecimals = 2): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return String(value);
    }

    // Number(...) instead of Number.prototype.toFixed's raw string keeps
    // trailing zeros from padding the display (e.g. `0.1` stays `0.1`
    // rather than becoming `0.10`), while still capping precision.
    const rounded = Number(value.toFixed(maxDecimals));

    // Avoid a literal "-0" for values that round down to (negative) zero.
    return (rounded === 0 ? 0 : rounded).toString();
}
