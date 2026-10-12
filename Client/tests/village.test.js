import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "../../Shared/blocks.js";
import { Structures } from "../../Shared/structures.js";
import { isVillageChunk } from "../../Shared/village.js";

test("villages have stable, sparse locations that depend on the seed", () => {
    const locations = seed => Array.from({ length: 401 }, (_, i) => i - 200)
        .filter(index => isVillageChunk(seed, index));
    const first = locations("village-a");
    assert.ok(first.length >= 8 && first.length <= 40);
    assert.deepEqual(first, locations("village-a"));
    assert.notDeepEqual(first, locations("village-b"));
});

test("village cottages have roofs, open entrances, rear windows, and a clear lane", () => {
    const rows = Structures.Village.blocks;
    const walls = Structures.Village.walls;
    assert.equal(rows.length, 7);
    assert.ok(rows.every(row => row.length === 16));
    assert.equal(walls.length, rows.length);
    assert.ok(walls.every(row => row.length === 16));
    for (let x = 6; x <= 9; x++) {
        assert.equal(rows[6][x], Blocks.Cobblestone);
        for (const row of rows.slice(0, 6)) {
            assert.equal(row[x], Blocks.StructureAir);
        }
    }
    for (const x of [5, 10]) {
        assert.equal(rows[4][x], Blocks.StructureAir);
        assert.equal(rows[5][x], Blocks.StructureAir);
    }
    assert.equal(rows[0][2], Blocks.SpruceSlab);
    assert.equal(rows[1][1], Blocks.SprucePlanks);
    assert.equal(rows[2][0], Blocks.SprucePlanks);
    assert.equal(rows[6][2], Blocks.OakPlanks);
    assert.equal(rows[6][13], Blocks.OakPlanks);
    assert.equal(walls[4][2], Blocks.Glass);
    assert.equal(walls[4][13], Blocks.Glass);
    assert.equal(rows[4][3], Blocks.Torch);
    assert.equal(rows[4][12], Blocks.Torch);
    assert.equal(rows[5][1], Blocks.CraftingTable);
    assert.equal(rows[5][14], Blocks.Furnace);
});
