import { isRandomSpreadChunk } from "./randomSpread.js";

/** Vanilla Java village spacing, sampled along this game's 2D world. */
export function isVillageChunk(seed, chunkIndex) {
    return isRandomSpreadChunk(seed, chunkIndex, {
        spacing: 34,
        separation: 8,
        salt: 10387312,
    });
}
