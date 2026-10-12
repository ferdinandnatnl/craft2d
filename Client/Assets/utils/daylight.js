const smooth = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};

// Game time loops from 1 to 7.5. Keep both horizons continuous so the sky,
// fog, and skylight move through the same dusk and dawn.
export function daylightFactor(time) {
    if (time < 2.85) return 1;
    if (time < 3.65) return 1 - smooth((time - 2.85) / 0.8);
    if (time < 6) return 0;
    if (time < 6.8) return smooth((time - 6) / 0.8);
    return 1;
}

export function twilightFactor(time) {
    const daylight = daylightFactor(time);
    return 4 * daylight * (1 - daylight);
}
