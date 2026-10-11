import { CAVES_THRESHOLD, CHUNK_HEIGHT, CHUNK_WIDTH } from "./constants.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const normalizeNoise = (value, noise) => noise.intensity === 0 ? 0.5 :
    clamp((value - noise.min + noise.intensity) / (2 * noise.intensity), 0, 1);

// Sample the same surface before and after a chunk loads. Biome transitions
// span neighboring chunk centers and never depend on the camera or chunk map.
export function terrainHeightAt(worldX, biomeAt, noiseMaps, flat = false) {
    if (flat) return CHUNK_HEIGHT / 2;

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
    const caveNoise = noiseMaps.cave.getNoise(worldX, Math.max(1, Math.floor(height)));
    height -= clamp((CAVES_THRESHOLD - caveNoise) / CAVES_THRESHOLD, 0, 1) * 3;
    return Math.floor(clamp(height, 1, CHUNK_HEIGHT - 2));
}
