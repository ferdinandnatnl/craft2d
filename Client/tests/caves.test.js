import test from "node:test";
import assert from "node:assert/strict";
import tooloud from "../../Shared/tooloud.js";
import { caveCellAt, caveColumnAt } from "../../Shared/caves.js";

test("caves are stable across chunk borders and generation order", () => {
    tooloud.Perlin.setSeed(1847);
    const sample = (chunk) => Array.from({ length: 16 }, (_, localX) => {
        const worldX = chunk * 16 + localX;
        const rooms = caveColumnAt(worldX);
        return Array.from({ length: 54 }, (_, y) =>
            caveCellAt(worldX, y + 2, 55, rooms));
    });
    const forward = [-2, -1, 0, 1, 2].map(sample);
    const reverse = [2, 1, 0, -1, -2].map(sample).reverse();
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward.flat(), Array.from({ length: 80 }, (_, x) => {
        const worldX = x - 32;
        return Array.from({ length: 54 }, (_, y) =>
            caveCellAt(worldX, y + 2, 55));
    }));
});

test("deep caverns have broad spans, lakes, and occasional narrow entrances", () => {
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(seed);
        let widestRoom = 0;
        const currentSpans = Array(56).fill(0);
        let water = 0;
        let entrances = 0;
        for (let x = -512; x < 512; x++) {
            const rooms = caveColumnAt(x);
            if (caveCellAt(x, 55, 55, rooms) === "air") entrances++;
            for (let y = 2; y < 55; y++) {
                const cell = caveCellAt(x, y, 55, rooms);
                if (cell === "water") water++;
                if (y >= 8 && y <= 40) {
                    currentSpans[y] = cell === "air" ? currentSpans[y] + 1 : 0;
                    widestRoom = Math.max(widestRoom, currentSpans[y]);
                }
            }
            assert.equal(caveCellAt(x, 1, 55, rooms), "solid");
            assert.equal(caveCellAt(x, 56, 55, rooms), "solid");
        }
        assert.ok(widestRoom >= 60, `large chamber missing for seed ${seed}`);
        assert.ok(water > 100, `underground lake missing for seed ${seed}`);
        assert.ok(entrances >= 1 && entrances < 30,
            `surface entrances should be sparse for seed ${seed}`);
    }
});

test("deep chambers mix water and lava without flooding shallow caves", () => {
    for (const seed of [1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(seed);
        let water = 0;
        let lava = 0;
        for (let x = -1024; x < 1024; x++) {
            const column = caveColumnAt(x);
            for (let y = 2; y < 55; y++) {
                const cell = caveCellAt(x, y, 55, column);
                if (cell === "water") water++;
                if (cell === "lava") {
                    lava++;
                    assert.ok(y < 33, `lava reached shallow cave at ${x}, ${y}`);
                }
            }
        }
        assert.ok(water > 100, `water lakes missing for seed ${seed}`);
        assert.ok(lava > 50, `lava pools missing for seed ${seed}`);
    }
});
