import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { href: "http://localhost/game.html" },
    AudioContext: class {},
    addEventListener() {},
};
globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ getContext: () => ({}) }),
    addEventListener() {},
};
globalThis.localStorage = { getItem: () => null };
globalThis.Image = class {};

const { VoxelEntities } = await import("../Assets/rendering/entities.js");

test("voxel minions use the original model boxes and atlas regions", () => {
    const scene = { children: [], add(child) { this.children.push(child); } };
    const renderer = new VoxelEntities(scene);
    const image = {
        complete: true,
        naturalWidth: 64,
        width: 64,
        height: 32,
        src: "minion/as_entityminion.png",
    };
    const record = renderer.create({
        isMinion: true,
        body: { image, sprite: "minion/as_entityminion", parts: {} },
    });

    assert.equal(record.minionModel, true);
    assert.equal(scene.children[0], record.group);
    assert.deepEqual(
        record.group.children.map((joint) => joint.children[0].name),
        ["head", "torso", "rightLeg", "leftLeg", "rightArm", "leftArm", "backpack"],
    );
    assert.deepEqual(
        [
            record.pivots.head.children[0].geometry.parameters.width,
            record.pivots.head.children[0].geometry.parameters.height,
            record.pivots.head.children[0].geometry.parameters.depth,
        ],
        [6 / 16, 5 / 16, 4 / 16],
    );
    assert.equal(record.pivots.torso.position.y, 10 / 16);
    assert.equal(record.pivots.rightLeg.position.y, 12 / 16);
    assert.equal(record.pivots.rightArm.position.x, -5 / 16);
    assert.equal(record.pivots.backpack.rotation.x, -0.7853982);

    const torsoUv = record.pivots.torso.children[0].geometry.attributes.uv;
    const frontFace = Array.from({ length: 4 }, (_, index) => [
        torsoUv.getX(16 + index),
        torsoUv.getY(16 + index),
    ]);
    assert.deepEqual(
        [
            Math.min(...frontFace.map(([u]) => u)),
            Math.max(...frontFace.map(([u]) => u)),
            Math.min(...frontFace.map(([, v]) => v)),
            Math.max(...frontFace.map(([, v]) => v)),
        ],
        [26 / 64, 34 / 64, 1 - 12 / 32, 1 - 4 / 32],
    );
});

test("voxel minions animate while walking and chopping", () => {
    const scene = { children: [], add(child) { this.children.push(child); } };
    const renderer = new VoxelEntities(scene);
    const image = {
        complete: true,
        naturalWidth: 64,
        width: 64,
        height: 32,
        src: "minion/as_entityminion.png",
    };
    const entity = {
        isMinion: true,
        dimension: 0,
        position: { x: 0, y: 0 },
        velocity: { x: 96 },
        hitbox: { x: 32, y: 86 },
        direction: 1,
        lookDirection: 0,
        walkAnimationPhase: 1.2,
        walkAnimationAmount: 0.6,
        body: { image, sprite: "minion/as_entityminion", parts: {} },
    };
    const camera = { position: { x: 0 } };

    renderer.update([entity], 0, camera, 0.1, false);
    const record = renderer.models.get(entity);
    const limbPhase = 1.2 * 0.6662;
    const stride = Math.cos(limbPhase) * 1.4 * 0.6;
    assert.ok(Math.abs(record.pivots.rightLeg.rotation.x + stride) < 1e-8);
    assert.ok(Math.abs(record.pivots.leftLeg.rotation.x - stride) < 1e-8);
    assert.ok(Math.abs(
        record.pivots.rightArm.rotation.x + Math.cos(limbPhase + Math.PI) * 0.6 +
            Math.sin(0.1 * 20 * 0.067) * 0.05,
    ) < 1e-8);

    const walkingArmPose = record.pivots.rightArm.rotation.x;
    entity.miningKey = "3,6";
    entity.miningTimer = 0.5;
    entity.workSwingProgress = 0.25;
    renderer.update([entity], 0, camera, 0.2, false);
    assert.notEqual(record.pivots.rightArm.rotation.x, walkingArmPose);
    const swing = 0.25;
    const easedSwing = 1 - (1 - swing) ** 4;
    const strike = Math.sin(easedSwing * Math.PI) * 1.2 +
        Math.sin(swing * Math.PI) * 0.7 * 0.75;
    const idleArmPitch = Math.sin(0.2 * 20 * 0.067) * 0.05;
    assert.ok(Math.abs(
        record.pivots.rightArm.rotation.x -
        -(Math.cos(limbPhase + Math.PI) * 0.6 + idleArmPitch - strike),
    ) < 1e-8);
});
