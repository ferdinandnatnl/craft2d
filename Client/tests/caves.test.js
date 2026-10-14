import { LEGACY_DEPTH_SHIFT } from "../../Shared/overworldGeneration.js";
import test from "node:test";
import assert from "node:assert/strict";
import tooloud from "../../Shared/tooloud.js";
import { perlinSeed } from "../../Shared/seed.js";
import { caveCellAt, caveColumnAt } from "../../Shared/caves.js";

test("caves are stable across chunk borders and generation order", () => {
    tooloud.Perlin.setSeed(1847);
    const sample = (chunk) => Array.from({ length: 16 }, (_, localX) => {
        const worldX = chunk * 16 + localX;
        const rooms = caveColumnAt(worldX);
        return Array.from({ length: 54 }, (_, y) =>
            caveCellAt(worldX, y + 2 + LEGACY_DEPTH_SHIFT, 55 + LEGACY_DEPTH_SHIFT, rooms));
    });
    const forward = [-2, -1, 0, 1, 2].map(sample);
    const reverse = [2, 1, 0, -1, -2].map(sample).reverse();
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward.flat(), Array.from({ length: 80 }, (_, x) => {
        const worldX = x - 32;
        return Array.from({ length: 54 }, (_, y) =>
            caveCellAt(worldX, y + 2 + LEGACY_DEPTH_SHIFT, 55 + LEGACY_DEPTH_SHIFT));
    }));
});

test("caves favor narrow tunnels over tall open chambers", () => {
    for (const seed of [1847, 9001, "forest", 42, 12345]) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        let open = 0;
        let tallOpen = 0;
        let entrances = 0;
        let chambers = 0;
        const rooms = new Map();
        for (let x = -1024; x < 1024; x++) {
            const column = caveColumnAt(x, seed);
            for (const room of column.caverns) rooms.set(room.cellIndex, room);
            if (caveCellAt(x, 55 + LEGACY_DEPTH_SHIFT, 55 + LEGACY_DEPTH_SHIFT, column) === "air") entrances++;
            let height = 0;
            for (let y = 2 + LEGACY_DEPTH_SHIFT; y <= 55 + LEGACY_DEPTH_SHIFT; y++) {
                const cell = caveCellAt(x, y, 55 + LEGACY_DEPTH_SHIFT, column);
                if (cell !== "solid") {
                    open++;
                    height++;
                } else {
                    if (height >= 12) { tallOpen += height; chambers++; }
                    height = 0;
                }
            }
            if (height >= 12) tallOpen += height;
            assert.equal(caveCellAt(x, 1, 55, column), "solid");
            assert.equal(caveCellAt(x, 56 + LEGACY_DEPTH_SHIFT, 55 + LEGACY_DEPTH_SHIFT, column), "solid");
        }
        const area = 2048 * 54;
        assert.ok(open / area > 0.12 && open / area < 0.25,
            `cave density outside tunnel-dominant range for ${seed}`);
        assert.ok(tallOpen / area < 0.06,
            `too much tall open space for ${seed}`);
        assert.ok(chambers > 0, `occasional chambers missing for ${seed}`);
        assert.ok([...rooms.values()].filter(room => room.style === "cheese").length <
            rooms.size / 3, `broad chambers too common for ${seed}`);
        assert.ok(entrances >= 1 && entrances < 40,
            `surface entrances should be sparse for ${seed}`);
    }
});

test("connecting passages retain player clearance below the surface cap", () => {
    tooloud.Perlin.setSeed(1847);
    for (let x = -1024; x < 1024; x++) {
        const column = caveColumnAt(x);
        if (!column.passage) continue;
        const y = Math.floor(column.passage.y);
        for (const surface of [35, 55, 85].map(value => value + LEGACY_DEPTH_SHIFT)) {
            if (y < 4 || y + 1 > surface - 8) continue;
            assert.notEqual(caveCellAt(x, y, surface, column), "solid");
            assert.notEqual(caveCellAt(x, y + 1, surface, column), "solid");
        }
    }
});

test("deep chambers mix water and lava without flooding shallow caves", () => {
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(perlinSeed(seed));
        let water = 0;
        let lava = 0;
        for (let x = -4096; x < 4096; x++) {
            const column = caveColumnAt(x);
            for (let y = 2 + LEGACY_DEPTH_SHIFT; y < 55 + LEGACY_DEPTH_SHIFT; y++) {
                const cell = caveCellAt(x, y, 55 + LEGACY_DEPTH_SHIFT, column);
                if (cell === "water") water++;
                if (cell === "lava") {
                    lava++;
                    assert.ok(y < 33 + LEGACY_DEPTH_SHIFT, `lava reached shallow cave at ${x}, ${y}`);
                }
            }
        }
        assert.ok(water > 100, `water lakes missing for seed ${seed}`);
        assert.ok(lava > 50, `lava pools missing for seed ${seed}`);
    }
});
