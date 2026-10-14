import tooloud from "./tooloud.js";
import { CHUNK_HEIGHT, LEGACY_CHUNK_HEIGHT, TERRAIN_HEIGHT, WATER_LEVEL } from "./constants.js";

export const WORLDGEN_VERSION = 5;
export const LEGACY_DEPTH_SHIFT = CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT;
export const savedWorldgenVersion = value => Number(value) >= 5 ? 5 : Number(value) >= 4 ? 4 : Number(value) >= 3 ? 3 : Number(value) >= 2 ? 2 : 1;
export const SEA_LEVEL = TERRAIN_HEIGHT + WATER_LEVEL;
export const seaLevelForVersion = version => version >= 4 ? SEA_LEVEL : 60 + LEGACY_DEPTH_SHIFT;
export const normalizeClimate = (value, noise) => noise.intensity === 0 ? 0.5 :
    Math.max(0, Math.min(1, 0.5 + (value - noise.min) / (2 * noise.intensity)));

// Mountain biomes follow elevation and climate, not the other way around.
export function mountainBiomeAt({ height, temperature, wetness, peaks, seaLevel = SEA_LEVEL }) {
    if (height >= seaLevel + 20) {
        if (temperature > 0.58) return "Mountain";
        return peaks > 0.65 ? "JaggedPeaks" : "FrozenPeaks";
    }
    if (height >= seaLevel + 10) {
        if (temperature < 0.42) return wetness > 0.5 ? "Grove" : "SnowySlopes";
        if (temperature < 0.7) return "Meadow";
    }
    return null;
}

// Compress vanilla's mining elevations into this game's existing vertical range:
// bedrock -> -64, sea level -> 63, top -> 319. These are generation coordinates,
// not a change to player coordinates or the saved block layout.
export function miningElevation(y, version = WORLDGEN_VERSION) {
    if (version < 4) {
        const oldY = y - LEGACY_DEPTH_SHIFT;
        return oldY <= 60 ? -64 + oldY * 127 / 60
            : 63 + (oldY - 60) * 256 / (LEGACY_CHUNK_HEIGHT - 1 - 60);
    }
    return y <= SEA_LEVEL ? -64 + y * 127 / SEA_LEVEL
        : 63 + (y - SEA_LEVEL) * 256 / (CHUNK_HEIGHT - 1 - SEA_LEVEL);
}

export function undergroundBiomeAt(x, y, surface, version = WORLDGEN_VERSION) {
    if (y < 3 || y > surface - 8) return null;
    const scale = version >= 4 ? 0.25 : 1;
    const depth = version >= 4 ? y : y - LEGACY_DEPTH_SHIFT;
    const humidity = tooloud.Perlin.noise(x * 0.008 * scale, depth * 0.018 * scale, 4703);
    const geology = tooloud.Perlin.noise(x * 0.011 * scale, depth * 0.022 * scale, 4789);
    if (humidity > 0.16) return "lush_caves";
    if (geology > 0.12 && humidity < 0.05) return "dripstone_caves";
    return null;
}
