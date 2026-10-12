import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { href: "http://localhost/game.html" },
    AudioContext: class {},
};
globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {},
};
globalThis.localStorage = { getItem: () => null };
globalThis.Image = class {};

const { Blocks } = await import("../../Shared/blocks.js");
const { BLOCK_SIZE } = await import("../Assets/utils/globals.js");
const { findMinionPath } = await import("../Assets/entities/minions/pathfinding.js");

function makeFlatWorld({ minX = -4, maxX = 8, floorY = 8, gaps = [], obstacles = [] } = {}) {
    const missingFloor = new Set(gaps.map((x) => `${x},${floorY}`));
    const solid = new Set(obstacles.map(({ x, y }) => `${x},${y}`));
    return {
        getBlockAtWorldPosition(worldX, worldY) {
            const x = Math.floor(worldX / BLOCK_SIZE);
            const y = Math.floor(worldY / BLOCK_SIZE);
            if (x < minX || x > maxX || y < 0 || y >= 110) return null;
            if (solid.has(`${x},${y}`)) return { blockType: Blocks.Stone };
            if (y === floorY && !missingFloor.has(`${x},${y}`)) {
                return { blockType: Blocks.Stone };
            }
            return { blockType: Blocks.Air };
        },
    };
}

test("terrain A* routes across a flat floor", () => {
    const path = findMinionPath(
        makeFlatWorld(),
        0,
        { x: 0, y: 8 },
        { x: 5, y: 8 },
    );

    assert.ok(path);
    assert.deepEqual(path[0], { x: 0, y: 8 });
    assert.deepEqual(path.at(-1), { x: 5, y: 8 });
});

test("terrain A* can route around a breakable obstacle", () => {
    const path = findMinionPath(
        makeFlatWorld({ obstacles: [{ x: 2, y: 6 }] }),
        0,
        { x: 0, y: 8 },
        { x: 5, y: 8 },
    );

    assert.ok(path);
    assert.deepEqual(path.at(-1), { x: 5, y: 8 });
});

test("terrain A* refuses a gap wider than its one-step descent limit", () => {
    const path = findMinionPath(
        makeFlatWorld({ gaps: [1, 2, 3] }),
        0,
        { x: 0, y: 8 },
        { x: 4, y: 8 },
        250,
    );

    assert.equal(path, null);
});
