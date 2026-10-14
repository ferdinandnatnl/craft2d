import { seedHash } from "./seed.js";

/** Minecraft's randomized-spread layout, sampled along this game's 2D world. */
export function isRandomSpreadChunk(
    seed,
    chunkIndex,
    { spacing, separation, salt },
) {
    if (!Number.isInteger(chunkIndex) || spacing <= separation || separation < 0) {
        return false;
    }

    const region = Math.floor(chunkIndex / spacing);
    const offsetRange = spacing - separation;
    const offset = seedHash(seed, `structure:${salt}:${region}`) % offsetRange;
    return chunkIndex === region * spacing + offset;
}
