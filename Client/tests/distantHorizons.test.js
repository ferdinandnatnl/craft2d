import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
    getDistantLodDepth,
    getDistantLodStep,
    sampleDistantLodCell,
} from "../Assets/rendering/distantTerrainLod.js";

test("distant chunk detail decreases by powers of two with distance", () => {
    assert.equal(getDistantLodStep(0), 1);
    assert.equal(getDistantLodStep(1), 1);
    assert.equal(getDistantLodStep(2), 2);
    assert.equal(getDistantLodStep(3), 2);
    assert.equal(getDistantLodStep(4), 4);
    assert.equal(getDistantLodStep(8), 8);
    assert.equal(getDistantLodStep(32), 16);
});

test("downsampled terrain cells keep their dominant saved block and omit sparse noise", () => {
    const blocks = [
        [{ blockType: 1 }, { blockType: 1 }, { blockType: 2 }, null],
        [{ blockType: 1 }, { blockType: 1 }, { blockType: 2 }, null],
        [{ blockType: 0 }, { blockType: 0 }, { blockType: 0 }, { blockType: 3 }],
        [{ blockType: 0 }, { blockType: 0 }, { blockType: 0 }, { blockType: 0 }],
    ];
    const isAir = block => block.blockType === 0;

    const solidCell = sampleDistantLodCell(blocks, 0, 0, 2, isAir);
    assert.equal(solidCell.block.blockType, 1);
    assert.equal(solidCell.coverage, 1);

    const sparseGrid = Array.from({ length: 4 }, () => Array(4).fill(null));
    sparseGrid[2][3] = { blockType: 3 };
    assert.equal(sampleDistantLodCell(sparseGrid, 0, 0, 4, isAir), null);
});

test("distant panels use world depth proportional to explored chunk distance", () => {
    assert.equal(getDistantLodDepth(0), 0);
    assert.equal(getDistantLodDepth(4), 57.6);
    assert.ok(getDistantLodDepth(8) > getDistantLodDepth(4));
});

test("block changes can invalidate an explored chunk's cached LOD", async () => {
    globalThis.window = {
        location: { href: "http://localhost/game.html" },
        AudioContext: class {},
        addEventListener() {},
    };
    globalThis.document = {
        getElementById: () => null,
        querySelector: () => null,
        createElement: () => ({}),
        addEventListener() {},
        removeEventListener() {},
    };
    globalThis.Audio = class {};
    globalThis.Image = class {};
    globalThis.localStorage = { getItem: () => null };

    const [{ Block }, dimensionState] = await Promise.all([
        import("../Assets/world/block.js"),
        import("../Assets/world/dimensionState.js"),
    ]);
    const chunk = { revision: 7 };
    dimensionState.setDimensions([{ chunks: new Map([[0, chunk]]) }]);
    const block = Object.create(Block.prototype);
    block.dimensionIndex = 0;
    block.chunkX = 0;

    block.markChunkDirty();
    assert.equal(chunk.revision, 8);

    const { VoxelRenderer } = await import("../Assets/rendering/voxelRenderer.js");
    const renderer = new VoxelRenderer(null);
    const materialEntries = new Map();
    renderer.materials = {
        get(sprite, options) {
            const key = `${sprite}:${JSON.stringify(options)}`;
            if (!materialEntries.has(key)) {
                materialEntries.set(key, {
                    material: new THREE.MeshBasicMaterial({
                        transparent: Boolean(options.fluid),
                    }),
                });
            }
            return materialEntries.get(key);
        },
    };
    const sampleBlock = {
        blockType: 1,
        spriteName: "stone",
        lightLevel: 15,
        sunLight: true,
    };
    const airBlock = { blockType: 0, spriteName: "air" };
    const sourceChunk = {
        x: 32 * 64,
        width: 4,
        height: 4,
        revision: 8,
        blocks: Array.from({ length: 4 }, () => Array(4).fill(sampleBlock)),
        walls: Array.from({ length: 4 }, () => Array(4).fill(airBlock)),
    };
    const lod = renderer.buildDistantChunkLod(sourceChunk, 2, 4, true);
    assert.equal(lod.group.children.length, 1);
    assert.ok(lod.group.children[0].geometry.getAttribute("position").count > 0);

    renderer.camera = { position: { x: 8, y: -4, z: 12.5 } };
    renderer.positionDistantLod(lod.group);
    const expectedScale = (12.5 + 1.3) / (12.5 - 0.5);
    assert.ok(Math.abs(lod.group.scale.x - expectedScale) < 1e-9);
    assert.ok(Math.abs(lod.group.position.x - 8 * (1 - expectedScale)) < 1e-9);
    assert.ok(Math.abs(lod.group.position.y - -4 * (1 - expectedScale)) < 1e-9);
    assert.ok(Math.abs(lod.group.position.z - -1.8) < 1e-9);

    sourceChunk.x = 10 * 16 * 64;
    dimensionState.setDimensions([{
        chunks: new Map([[sourceChunk.x, sourceChunk]]),
    }]);
    renderer.camera.position = { x: 8 * 16 + 8, y: -4, z: 12.5 };
    renderer.camera.fov = 72;
    renderer.camera.aspect = 16 / 9;
    renderer.camera.far = 190;
    renderer.scenery = new THREE.Group();
    renderer.sceneryChunks = new Map();
    let lodBuildCount = 0;
    renderer.buildDistantChunkLod = () => {
        lodBuildCount++;
        return { group: new THREE.Group(), water: [] };
    };
    renderer.buildSceneryChunk = () => ({ group: new THREE.Group(), water: [] });
    const world = {
        seed: "lod-world",
        generator: { specialWorldProps: {}, forceToBiome: null },
    };
    renderer.updateScenery(world, 0, true);
    renderer.updateScenery(world, 0, true);
    renderer.updateScenery(world, 0, true);
    const cachedLod = renderer.sceneryChunks.get(10);
    assert.equal(cachedLod.kind, "scenery+lod");
    assert.equal(cachedLod.lodStep, 2);
    assert.equal(lodBuildCount, 1);

    sourceChunk.revision++;
    renderer.updateScenery(world, 0, true);
    assert.equal(lodBuildCount, 2);

    renderer.clearScenery();
    lod.group.traverse(object => object.geometry?.dispose());
    for (const entry of materialEntries.values()) entry.material.dispose();
});
