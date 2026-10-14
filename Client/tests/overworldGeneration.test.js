import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import tooloud from "../../Shared/tooloud.js";
import { Noise } from "../../Shared/noise.js";
import { perlinSeed } from "../../Shared/seed.js";
import { Blocks, blockMap } from "../../Shared/blocks.js";
import { Items, itemMap } from "../../Shared/items.js";
import { OverworldBiomes, resolveBiome } from "../../Shared/biome.js";
import { mountainBiomeAt, miningElevation, undergroundBiomeAt, normalizeClimate, savedWorldgenVersion } from "../../Shared/overworldGeneration.js";
import { terrainHeightAt } from "../../Shared/terrainHeight.js";
import { oreAbundance, oreBlockAt, undergroundRockAt } from "../../Shared/oreGeneration.js";
import { caveColumnAt, caveCellAt } from "../../Shared/caves.js";
import { caveDecorationAt } from "../../Shared/caveDecorations.js";
import { hasBlockLightAt } from "../../Shared/mobSpawning.js";

const noises = () => ({ continentalness: new Noise(6,18,0), erosion: new Noise(12,12,0),
    peaks: new Noise(22,20,0), heightDetail: new Noise(55,6,0),
    temperature: new Noise(60,1,0.5), wetness: new Noise(60,1,0.5) });

test("mountain biomes follow height and climate; legacy versions remain distinct", () => {
    assert.deepEqual([undefined, 1, 2, 3, 4, 5].map(savedWorldgenVersion), [1, 1, 2, 3, 4, 5]);
    const base = { height: 172, temperature: 0.3, wetness: 0.6, peaks: 0.8 };
    assert.equal(mountainBiomeAt(base), "JaggedPeaks");
    assert.equal(mountainBiomeAt({ ...base, peaks: 0.6 }), "FrozenPeaks");
    assert.equal(mountainBiomeAt({ ...base, temperature: 0.7 }), "Mountain");
    assert.equal(mountainBiomeAt({ ...base, height: 162 }), "Grove");
    assert.equal(mountainBiomeAt({ ...base, height: 162, wetness: 0.3 }), "SnowySlopes");
    assert.equal(mountainBiomeAt({ ...base, height: 162, temperature: 0.6 }), "Meadow");
    assert.equal(mountainBiomeAt({ ...base, height: 149 }), null);
    for (const key of ["FrozenPeaks", "JaggedPeaks", "SnowySlopes"]) {
        assert.equal(resolveBiome(OverworldBiomes, OverworldBiomes[key].name), OverworldBiomes[key]);
    }
});

test("real seeds produce all mountain biomes while retaining building headroom", () => {
    const n = noises();
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        const found = new Set();
        for (let x = -8192; x < 8192; x += 16) {
            const height = terrainHeightAt(x, null, n, false, 5);
            assert.ok(height > 1 && height <= 238);
            found.add(mountainBiomeAt({ height,
                temperature: normalizeClimate(n.temperature.getNoise(x / 64, 20000), n.temperature),
                wetness: normalizeClimate(n.wetness.getNoise(x / 64, 10000), n.wetness),
                peaks: normalizeClimate(n.peaks.getNoise(x / 4, 20000), n.peaks) }));
            assert.equal(height, terrainHeightAt(x, () => OverworldBiomes.Desert, n, false, 5));
        }
        assert.ok(found.has("Mountain") || found.has("FrozenPeaks"),
            `mountain terrain absent for ${seed}`);
        assert.ok(found.has("Grove") || found.has("SnowySlopes") || found.has("Meadow"),
            `mountain foothills absent for ${seed}`);
    }
});

test("ore bands reward different mining heights and dripstone copper", () => {
    assert.equal(miningElevation(0), -64);
    assert.equal(miningElevation(150), 63);
    assert.equal(oreAbundance("coal", -20), 0);
    assert.equal(oreAbundance("diamond", 30), 0);
    assert.ok(oreAbundance("diamond", -55) > oreAbundance("diamond", -10));
    assert.ok(oreAbundance("iron", 16) > oreAbundance("iron", 65));
    assert.ok(oreAbundance("iron", 180) > oreAbundance("iron", 90));
    assert.ok(oreAbundance("copper", 48, false, true) > oreAbundance("copper", 48));
    assert.equal(oreAbundance("emerald", 100, false), 0);
    assert.ok(oreAbundance("emerald", 100, true) > 0);
    tooloud.Perlin.setSeed(1847);
    assert.equal(undergroundRockAt(0, 5), Blocks.Deepslate);
    assert.equal(undergroundRockAt(0, 100), Blocks.Stone);
});

test("ore generation produces all ores and vein host rocks, with safe boundaries", () => {
    tooloud.Perlin.setSeed(1847);
    const found = new Set();
    for (let x = -2048; x < 2048; x++) {
        assert.equal(oreBlockAt(x, 1, 90, true), null);
        assert.equal(oreBlockAt(x, 89, 90, true), null);
        for (let y = 2; y < 86; y++) {
            const ore = oreBlockAt(x, y, 90, true);
            if (ore !== null) { assert.ok(blockMap.has(ore)); found.add(ore); }
        }
    }
    for (const ore of [Blocks.CoalOre, Blocks.IronOre, Blocks.CopperOre,
        Blocks.DeepslateDiamondOre, Blocks.DeepslateRedstoneOre,
        Blocks.DeepslateGoldOre, Blocks.LapisOre, Blocks.EmeraldOre,
        Blocks.RawIronBlock, Blocks.RawCopperBlock, Blocks.Tuff, Blocks.Granite]) {
        assert.ok(found.has(ore), `missing ore/vein material ${ore}`);
    }
});

test("cave biomes vary with depth, decorate real cavities, and preserve bedrock", () => {
    tooloud.Perlin.setSeed(1847);
    const found = new Set();
    const decorations = new Set();
    let verticallyLayered = false;
    const columns = new Map();
    const sample = (x,y) => {
        if (!columns.has(x)) columns.set(x, caveColumnAt(x, 1847, 0, 4));
        return caveCellAt(x,y,200,columns.get(x));
    };
    for (let x = -1024; x < 1024; x++) {
        verticallyLayered ||= undergroundBiomeAt(x,20,200) !== undergroundBiomeAt(x,120,200);
        assert.equal(undergroundBiomeAt(x,1,200), null);
        assert.equal(undergroundBiomeAt(x,199,200), null);
        for (let y = 3; y < 192; y++) {
            found.add(undergroundBiomeAt(x,y,200));
            const decor = caveDecorationAt(x,y,200,sample);
            if (decor !== null) decorations.add(decor);
        }
    }
    assert.ok(verticallyLayered);
    assert.ok(found.has("lush_caves") && found.has("dripstone_caves") && found.has(null));
    for (const block of [Blocks.MossBlock, Blocks.Clay, Blocks.CaveVines,
        Blocks.DripstoneBlock, Blocks.PointedDripstone, Blocks.HangingDripstone]) {
        assert.ok(decorations.has(block), `missing cave decoration ${block}`);
    }
});

test("local aquifers include dry, lake and flooded chambers across chunk borders", () => {
    tooloud.Perlin.setSeed(9001);
    let dry = 0, lake = 0, flooded = 0;
    const rooms = new Map();
    for (let x = -4096; x < 4096; x += 16) {
        for (const room of caveColumnAt(x,9001,0,3).caverns) rooms.set(room.cellIndex,room);
    }
    for (const room of rooms.values()) {
        if (!room.lake) dry++;
        else if (room.fluid === "water" && room.waterLevel > room.centerY + room.radiusY) flooded++;
        else lake++;
    }
    assert.ok(dry > 0 && lake > 0 && flooded > 0);
    const sample = x => Array.from({length:60},(_,y) => caveCellAt(x,y,65,caveColumnAt(x,9001,0,3)));
    const xs = Array.from({length:64},(_,i) => i-32);
    assert.deepEqual(xs.map(sample), xs.toReversed().map(sample).reverse());
});

test("even dim block light prevents spawning, but opaque barriers block it", () => {
    const air = { emission: 0, opaque: false };
    assert.equal(hasBlockLightAt(0,0,() => air), false);
    assert.equal(hasBlockLightAt(0,0,(x,y) => x === 0 && y === 0 ? {emission:1} : air), true);
    assert.equal(hasBlockLightAt(0,0,(x,y) => x === 12 && y === 0 ? {emission:14} : air), true);
    assert.equal(hasBlockLightAt(0,0,(x,y) => x === 15 && y === 0 ? {emission:14} : air), false);
    assert.equal(hasBlockLightAt(0,0,(x,y) => x === 1 ? {opaque:true,emission:0}
        : x === 2 && y === 0 ? {emission:14} : air), false);
});

test("new materials have textures, usable drops, and copper smelting", () => {
    for (const [id, block] of blockMap) {
        if (id < 950 || id > 976) continue;
        assert.ok(fs.existsSync(new URL(`../Assets/sprites/blocks/${block.sprite}.png`, import.meta.url)), block.sprite);
        if (block.dropItem != null) assert.ok(itemMap.has(block.dropItem), block.name);
        if (block.dropBlock != null) assert.ok(blockMap.has(block.dropBlock), block.name);
    }
    assert.equal(itemMap.get(Items.RawCopper).smeltOutput.itemId, Items.CopperIngot);
    assert.equal(itemMap.get(Items.RawIron).smeltOutput.itemId, Items.IronIngot);
    assert.equal(blockMap.get(Blocks.CaveVines).lightLevel, 14);
});
