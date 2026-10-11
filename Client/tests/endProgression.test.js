import test from "node:test";
import assert from "node:assert/strict";
import { END_ISLAND_RADIUS, END_OUTPOST_X, END_SHRINE_X, endIslandSurfaceY,
    endIslandSurfaceWorldY, endEntryWorldY, endExitPortalWorldY,
    filledEndFrameStart, isEndShrineChunk, nearestEndShrineX } from "../../Shared/endProgression.js";
import { BLOCK_SIZE, CHUNK_WIDTH } from "../../Shared/constants.js";

test("End island has solid spawn terrain and a void edge", () => {
    assert.ok(endIslandSurfaceY(-8) !== null);
    assert.ok(endIslandSurfaceY(0) !== null);
    assert.ok(endIslandSurfaceY(END_ISLAND_RADIUS) !== null);
    assert.equal(endIslandSurfaceY(END_ISLAND_RADIUS + 1), null);
    assert.ok(endIslandSurfaceY(80) !== null);
    assert.equal(endIslandSurfaceY(100), null);
    assert.ok(endIslandSurfaceY(120) !== null);
    assert.ok(endEntryWorldY(-8) + 2 * BLOCK_SIZE ===
        endIslandSurfaceWorldY(-8));
    assert.equal(endExitPortalWorldY(),
        endIslandSurfaceWorldY(0) - BLOCK_SIZE);
});

test("older explored chunks can lead to the next generated shrine", () => {
    assert.ok(isEndShrineChunk(END_SHRINE_X));
    assert.ok(isEndShrineChunk(END_SHRINE_X + 256));
    assert.equal(nearestEndShrineX(0), END_SHRINE_X);
    assert.equal(nearestEndShrineX(0, x => x === END_SHRINE_X),
        END_SHRINE_X - 256);
});

test("both outer End outposts fit inside their generated chunks", () => {
    for (const blockX of [-END_OUTPOST_X, END_OUTPOST_X]) {
        const chunkStart = Math.floor(blockX / CHUNK_WIDTH) * CHUNK_WIDTH;
        const localX = blockX - chunkStart;
        assert.ok(localX >= 2 && localX < CHUNK_WIDTH - 2);
        assert.equal(localX, 8);
        assert.notEqual(endIslandSurfaceY(blockX), null);
    }
});

test("three filled neighboring frames activate from either side", () => {
    const size = 64;
    const filled = new Set([END_SHRINE_X, END_SHRINE_X + 1,
        END_SHRINE_X + 2].map(x => x * size));
    const isFilled = x => filled.has(x);
    assert.equal(filledEndFrameStart((END_SHRINE_X + 2) * size, 20 * size,
        size, isFilled), END_SHRINE_X * size);
    filled.delete((END_SHRINE_X + 1) * size);
    assert.equal(filledEndFrameStart((END_SHRINE_X + 2) * size, 20 * size,
        size, isFilled), null);
});
