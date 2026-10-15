import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "../../Shared/blocks.js";
import { Structures } from "../../Shared/structures.js";
import { VILLAGE_CENTER, VILLAGE_PIECES, isVillageChunk } from "../../Shared/village.js";

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

test("villages use four distinct side-view buildings around a square", () => {
    assert.deepEqual(VILLAGE_PIECES,
        ["Cottage", "Smithy", "Square", "BigHouse", "FarmShack"]);
    assert.equal(VILLAGE_PIECES[VILLAGE_CENTER], "Square");

    for (const name of ["VillagePlains", "VillageDesert", "VillageTaiga",
        "VillageSavanna", "VillageSnowy"]) {
        const profiles = new Set();
        for (const kind of ["Cottage", "Smithy", "BigHouse", "FarmShack"]) {
            const structure = Structures[`${name}${kind}`];
            const rows = structure.blocks;
            const doors = rows[9].flatMap((block, x) =>
                block === Structures[name].blocks[9][3] ? [x] : []);
            assert.equal(rows.length, 11, `${name}${kind}`);
            assert.ok(rows.every(row => row.length === 16), `${name}${kind}`);
            assert.ok([...rows.flat(), ...structure.walls.flat()].every(Number.isInteger),
                `${name}${kind} has an undefined block`);
            assert.ok(doors.length === 2 && doors[0] < 7 && doors[1] > 8,
                `${name}${kind} needs side entrances`);
            assert.equal(rows[7][7], Blocks.StructureAir, `${name}${kind}`);
            assert.notEqual(structure.walls[7][7], Blocks.Glass,
                `${name}${kind} has a centered window`);
            assert.equal(structure.villageGround, structure.biome.secondLayer);
            assert.ok(structure.villagePath !== Blocks.Water);
            profiles.add(rows.slice(0, 7).map(row => row.join(",")).join("|"));
        }
        assert.equal(profiles.size, 4, `${name} buildings share a silhouette`);
        assert.equal(Structures[`${name}Smithy`].blocks[0][11],
            Structures[name].villageFoundation, `${name} smithy needs a chimney`);
        assert.equal(Structures[`${name}BigHouse`].blocks[7][8], Blocks.Ladder);
        assert.equal(Structures[`${name}FarmShack`].walls[8][2], Blocks.HayBale);
    }
});
