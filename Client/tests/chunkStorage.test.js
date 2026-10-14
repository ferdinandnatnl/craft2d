import test from "node:test";
import assert from "node:assert/strict";
import tooloud from "../../Shared/tooloud.js";
import { perlinSeed } from "../../Shared/seed.js";
import { CHUNK_HEIGHT, CHUNK_WIDTH, LEGACY_CHUNK_HEIGHT, BLOCK_SIZE } from "../../Shared/constants.js";
import { Blocks } from "../../Shared/blocks.js";
import { encodeChunkLayer, decodeChunkLayer, extendLegacyChunk } from "../../Shared/chunkStorage.js";
import { cacheFarChunks } from "../Assets/world/chunkCache.js";

test("chunk encoding preserves metadata and rejects truncated data", () => {
    const rows = Array.from({ length: CHUNK_HEIGHT }, () =>
        Array(CHUNK_WIDTH).fill(Blocks.Stone));
    rows[17][4] = { t: Blocks.Chest, m: { storage: [[{ itemId: 21, count: 3 }]] } };
    rows[102][11] = Blocks.Water;
    const packed = encodeChunkLayer(rows);
    assert.deepEqual(decodeChunkLayer(packed), rows);
    assert.ok(JSON.stringify(packed).length < JSON.stringify(rows).length / 50);
    assert.throws(() => decodeChunkLayer({ ...packed, runs: packed.runs.slice(1) }),
        /Incomplete|Invalid/);
});

test("legacy expansion preserves every saved upper block and gives deeper access", () => {
    tooloud.Perlin.setSeed(perlinSeed(1847));
    const blocks = Array.from({ length: LEGACY_CHUNK_HEIGHT }, (_, y) =>
        Array(CHUNK_WIDTH).fill(y === LEGACY_CHUNK_HEIGHT - 1
            ? Blocks.Bedrock : Blocks.Stone));
    const walls = blocks.map(row => row.slice());
    blocks[20][7] = { t: Blocks.Chest, m: { marker: "player-built" } };
    const original = { blocks, walls };
    const first = extendLegacyChunk(original, 0, 1847);
    const second = extendLegacyChunk(original, 0, 1847);
    assert.deepEqual(first, second);
    assert.equal(first.blocks.length, CHUNK_HEIGHT);
    assert.deepEqual(first.blocks[20][7], original.blocks[20][7]);
    assert.deepEqual(original.blocks[LEGACY_CHUNK_HEIGHT - 1][7], Blocks.Bedrock);
    assert.notEqual(first.blocks[LEGACY_CHUNK_HEIGHT - 1][7], Blocks.Bedrock);
    assert.equal(first.blocks[CHUNK_HEIGHT - 1][7], Blocks.Bedrock);
    assert.ok(first.blocks.slice(LEGACY_CHUNK_HEIGHT).flat().includes(Blocks.Air));
    assert.deepEqual(decodeChunkLayer(encodeChunkLayer(first.blocks)), first.blocks);
});

test("distant chunks are compacted while nearby chunks and unprocessed work remain live", () => {
    const make = (index, generated = true) => ({
        x: index * CHUNK_WIDTH * BLOCK_SIZE, biome: { name: "Plains" }, generated,
    });
    const dimension = { chunks: new Map([-6,-4,-3,0,3,4,6].map(index =>
        [index * CHUNK_WIDTH * BLOCK_SIZE, make(index, index !== 6)])),
    storedChunks: new Map() };
    cacheFarChunks(dimension, 0, () => ({ blocks: { encoding: "rle-v1" } }));
    assert.equal(dimension.chunks.has(-4 * CHUNK_WIDTH * BLOCK_SIZE), false);
    assert.equal(dimension.storedChunks.has(-4 * CHUNK_WIDTH * BLOCK_SIZE), true);
    assert.equal(dimension.chunks.has(3 * CHUNK_WIDTH * BLOCK_SIZE), true);
    assert.equal(dimension.chunks.has(6 * CHUNK_WIDTH * BLOCK_SIZE), true);
    assert.equal(dimension.storedChunks.get(-4 * CHUNK_WIDTH * BLOCK_SIZE).biome.name,
        "Plains");
});
