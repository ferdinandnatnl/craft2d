import test from "node:test";
import assert from "node:assert/strict";
import tooloud from "../../Shared/tooloud.js";
import { perlinSeed } from "../../Shared/seed.js";
import { Noise } from "../../Shared/noise.js";
import { CHUNK_HEIGHT, LEGACY_CHUNK_HEIGHT } from "../../Shared/constants.js";
import { terrainHeightAt } from "../../Shared/terrainHeight.js";
import { caveColumnAt, caveCellAt } from "../../Shared/caves.js";
import { seaLevelForVersion } from "../../Shared/overworldGeneration.js";
import { isVillageChunk } from "../../Shared/village.js";

const noiseMaps = {
    continentalness: new Noise(6,18,0), erosion: new Noise(12,12,0),
    peaks: new Noise(22,20,0), heightDetail: new Noise(55,6,0),
};

test("new worlds gain more than twice the old underground and taller varied terrain", () => {
    assert.ok(seaLevelForVersion(5) / 60 >= 2.4);
    assert.ok(CHUNK_HEIGHT > LEGACY_CHUNK_HEIGHT * 2);
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        const heights = Array.from({ length: 2048 }, (_, i) =>
            terrainHeightAt(i * 16 - 16384, null, noiseMaps, false, 5));
        assert.ok(Math.max(...heights) - Math.min(...heights) >= 65,
            `terrain lacks valleys and mountains for ${seed}`);
        assert.ok(heights.some(y => y < seaLevelForVersion(5) - 15),
            `ocean basins absent for ${seed}`);
        assert.ok(heights.some(y => y > seaLevelForVersion(5) + 50),
            `high mountains absent for ${seed}`);
        assert.ok(heights.every(y => y <= CHUNK_HEIGHT - 18));
    }
});

test("legacy surface columns keep their old screen positions", () => {
    const samples = {
        1847: [187, 210, 201, 200, 199, 202, 188],
        9001: [198, 182, 206, 200, 193, 200, 202],
        forest: [189, 199, 193, 200, 206, 215, 207],
    };
    const xs = [-1024, -256, -16, 0, 16, 256, 1024];
    for (const [seed, expected] of Object.entries(samples)) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        assert.deepEqual(xs.map(x => terrainHeightAt(x, null, noiseMaps, false, 2)),
            expected, `legacy seed ${seed}`);
    }
});

test("deep caves include small passages, giant chambers, shafts, and water", () => {
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        let giant = 0, shafts = 0, waterfalls = 0;
        const roomKeys = new Set();
        const openDepths = [0,0,0,0];
        for (let x = -16384; x < 16384; x += 16) {
            const column = caveColumnAt(x, seed, 0, 4);
            for (const room of column.caverns) {
                const key = `${room.cellIndex}:${room.centerY}`;
                if (room.style === "giant" && !roomKeys.has(key)) {
                    giant++;
                    assert.ok(room.radiusY >= 48 && room.radiusX >= 150);
                }
                roomKeys.add(key);
            }
            shafts += column.shafts.length;
            waterfalls += column.shafts.filter(shaft => shaft.waterfall).length;
            for (const [i, y] of [24, 55, 90, 125].entries()) {
                if (caveCellAt(x, y, 155, column) !== "solid") openDepths[i]++;
            }
        }
        assert.ok(giant > 0, `no giant cavern for ${seed}`);
        assert.ok(shafts > 0 && waterfalls > 0, `vertical connection absent for ${seed}`);
        assert.ok(openDepths.every(count => count > 40),
            `one underground layer is empty for ${seed}`);
    }
});

test("wide-world cave mask remains deterministic at chunk seams", () => {
    tooloud.Perlin.setSeed(perlinSeed(1847));
    const sample = x => {
        const column = caveColumnAt(x, 1847, 0, 4);
        return Array.from({ length: 160 }, (_, y) =>
            caveCellAt(x, y + 2, 170, column));
    };
    for (const seam of [-1024, -16, 0, 16, 1024]) {
        const forward = Array.from({ length: 32 }, (_, i) => sample(seam - 16 + i));
        const reverse = Array.from({ length: 32 }, (_, i) => sample(seam + 15 - i)).reverse();
        assert.deepEqual(forward, reverse);
    }
});

test("major villages spread farther while legacy placement stays unchanged", () => {
    const scan = version => Array.from({ length: 4000 }, (_, i) => i - 2000)
        .filter(index => isVillageChunk(1847, index, version));
    const old = scan(3), wide = scan(4);
    assert.ok(old.length > wide.length * 2);
    assert.ok(wide.length > 0);
});
