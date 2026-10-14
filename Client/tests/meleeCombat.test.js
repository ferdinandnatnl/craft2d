import test from "node:test";
import assert from "node:assert/strict";
import { ToolType } from "@2dcraft.com/shared/constants.js";
import {
    getMeleeTargets,
    getMeleeWeaponProfile,
    isEntityInMeleeHitbox,
    MeleeAttackClock,
} from "../Assets/entities/meleeCombat.js";

const BLOCK_SIZE = 64;

function target(x, y, { width = 32, height = 64, health = 20, dimension = 0, id = "mob" } = {}) {
    return {
        UUID: id,
        position: { x, y },
        hitbox: { x: width, y: height },
        health,
        dimension,
        hit() {},
    };
}

test("weapon profiles use Better Combat's range, shape, and combo data", () => {
    const sword = getMeleeWeaponProfile({ toolType: ToolType.Sword });
    assert.equal(sword.attackRange, 2.5);
    assert.equal(sword.attackSpeed, 1.6);
    assert.deepEqual(sword.attacks.map(({ hitbox, angle, upswing }) =>
        [hitbox, angle, upswing]), [
        ["HORIZONTAL_PLANE", 120, 0.5],
        ["HORIZONTAL_PLANE", 120, 0.5],
        ["FORWARD_BOX", 0, 0.5],
    ]);

    const axe = getMeleeWeaponProfile({ toolType: ToolType.Axe, toolLevel: 3 });
    assert.equal(axe.attackRange, 2.5);
    assert.equal(axe.attackSpeed, 0.9);
    assert.equal(axe.attacks.length, 2);

    const pickaxe = getMeleeWeaponProfile({ toolType: ToolType.Pickaxe });
    assert.equal(pickaxe.attacks[0].hitbox, "VERTICAL_PLANE");

    const hammer = getMeleeWeaponProfile({ toolType: ToolType.Hammer });
    assert.equal(hammer.attackRange, 2.75);
    assert.equal(hammer.attacks[0].hitbox, "FORWARD_BOX");
});

test("forward box hits in front within its width and rejects rear or offset targets", () => {
    const attack = { hitbox: "FORWARD_BOX", angle: 0 };
    const origin = { x: 0, y: 0 };
    const aim = { x: 1, y: 0 };
    assert.equal(isEntityInMeleeHitbox(
        target(80, -20), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), true);
    assert.equal(isEntityInMeleeHitbox(
        target(-80, -20), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), false);
    assert.equal(isEntityInMeleeHitbox(
        target(80, 64), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), false);
});

test("forward box rejects corner overlap outside the rotated hitbox", () => {
    assert.equal(isEntityInMeleeHitbox(
        target(156, 112),
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { hitbox: "FORWARD_BOX", angle: 0 },
        200,
        20,
    ), false);
});

test("sector sweeps include targets in the arc and exclude targets behind it", () => {
    const attack = { hitbox: "HORIZONTAL_PLANE", angle: 120 };
    const origin = { x: 0, y: 0 };
    const aim = { x: 1, y: 0 };
    assert.equal(isEntityInMeleeHitbox(
        target(48, 0), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), true);
    assert.equal(isEntityInMeleeHitbox(
        target(-80, 0), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), false);
    assert.equal(isEntityInMeleeHitbox(
        target(200, 0), origin, aim, attack, 2.5 * BLOCK_SIZE, BLOCK_SIZE,
    ), false);
});

test("one swing hits every valid target in range, nearest first", () => {
    const attacker = {};
    const near = target(64, -16, { id: "near" });
    const far = target(112, -16, { id: "far" });
    const behind = target(-64, -16, { id: "behind" });
    const dead = target(80, -16, { id: "dead", health: 0 });
    const otherDimension = target(80, -16, { id: "other", dimension: 1 });
    const profile = getMeleeWeaponProfile({ toolType: ToolType.Sword });

    const targets = getMeleeTargets({
        attacker,
        entities: [far, behind, dead, otherDimension, near],
        origin: { x: 0, y: 0 },
        aim: { x: 1, y: 0 },
        profile,
        attack: profile.attacks[0],
        blockSize: BLOCK_SIZE,
        dimension: 0,
    });

    assert.deepEqual(targets.map(({ UUID }) => UUID), ["near", "far"]);
});

test("attack clock applies half-cooldown wind-up and advances weapon combos", () => {
    const profile = getMeleeWeaponProfile({ toolType: ToolType.Sword });
    const clock = new MeleeAttackClock();
    const first = clock.start(profile, "sword", { x: 1, y: 0 }, 2, {});

    assert.equal(first.hitbox, "HORIZONTAL_PLANE");
    assert.equal(clock.update(0.3), null);
    assert.equal(clock.update(0.013)?.hitbox, "HORIZONTAL_PLANE");
    assert.equal(clock.canStart(), false);

    clock.update(0.313);
    const second = clock.start(profile, "sword", { x: 1, y: 0 }, 2, {});
    assert.equal(second.hitbox, "HORIZONTAL_PLANE");
    clock.update(0.625);
    const third = clock.start(profile, "sword", { x: 1, y: 0 }, 2, {});
    assert.equal(third.hitbox, "FORWARD_BOX");

    clock.update(0.625);
    const changedWeapon = getMeleeWeaponProfile({ toolType: ToolType.Axe });
    const resetCombo = clock.start(changedWeapon, "axe", { x: 1, y: 0 }, 2, {});
    assert.equal(resetCombo.angle, 90);
});
