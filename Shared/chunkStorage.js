import { CHUNK_HEIGHT, CHUNK_WIDTH, LEGACY_CHUNK_HEIGHT } from "./constants.js";
import { Blocks } from "./blocks.js";
import { caveCellAt, caveColumnAt } from "./caves.js";
import { oreBlockAt, undergroundRockAt } from "./oreGeneration.js";

const same = (left, right) => typeof left === "number" && left === right;

export function encodeChunkLayer(rows) {
    const runs = [];
    for (const row of rows) {
        for (const value of row) {
            const last = runs.at(-1);
            if (last && same(last[1], value)) last[0]++;
            else runs.push([1, value]);
        }
    }
    return { encoding: "rle-v1", height: rows.length, runs };
}

export function decodeChunkLayer(layer) {
    if (Array.isArray(layer)) {
        if (layer.length < 1 || layer.length > CHUNK_HEIGHT ||
            !layer.every(row => Array.isArray(row) && row.length === CHUNK_WIDTH)) {
            throw new Error("Invalid saved chunk rows");
        }
        return layer;
    }
    if (layer?.encoding !== "rle-v1" || !Number.isInteger(layer.height) ||
        layer.height < 1 || layer.height > CHUNK_HEIGHT || !Array.isArray(layer.runs)) {
        throw new Error("Invalid saved chunk layer");
    }
    const size = layer.height * CHUNK_WIDTH;
    const flat = [];
    for (const [count, value] of layer.runs) {
        if (!Number.isInteger(count) || count < 1 || count > size - flat.length ||
            (!Number.isInteger(value) && (typeof value !== "object" || value === null))) {
            throw new Error("Invalid saved chunk run");
        }
        for (let i = 0; i < count; i++) flat.push(value);
    }
    if (flat.length !== size) throw new Error("Incomplete saved chunk layer");
    return Array.from({ length: layer.height }, (_, y) =>
        flat.slice(y * CHUNK_WIDTH, (y + 1) * CHUNK_WIDTH));
}

const blockId = value => typeof value === "number" ? value : value?.t;

// Legacy rows keep their original top-down indices, so player/world positions
// and every placed block stay fixed. Only the generated bedrock floor is opened.
export function extendLegacyChunk(chunk, chunkX, seed, dimension = 0) {
    const blocks = decodeChunkLayer(chunk.blocks);
    const walls = decodeChunkLayer(chunk.walls);
    if (blocks.length === CHUNK_HEIGHT && walls.length === CHUNK_HEIGHT)
        return { ...chunk, blocks, walls };
    if (blocks.length !== LEGACY_CHUNK_HEIGHT || walls.length !== LEGACY_CHUNK_HEIGHT) {
        throw new Error("Unsupported saved chunk height");
    }
    const expandedBlocks = blocks.map(row => row.slice());
    const expandedWalls = walls.map(row => row.slice());
    const columns = Array.from({ length: CHUNK_WIDTH }, (_, x) =>
        dimension === 0 ? caveColumnAt(chunkX + x, seed, 0, 4) : null);
    for (let x = 0; x < CHUNK_WIDTH; x++) {
        if (blockId(expandedBlocks[LEGACY_CHUNK_HEIGHT - 1][x]) === Blocks.Bedrock) {
            expandedBlocks[LEGACY_CHUNK_HEIGHT - 1][x] = dimension === 1
                ? Blocks.Netherrack : Blocks.Deepslate;
        }
        if (blockId(expandedWalls[LEGACY_CHUNK_HEIGHT - 1][x]) === Blocks.Bedrock) {
            expandedWalls[LEGACY_CHUNK_HEIGHT - 1][x] = dimension === 1
                ? Blocks.Netherrack : Blocks.Deepslate;
        }
    }
    for (let row = LEGACY_CHUNK_HEIGHT; row < CHUNK_HEIGHT; row++) {
        const userY = CHUNK_HEIGHT - 1 - row;
        const blockRow = [];
        const wallRow = [];
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            const worldX = chunkX + x;
            let block = dimension === 1 ? Blocks.Netherrack
                : dimension === 2 ? Blocks.Air : undergroundRockAt(worldX, userY);
            if (dimension === 0 && userY > 1) {
                const cell = caveCellAt(worldX, userY, 206, columns[x]);
                if (cell === "air") block = Blocks.Air;
                else if (cell === "water") block = Blocks.Water;
                else if (cell === "lava") block = Blocks.Lava;
                else block = oreBlockAt(worldX, userY, 206, false, false) ?? block;
            }
            if (dimension !== 2 && userY <= 1) block = Blocks.Bedrock;
            blockRow.push(block);
            wallRow.push(dimension === 1 ? Blocks.Netherrack
                : dimension === 2 ? Blocks.Air : undergroundRockAt(worldX, userY));
        }
        expandedBlocks.push(blockRow);
        expandedWalls.push(wallRow);
    }
    return { ...chunk, blocks: expandedBlocks, walls: expandedWalls };
}
