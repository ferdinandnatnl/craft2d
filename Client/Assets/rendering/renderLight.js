// Three.js lights already follow the day cycle. Keep sky-exposed geometry at
// its texture color and use stored light levels only for sheltered areas.
import { daylightFactor } from "../utils/daylight.js";

export function renderLightTint(level, skyExposure, lighting) {
    if (!lighting) return 1;
    const exposure = Math.max(0, Math.min(1, Number(skyExposure) || 0));
    const stored = Math.max(0.22, Math.min(1, (level ?? 15) / 15));
    return Math.max(stored, 0.22 + 0.78 * exposure);
}

// Classic has no scene lights, so open surfaces need their own moonlit floor.
export function classicLightTint(level, skyExposure, time) {
    const stored = Math.max(0.1, Math.min(1, (level ?? 15) / 15));
    const exposure = Math.max(0, Math.min(1, Number(skyExposure) || 0));
    const moonlight = 0.2 + 0.42 * exposure;
    const sunlight = 0.2 + 0.8 * exposure;
    return Math.max(stored, moonlight + (sunlight - moonlight) * daylightFactor(time));
}
