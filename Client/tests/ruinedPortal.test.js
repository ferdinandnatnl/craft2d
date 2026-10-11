import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "../../Shared/blocks.js";
import { Items } from "../../Shared/items.js";
import { ChestLoot } from "../../Shared/chestLoot.js";
import { Structures } from "../../Shared/structures.js";
import { isRuinedPortalChunk } from "../../Shared/ruinedPortal.js";
import { findNetherPortalFrame } from "../../Shared/netherPortal.js";

test("ruined portals are sparse and seed dependent", () => {
    const locations = seed => Array.from({ length: 2001 }, (_, i) => i - 1000)
        .filter(index => isRuinedPortalChunk(seed, index));
    const first = locations("overworld-a");
    assert.ok(first.length >= 10 && first.length <= 50, `found ${first.length} in 2001 chunks`);
    assert.deepEqual(first, locations("overworld-a"));
    assert.notDeepEqual(first, locations("overworld-b"));
});

test("ruined frame needs two repairs before flint and steel can light it", () => {
    const rows = Structures.RuinedPortal.blocks;
    const cells = new Map();
    rows.forEach((row, y) => row.forEach((block, x) => cells.set(`${x},${y}`, block)));
    const get = (x, y) => cells.get(`${x},${y}`) ?? Blocks.Air;
    const types = {
        air: [Blocks.Air, Blocks.StructureAir],
        fire: Blocks.Fire,
        obsidian: Blocks.Obsidian,
    };
    cells.set("2,3", Blocks.Fire);
    assert.equal(findNetherPortalFrame(2, 3, get, types), null);
    cells.set("2,0", Blocks.Obsidian);
    cells.set("4,2", Blocks.Obsidian);
    assert.deepEqual(findNetherPortalFrame(2, 3, get, types), {
        left: 1, right: 4, top: 0, bottom: 4,
    });
});

test("ruined portal chest supplies repairs and ignition", () => {
    const loot = ChestLoot.RuinedPortal.items;
    assert.ok(loot.some(item => item.blockId === Blocks.Obsidian &&
        item.maxCount - item.subtract >= 2));
    assert.ok(loot.some(item => item.itemId === Items.FlintAndSteel &&
        item.maxCount - item.subtract >= 1));
    assert.ok(Structures.RuinedPortal.blocks.some(row => row.includes(ChestLoot.RuinedPortal)));
});
