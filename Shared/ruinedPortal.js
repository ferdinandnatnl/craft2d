/** Stable, sparse ruined-portal locations for newly generated Overworld chunks. */
export function isRuinedPortalChunk(seed, chunkIndex) {
    let hash = 2166136261;
    for (const character of `${seed}:${chunkIndex}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 73 === 0;
}
