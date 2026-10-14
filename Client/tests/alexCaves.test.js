import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import {
    ALEX_CAVE_BIOMES,
    alexCaveAccentBlock,
    alexCaveBiomeIsSuitable,
    alexCaveRegionAt,
    caveCellAt,
} from "../../Shared/caves.js";

test("Alex's Caves regions are seeded, spread apart, and respect spawn distance", () => {
    const found = new Set();
    const firstSeed = [];
    const secondSeed = [];
    for (let cell = -20; cell <= 20; cell++) {
        const x = cell * 1200 + 600;
        const region = alexCaveRegionAt(x, 12345, 0);
        const otherSeed = alexCaveRegionAt(x, 54321, 0);
        if (region) {
            found.add(region.biome);
            firstSeed.push([cell, region.biome]);
            assert.ok(Math.abs(region.centerX) >= region.minSpawnDistance);
            assert.ok(Math.abs(x - region.centerX) <= 300);
        }
        if (otherSeed) secondSeed.push([cell, otherSeed.biome]);
    }

    assert.deepEqual([...found].sort(), [...ALEX_CAVE_BIOMES].sort());
    assert.notDeepEqual(firstSeed, secondSeed);
    assert.equal(alexCaveRegionAt(0, 12345, 0), null);
});

test("cave biome selection enforces the source climate and depth ranges", () => {
    assert.equal(alexCaveBiomeIsSuitable("magnetic_caves", {
        continentalness: 0.8,
        depth: 0.4,
    }), true);
    assert.equal(alexCaveBiomeIsSuitable("magnetic_caves", {
        continentalness: 0.1,
        depth: 0.4,
    }), false);
    assert.equal(alexCaveBiomeIsSuitable("abyssal_chasm", {
        continentalness: -0.8,
        temperature: 0.1,
        depth: 0.5,
    }), true);
    assert.equal(alexCaveBiomeIsSuitable("abyssal_chasm", {
        continentalness: 0.8,
        temperature: 0.1,
        depth: 0.5,
    }), false);
});

test("Abyssal Chasm chambers stay flooded and biome accents are stable", () => {
    const abyssalRoom = {
        centerX: 0,
        centerY: 30,
        radiusX: 50,
        radiusY: 20,
        waterLevel: 25,
        lake: false,
        fluid: "lava",
        alexBiome: "abyssal_chasm",
        entrance: false,
    };
    const column = { caverns: [abyssalRoom], passage: null };
    assert.equal(caveCellAt(0, 20, 60, column), "water");

    for (const biome of ALEX_CAVE_BIOMES) {
        let accent = null;
        for (let x = -90; x <= 90 && accent === null; x++) {
            for (let y = 10; y <= 60 && accent === null; y++) {
                accent = alexCaveAccentBlock(biome, 1001, x, y);
            }
        }
        assert.ok(Object.values(Blocks).includes(accent), `${biome} needs a registered block accent`);
        assert.equal(alexCaveAccentBlock(biome, 1001, 12, 24),
            alexCaveAccentBlock(biome, 1001, 12, 24));
    }
});
