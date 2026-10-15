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
            const doors = structure.villageEntrances;
            assert.equal(rows.length, 15, `${name}${kind}`);
            assert.ok(rows.every(row => row.length === 16), `${name}${kind}`);
            assert.ok([...rows.flat(), ...structure.walls.flat()].every(Number.isInteger),
                `${name}${kind} has an undefined block`);
            assert.ok(doors.length === 2 && doors[0] < 7 && doors[1] > 8,
                `${name}${kind} needs side entrances`);
            assert.equal(rows[13][doors[0]], rows[13][doors[1]]);
            assert.equal(rows[12][doors[0]], rows[12][doors[1]]);
            assert.equal(rows[12][9], Blocks.StructureAir, `${name}${kind}`);
            assert.notEqual(structure.walls[10][9], Blocks.Glass,
                `${name}${kind} has a centered window`);
            assert.equal(structure.villageGround, structure.biome.secondLayer);
            assert.ok(structure.villagePath !== Blocks.Water);
            profiles.add(rows.slice(0, 10).map(row => row.join(",")).join("|"));
        }
        assert.equal(profiles.size, 4, `${name} buildings share a silhouette`);
        assert.equal(Structures[`${name}Smithy`].blocks[1][3],
            Structures[name].villageFoundation, `${name} smithy needs a chimney`);
        assert.equal(Structures[`${name}BigHouse`].blocks[9][8], Blocks.Ladder);
        assert.equal(Structures[`${name}FarmShack`].walls[13][1], Blocks.Wheat);
        assert.equal(Structures[`${name}FarmShack`].walls[13][2], Blocks.HayBale);
    }

    const cottage = Structures.VillagePlainsCottage;
    const roofSteps = Array.from({ length: 11 }, (_, x) =>
        cottage.blocks.findIndex(row => row[x + 1] === Blocks.OakPlanks));
    assert.ok(new Set(roofSteps).size >= 3, "plains roof needs visible tiers");
    assert.equal(cottage.blocks[10][14], Blocks.Torch, "porch needs a light");
    assert.equal(cottage.walls[12][5], Blocks.FlowerRose,
        "window needs a planter");
});
