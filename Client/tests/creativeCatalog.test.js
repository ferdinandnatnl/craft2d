import assert from "node:assert/strict";
import test from "node:test";
import { CREATIVE_TABS, canUseAsWallpaper, creativeCategory, creativeMatchesSearch } from "../Assets/game/creativeCatalog.js";
import { Blocks, blockMap } from "../../Shared/blocks.js";

test("creative categories give common blocks and items a visible tab", () => {
    const visibleTabs = new Set(CREATIVE_TABS.map(({ id }) => id));
    for (const [key, definition, isBlock, expected] of [
        ["Stone", {}, true, "building"],
        ["FlowerTulipRed", {}, true, "decoration"],
        ["RedstoneLamp", {}, true, "redstone"],
        ["IronPickaxe", { toolType: 1 }, false, "tools"],
        ["IronSword", { toolType: 6 }, false, "tools"],
        ["Apple", { foodValue: 4 }, false, "food"],
        ["Diamond", {}, false, "food"],
    ]) {
        const category = creativeCategory(key, definition, isBlock);
        assert.equal(category, expected);
        assert.ok(visibleTabs.has(category));
    }
});

test("creative search ignores case and surrounding spaces", () => {
    assert.equal(creativeMatchesSearch("Grass Block", " grass "), true);
    assert.equal(creativeMatchesSearch("Grass Block", "stone"), false);
});

test("textured blocks remain eligible for wallpaper in the building tab", () => {
    assert.ok(CREATIVE_TABS.some(tab => tab.id === "building"));
    for (const id of [Blocks.Stone, Blocks.Glass, Blocks.Water, Blocks.Torch,
        Blocks.FlowerTulipRed, Blocks.Chest, Blocks.Fire]) {
        assert.equal(canUseAsWallpaper(blockMap.get(id)), true);
    }
    assert.equal(canUseAsWallpaper(blockMap.get(Blocks.Air)), false);
    assert.equal(canUseAsWallpaper(blockMap.get(Blocks.StructureAir)), false);
});
