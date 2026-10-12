import test from "node:test";
import assert from "node:assert/strict";
import { findAStarPath } from "../Assets/entities/minions/astar.js";

test("minion A* finds a route around a blocked cell", () => {
    const blocked = new Set(["1,0", "1,1", "1,-1"]);
    const neighbors = (node) => [
        { x: node.x - 1, y: node.y },
        { x: node.x + 1, y: node.y },
        { x: node.x, y: node.y - 1 },
        { x: node.x, y: node.y + 1 },
    ].filter((next) => Math.abs(next.x) <= 4 && Math.abs(next.y) <= 4 &&
        !blocked.has(`${next.x},${next.y}`));

    const path = findAStarPath({ x: 0, y: 0 }, { x: 3, y: 0 }, { neighbors });

    assert.ok(path);
    assert.deepEqual(path[0], { x: 0, y: 0 });
    assert.deepEqual(path.at(-1), { x: 3, y: 0 });
    assert.ok(path.every((node) => !blocked.has(`${node.x},${node.y}`)));
});

test("minion A* chooses the lower-cost route", () => {
    const neighbors = (node) => {
        if (node.x === 0 && node.y === 0) {
            return [
                { node: { x: 1, y: 0 }, cost: 10 },
                { node: { x: 0, y: 1 }, cost: 1 },
            ];
        }
        if (node.x === 0 && node.y === 1) {
            return [{ node: { x: 1, y: 0 }, cost: 1 }];
        }
        if (node.x === 1 && node.y === 0) {
            return [{ node: { x: 2, y: 0 }, cost: 1 }];
        }
        return [];
    };

    const path = findAStarPath({ x: 0, y: 0 }, { x: 2, y: 0 }, { neighbors });

    assert.deepEqual(path, [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
    ]);
});

test("minion A* stops at its node budget when no route exists", () => {
    const path = findAStarPath(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { neighbors: (node) => [{ x: node.x + 1, y: node.y }], maxVisited: 8 },
    );

    assert.equal(path, null);
});
