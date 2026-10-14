const MAX_LOD_STEP = 16;

export function getDistantLodStep(distanceInChunks, renderDistance = 1) {
    if (!Number.isFinite(distanceInChunks) || distanceInChunks <= renderDistance) {
        return 1;
    }

    const step = 2 ** Math.floor(Math.log2(distanceInChunks));
    return Math.min(MAX_LOD_STEP, Math.max(2, step));
}

export function getDistantLodDepth(distanceInChunks, chunkWidth = 16) {
    if (!Number.isFinite(distanceInChunks) || distanceInChunks <= 0) return 0;
    return distanceInChunks * chunkWidth * 0.9;
}

export function sampleDistantLodCell(
    blocks,
    startX,
    startY,
    step,
    isAir,
) {
    if (!Array.isArray(blocks) || !Number.isInteger(step) || step < 1) return null;

    const height = Math.min(step, blocks.length - startY);
    const width = Math.min(step, (blocks[startY] || []).length - startX);
    if (height <= 0 || width <= 0) return null;

    const counts = new Map();
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            const block = blocks[y]?.[x];
            if (!block || isAir(block)) continue;

            const key = `${block.blockType}:${block.spriteName || ""}`;
            const entry = counts.get(key) || { block, count: 0 };
            entry.count++;
            counts.set(key, entry);
        }
    }

    let dominant = null;
    for (const entry of counts.values()) {
        if (!dominant || entry.count > dominant.count) dominant = entry;
    }

    if (!dominant || dominant.count < Math.max(1, Math.ceil(width * height * 0.12))) {
        return null;
    }

    return {
        block: dominant.block,
        coverage: dominant.count / (width * height),
        width,
        height,
    };
}
