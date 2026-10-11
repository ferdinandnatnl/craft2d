import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { syncSliceCamera } from "../Assets/rendering/projection.js";
import { terrainColumnFaces, scenerySeed } from "../Assets/rendering/heightfield.js";

test("perspective front faces stay on the break/place grid at every viewport edge", () => {
    for (const [width, height] of [[1920, 1080], [800, 1000], [390, 844], [844, 390]]) {
        for (const offset of [{ x: 0, y: 0 }, { x: -963.75, y: 2911.125 }, { x: 18273, y: 6000 }]) {
            const camera = new PerspectiveCamera(72, 1, 0.1, 190);
            syncSliceCamera(camera, offset, width, height, 64);
            for (const [screenX, screenY] of [[0, 0], [width, height], [width / 2, height / 2], [17.25, 301.5]]) {
                const point = new Vector3((offset.x + screenX) / 64, -(offset.y + screenY) / 64, 0.5);
                const projected = point.clone().project(camera);
                assert.ok(Math.abs((projected.x + 1) * width / 2 - screenX) < 1e-8);
                assert.ok(Math.abs((1 - projected.y) * height / 2 - screenY) < 1e-8);
                const restored = projected.unproject(camera);
                assert.ok(restored.distanceTo(point) < 1e-8);
            }
        }
    }
});

test("background blocks recede while the gameplay plane retains its scale", () => {
    const camera = new PerspectiveCamera(72, 1, 0.1, 190);
    syncSliceCamera(camera, { x: -960, y: -540 }, 1920, 1080, 64);
    const front = new Vector3(1, 1, 0.5).project(camera);
    const back = new Vector3(1, 1, -10).project(camera);
    assert.ok(Math.abs(back.x) < Math.abs(front.x));
    assert.ok(Math.abs(back.y) < Math.abs(front.y));
});

test("uneven terrain has no open seams in any slope direction", () => {
    const floor = -3;
    const heights = [[2,0,3,1], [1,4,0,2], [3,1,2,0], [0,2,1,3]];
    const heightAt = (x, z) => heights[z + 2]?.[x + 2] ?? floor;
    const edges = new Map();
    const add = (corners) => {
        for (let i = 0; i < corners.length; i++) {
            const key = [corners[i].join(","), corners[(i + 1) % corners.length].join(",")].sort().join("|");
            edges.set(key, (edges.get(key) || 0) + 1);
        }
    };
    for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) {
        for (const face of terrainColumnFaces(x, z, heightAt, floor)) {
            add(face.corners);
            const [a,b,c] = face.corners.map(point => new Vector3(...point));
            const normal = b.sub(a).cross(c.sub(a)).normalize();
            assert.ok(normal.dot(new Vector3(...face.normal)) > 0.99, "face winding points outward");
        }
        // Close the unseen underside for an edge-incidence audit.
        add([[x,floor,-z-0.5],[x+1,floor,-z-0.5],[x+1,floor,-z+0.5],[x,floor,-z+0.5]]);
    }
    for (const [edge, count] of edges) assert.equal(count % 2, 0, `open terrain edge: ${edge}`);
});

test("numeric and text seeds produce stable, finite scenery choices", () => {
    for (const seed of [0, "0", 9001, "forest", "swamp", "a new world", "世界"]) {
        const value = scenerySeed(seed);
        assert.ok(Number.isFinite(value));
        assert.equal(value, scenerySeed(seed));
        assert.ok(value >= 0 && value < 10007);
    }
    assert.equal(scenerySeed(9001), scenerySeed("9001"));
    assert.notEqual(scenerySeed("forest"), scenerySeed("swamp"));
});
