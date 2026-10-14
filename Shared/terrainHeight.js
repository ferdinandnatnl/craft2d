import {
    CAVES_THRESHOLD,
    CHUNK_HEIGHT,
    LEGACY_CHUNK_HEIGHT,
    CHUNK_WIDTH,
    TERRAIN_HEIGHT,
    WATER_LEVEL,
} from "./constants.js";

const LEGACY_SHIFT = CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (min, max, value) => {
    const t = clamp((value - min) / (max - min), 0, 1);
    return t * t * (3 - 2 * t);
};
const normalizeNoise = (value, noise) => noise.intensity === 0 ? 0.5 :
    clamp((value - noise.min + noise.intensity) / (2 * noise.intensity), 0, 1);

function legacyTerrainHeightAt(worldX, biomeAt, noiseMaps, flat) {
    if (flat) return LEGACY_CHUNK_HEIGHT / 2 + LEGACY_SHIFT;

    const position = worldX / CHUNK_WIDTH - 0.5;
    const leftIndex = Math.floor(position);
    const t = position - leftIndex;
    const blend = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const left = biomeAt(leftIndex).heightNoise;
    const right = biomeAt(leftIndex + 1).heightNoise;
    const layer = (offset, scale) => lerp(left.getNoise(worldX, offset, scale),
        right.getNoise(worldX, offset, scale), blend);
    const baseline = lerp(left.min, right.min, blend);
    const detail = (layer(0, 1) + layer(200000, 2)) / 2 - baseline;

    const continentalness = normalizeNoise(noiseMaps.continentalness.getNoise(worldX, 0), noiseMaps.continentalness);
    const erosion = normalizeNoise(noiseMaps.erosion.getNoise(worldX, 10000), noiseMaps.erosion);
    const peaks = normalizeNoise(noiseMaps.peaks.getNoise(worldX, 20000), noiseMaps.peaks);
    const heightDetail = noiseMaps.heightDetail.getNoise(worldX, 30000) - noiseMaps.heightDetail.min;
    const peakBoost = Math.pow(peaks, 2) * 28;
    const ridgeBoost = Math.pow(1 - Math.abs(peaks * 2 - 1), 2) * 16;
    let height = baseline + lerp(-20, 30, continentalness) * 0.6 + detail * 1.1
        + heightDetail * 0.4 + (peakBoost + ridgeBoost) * lerp(1, 0.25, erosion);
    const caveNoise = noiseMaps.cave.getNoise(worldX,
        Math.max(1, Math.floor(height - (TERRAIN_HEIGHT - 50))));
    height -= clamp((CAVES_THRESHOLD - caveNoise) / CAVES_THRESHOLD, 0, 1) * 3;
    return Math.floor(clamp(height + LEGACY_SHIFT + 50 - TERRAIN_HEIGHT, 1, CHUNK_HEIGHT - 2));
}

// Terrain fields define the landform. Biomes are applied later as surface and
// feature rules, matching modern Minecraft's separation of terrain and biome.
export function terrainHeightAt(
    worldX,
    biomeAt,
    noiseMaps,
    flat = false,
    worldgenVersion = 2,
) {
    if (worldgenVersion < 2) {
        return legacyTerrainHeightAt(worldX, biomeAt, noiseMaps, flat);
    }
    if (flat) return worldgenVersion >= 4 ? CHUNK_HEIGHT / 2 : LEGACY_CHUNK_HEIGHT / 2 + LEGACY_SHIFT;

    const sampleX = worldgenVersion >= 4 ? worldX / 4 : worldX;
    const continentalness = normalizeNoise(
        noiseMaps.continentalness.getNoise(sampleX, 0),
        noiseMaps.continentalness,
    );
    const erosion = normalizeNoise(
        noiseMaps.erosion.getNoise(sampleX, 10000),
        noiseMaps.erosion,
    );
    const peaks = normalizeNoise(
        noiseMaps.peaks.getNoise(sampleX, 20000),
        noiseMaps.peaks,
    );

    const seaLevel = worldgenVersion >= 4
        ? TERRAIN_HEIGHT + WATER_LEVEL : 60 + LEGACY_SHIFT;
    const coast = smoothstep(0.36, 0.58, continentalness);
    const inland = smoothstep(0.52, 0.78, continentalness);
    const highland = smoothstep(0.66, 0.88, continentalness);
    const worn = 1 - erosion;

    // Continentalness forms oceans, shores, and inland terrain. Erosion and
    // peaks then shape hills and mountain ranges without biome-specific height.
    const broadElevation = seaLevel - 22 + coast * 24 + inland * 8;
    const hillScale = 6 + inland * 10 + highland * worn * 7;
    const rollingTerrain = (peaks - 0.5) * hillScale;
    const mountainRidges =
        worldgenVersion >= 4
            ? smoothstep(0.42, 0.7, peaks) * inland * (0.35 + 0.65 * worn) *
                (worldgenVersion >= 5 ? 90 : 170)
            : worldgenVersion >= 3
                ? smoothstep(0.52, 0.78, peaks) * inland * worn * 65
            : smoothstep(0.62, 0.86, peaks) * highland * worn * 24;
    const detail = noiseMaps.heightDetail.getNoise(sampleX, 30000) -
        noiseMaps.heightDetail.min;

    const valley = worldgenVersion >= 4 ? (1 - erosion) * (1 - peaks) * 18 : 0;
    const roughness = worldgenVersion >= 4
        ? (noiseMaps.heightDetail.getNoise(worldX / 3, 31007) -
            noiseMaps.heightDetail.min) * 0.85 +
            (noiseMaps.heightDetail.getNoise(worldX, 32013) -
                noiseMaps.heightDetail.min) * 0.35 +
            (noiseMaps.heightDetail.getNoise(worldX * 6, 38911) -
                noiseMaps.heightDetail.min) * 0.25 : 0;
    // The old broad ridge could make a mountain flank nearly a straight line.
    // Add independent, shorter landforms only where that ridge rises. Leave
    // coastlines and saved v4 worlds on their original terrain function.
    const mountainVariation = worldgenVersion >= 5
        ? smoothstep(12, 55, mountainRidges) * (
            (noiseMaps.heightDetail.getNoise(worldX / 4, 41317) -
                noiseMaps.heightDetail.min) * 7 +
            (noiseMaps.heightDetail.getNoise(worldX / 1.5, 45731) -
                noiseMaps.heightDetail.min) * 3.2)
        : 0;
    const broadHeight = broadElevation + rollingTerrain + mountainRidges - valley +
        detail * 0.45;
    const shoreVariation = worldgenVersion >= 4
        ? 1 + 1.6 * (1 - clamp(Math.abs(broadHeight - seaLevel) / 18, 0, 1))
        : 1;
    const headroom = Math.max(0, CHUNK_HEIGHT - 22 - broadHeight);
    const boundedMountainVariation = mountainVariation > 0
        ? mountainVariation * headroom / (headroom + mountainVariation)
        : mountainVariation;
    const height = broadHeight + boundedMountainVariation + roughness * shoreVariation;
    return Math.floor(clamp(height, 1, CHUNK_HEIGHT - (worldgenVersion >= 4 ? 18 : worldgenVersion >= 3 ? 14 : 2)));
}
