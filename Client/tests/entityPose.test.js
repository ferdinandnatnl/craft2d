import test from "node:test";
import assert from "node:assert/strict";
import { getHeadPitch, getLimbPitch, blendSwimming, getSwimPartPitch, updateBendPose } from "../Assets/rendering/entityPose.js";
import { skinBox, skinLimbHalf } from "../Assets/rendering/entityGeometry.js";

test("skin side textures meet the front texture at the model's front edge", () => {
    for (const [w, h, d, u, v] of [[8, 8, 8, 0, 0], [8, 12, 4, 16, 16], [3, 12, 4, 40, 16]]) {
        for (const height of [32, 64]) {
            const geometry = skinBox(w, h, d, u, v, { width: 64, height });
            const { position, normal, uv } = geometry.attributes;
            for (let i = 0; i < position.count; i++) {
                if (Math.abs(normal.getX(i)) !== 1 || position.getZ(i) <= 0) continue;
                // Both side faces must join the corresponding edge of the front atlas rect.
                const frontU = normal.getX(i) > 0 ? u + d + w : u + d;
                assert.equal(uv.getX(i) * 64, frontU);
                const frontV = position.getY(i) > 0 ? v + d : v + d + h;
                assert.equal((1 - uv.getY(i)) * height, frontV);
            }
            geometry.dispose();
        }
    }
});

test("bent limb halves meet at the same skin row without stretching pixels", () => {
    for (const width of [2, 3, 4]) {
        const image = { width: 64, height: 64 };
        const upper = skinLimbHalf(width, 4, 40, 16, image);
        const lower = skinLimbHalf(width, 4, 40, 16, image, true);
        for (const face of [0, 1, 4, 5]) {
            const row = (geometry, vertex) =>
                (1 - geometry.attributes.uv.getY(face * 4 + vertex)) * image.height;
            assert.equal(row(upper, 2), row(lower, 0));
            assert.equal(row(upper, 0), 20);
            assert.equal(row(lower, 2), 32);
        }
        upper.dispose();
        lower.dispose();
    }
});

test("bends apply to hostile mobs and leave the player pose alone", () => {
    const body = {
        sprite: "player/steve",
        parts: {
            leftArm: { isSwinging: false, swingProgress: 0 },
            rightArm: {}, leftLeg: {}, rightLeg: {},
        },
        swimAmount: 0, boatAmount: 0,
    };
    const entity = {
        body, skinModel: "steve", position: { x: 0 },
        velocity: { x: 128, y: 0 }, grounded: true,
        abilities: { walkSpeed: 6, flying: false },
    };
    assert.equal(updateBendPose(entity, 1), null);
    assert.equal(body.bendPose, undefined);

    entity.skinModel = undefined;
    body.sprite = "zombie/zombie";
    updateBendPose(entity, 1);
    entity.position.x = 8;
    const walking = updateBendPose(entity, 1.02);
    assert.equal(walking.pitch.leftLeg, -walking.pitch.rightLeg);
    assert.ok(walking.bend.leftLeg > 0);
    entity.attackPoseUntil = 1.32;
    const striking = updateBendPose(entity, 1.04);
    assert.ok(striking.pitch.leftArm < walking.pitch.leftArm);
    assert.ok(striking.bend.leftArm > walking.bend.leftArm);
    assert.equal(entity.velocity.x, 128);

    body.sprite = "skeleton/skeleton";
    const skeleton = updateBendPose(entity, 1.04);
    assert.ok(skeleton.pitch.leftArm < -1);
    assert.ok(skeleton.bend.leftArm > 0.12);
});

test("looking horizontally left or right keeps the head level", () => {
    for (const angle of [0, 180, -180]) {
        assert.ok(Math.abs(getHeadPitch(angle)) < 1e-10);
    }
});

test("head pitch follows vertical aim on either side without bending backwards", () => {
    for (const [right, left] of [[15, 165], [-15, -165], [75, 105], [-75, -105]]) {
        assert.ok(Math.abs(getHeadPitch(right) - getHeadPitch(left)) < 1e-10);
        assert.equal(Math.sign(getHeadPitch(right)), Math.sign(right));
        assert.ok(Math.abs(getHeadPitch(left)) <= 0.45);
    }
});

test("turning left preserves the forward gait in model space", () => {
    for (const rotation of [-30, -10, 0, 10, 30]) {
        for (const zIndex of [-2, -1, 1, 2]) {
            const right = getLimbPitch({ rotation, zIndex }, 1);
            const left = getLimbPitch({ rotation: -rotation, zIndex }, -1);
            assert.ok(Math.abs(right - left) < 1e-10);
        }
    }
});

test("opposite limbs alternate and each arm counters its leg", () => {
    for (const direction of [-1, 1]) {
        const rotation = 25 * direction;
        const nearLeg = getLimbPitch({ rotation, zIndex: 1 }, direction);
        const farLeg = getLimbPitch({ rotation, zIndex: -1 }, direction);
        const nearArm = getLimbPitch({ rotation: -rotation, zIndex: 2 }, direction);
        const farArm = getLimbPitch({ rotation: -rotation, zIndex: -2 }, direction);
        assert.equal(nearLeg, -farLeg);
        assert.equal(nearArm, -nearLeg);
        assert.equal(farArm, -farLeg);
    }
});

test("swimming blends in and out smoothly at different frame rates", () => {
    const amounts = [];
    for (const fps of [30, 60, 120]) {
        let amount = 0;
        for (let frame = 0; frame < fps / 2; frame++) {
            const next = blendSwimming(amount, true, 1 / fps);
            assert.ok(next >= amount && next <= 1);
            amount = next;
        }
        amounts.push(amount);
        for (let frame = 0; frame < fps; frame++) amount = blendSwimming(amount, false, 1 / fps);
        assert.equal(amount, 0);
    }
    assert.ok(Math.abs(amounts[0] - amounts[2]) < 1e-10);
    assert.equal(blendSwimming(0.5, true, 0), 0.5);
});

test("swimming keeps the head forward with alternating strokes and flutter kicks", () => {
    assert.equal(getSwimPartPitch("head", 0) + Math.PI / 2, 0);
    for (const phase of [0, 0.5, 1, 2, 3]) {
        assert.equal(getSwimPartPitch("leftLeg", phase), -getSwimPartPitch("rightLeg", phase));
        assert.ok(Math.abs(getSwimPartPitch("leftArm", phase) + getSwimPartPitch("rightArm", phase) + Math.PI) < 1e-10);
        assert.ok(Math.abs(getSwimPartPitch("leftLeg", phase)) <= 0.3);
    }
    assert.notEqual(getSwimPartPitch("leftArm", 0), getSwimPartPitch("leftArm", 1));
});
