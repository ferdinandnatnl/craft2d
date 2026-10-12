import test from "node:test";
import assert from "node:assert/strict";
import { getAmbientLayers } from "../Assets/game/ambientProfiles.js";

function sounds(context) {
    return getAmbientLayers(context).map(({ sound }) => sound);
}

test("dimension and submerged conditions take priority over surface biomes", () => {
    assert.deepEqual(sounds({
        dimension: "Nether",
        biome: { name: "Forest" },
        underwater: true,
    }), ["suspense/nether.ogg"]);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Forest" },
        underwater: true,
        deepWater: true,
    }), ["water/underwater-deep.ogg"]);
    assert.deepEqual(sounds({
        dimension: "The End",
        biome: { name: "The End" },
    }), ["suspense/end.ogg"]);
});

test("caves replace surface ambience and use water or depth variants", () => {
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Jungle" },
        underground: true,
        nearWater: true,
    }), ["cave/cave-water1.ogg"]);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Forest" },
        underground: true,
        deepCave: true,
    }), ["cave/cave-deep1.ogg"]);
});

test("jungle has no wildlife chirps and forest keeps its leaf ambience", () => {
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Jungle" },
        night: false,
    }), []);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Jungle" },
        night: true,
    }), []);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Flower Forest" },
        night: true,
    }), ["wind/wind-in-leaves.ogg"]);
});

test("desert, swamp, shore, and high-air contexts use their own layers", () => {
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Desert" },
    }), ["animals/cicadas/cicadas-desert1.ogg", "wind/light-wind.ogg"]);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Swamp" },
    }), ["animals/frog/frog1.ogg"]);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Ocean" },
    }), ["water/ocean.ogg"]);
    assert.deepEqual(sounds({
        dimension: "Overworld",
        biome: { name: "Plains" },
        nearWater: true,
        inAir: true,
    }), [
        "water/beach.ogg",
        "wind/heavy-wind2.ogg",
    ]);
});
