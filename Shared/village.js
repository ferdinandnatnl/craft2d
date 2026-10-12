/** Stable village locations, independent of chunk generation order. */
export function isVillageChunk(seed, chunkIndex) {
    let hash = 2166136261;
    for (const character of `village:${seed}:${chunkIndex}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 19 === 0;
}
