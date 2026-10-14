import { BLOCK_SIZE, CHUNK_HEIGHT, LEGACY_CHUNK_HEIGHT } from "./constants.js";

// The first stronghold is a fixed landmark so an Eye of Ender can lead to it.
export const END_SHRINE_X = 80;
export const END_SHRINE_WIDTH = 3;
export const END_SHRINE_SPACING = 256;
export const END_ISLAND_RADIUS = 48;
export const END_OUTER_ISLAND_FIRST = 80;
export const END_OUTER_ISLAND_SPACING = 40;
export const END_OUTER_ISLAND_RADIUS = 14;
export const END_OUTPOST_X = 120;

export function isEndShrineChunk(blockX) {
    return (blockX - END_SHRINE_X) % END_SHRINE_SPACING === 0;
}

export function nearestEndShrineX(blockX, unavailable = () => false) {
    const center = Math.round((blockX - END_SHRINE_X) / END_SHRINE_SPACING);
    for (let radius = 0; radius < 16; radius++) {
        const candidates = radius === 0 ? [center] :
            [center - radius, center + radius].sort((a, b) =>
                Math.abs(END_SHRINE_X + a * END_SHRINE_SPACING - blockX) -
                Math.abs(END_SHRINE_X + b * END_SHRINE_SPACING - blockX));
        for (const index of candidates) {
            const x = END_SHRINE_X + index * END_SHRINE_SPACING;
            if (!unavailable(x)) return x;
        }
    }
    return END_SHRINE_X;
}

export function endIslandSurfaceY(blockX) {
    const distance = Math.abs(blockX);
    const offset = CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT;
    if (distance > END_ISLAND_RADIUS) {
        if (distance < END_OUTER_ISLAND_FIRST - END_OUTER_ISLAND_RADIUS) return null;
        const center = END_OUTER_ISLAND_FIRST +
            Math.round((distance - END_OUTER_ISLAND_FIRST) / END_OUTER_ISLAND_SPACING) *
                END_OUTER_ISLAND_SPACING;
        const edgeDistance = Math.abs(distance - center);
        if (edgeDistance > END_OUTER_ISLAND_RADIUS) return null;
        return Math.floor(offset + LEGACY_CHUNK_HEIGHT / 2 - 2 +
            Math.pow(edgeDistance / END_OUTER_ISLAND_RADIUS, 2) * 4);
    }
    const edge = distance / END_ISLAND_RADIUS;
    return Math.floor(offset + LEGACY_CHUNK_HEIGHT / 2 - 2 + edge * edge * 5);
}

export function endIslandSurfaceWorldY(blockX) {
    const surface = endIslandSurfaceY(blockX);
    return surface === null ? null : (CHUNK_HEIGHT - 1 - surface) * BLOCK_SIZE;
}

export function endEntryWorldY(blockX = -8) {
    const surface = endIslandSurfaceWorldY(blockX);
    return surface === null ? null : surface - 2 * BLOCK_SIZE;
}

export function endExitPortalWorldY() {
    return endIslandSurfaceWorldY(0) - BLOCK_SIZE;
}

export function filledEndFrameStart(worldX, worldY, blockSize, isFilled) {
    for (let start = -2; start <= 0; start++) {
        const left = worldX + start * blockSize;
        if ([0, 1, 2].every(offset =>
            isFilled(left + offset * blockSize, worldY))) return left;
    }
    return null;
}
