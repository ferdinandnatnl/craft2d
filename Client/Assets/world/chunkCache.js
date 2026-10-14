import { BLOCK_SIZE, CHUNK_WIDTH, RENDER_DISTANCE } from "@2dcraft.com/shared/constants.js";

export function cacheFarChunks(dimension, centerIndex, saveChunk) {
    const keep = RENDER_DISTANCE + 2;
    for (const [chunkX, chunk] of dimension.chunks) {
        const index = chunkX / (CHUNK_WIDTH * BLOCK_SIZE);
        if (Math.abs(index - centerIndex) <= keep || !chunk.generated) continue;
        dimension.storedChunks.set(chunkX, {
            biome: { name: chunk.biome.name },
            previousChunk: chunk.previousChunk?.x ?? null,
            ...saveChunk(chunk),
        });
        dimension.chunks.delete(chunkX);
    }
}
