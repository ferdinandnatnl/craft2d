import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MUTANT_CREEPER_RIG } from "../Assets/rendering/mutantCreeperRig.js";
import { mutantAttackAmount, mutantPartPitch, mutantWalkBob } from "../Assets/rendering/mutantPose.js";

const size = {
    pelvis: [10, 14, 8], body: [9, 16, 7], neck: [8, 14, 6],
    head: [10, 12, 10],
    frontRightLeg: [6, 4, 14], frontLeftLeg: [6, 4, 14],
    frontRightFoot: [7, 20, 8], frontLeftFoot: [7, 20, 8],
    backRightLeg: [4, 4, 14], backLeftLeg: [4, 4, 14],
    backRightFoot: [6, 18, 6], backLeftFoot: [6, 18, 6],
};

test("the mod's bent creeper pose keeps all four feet grounded and the body connected", () => {
    const root = new THREE.Group();
    root.position.y = 25 / 16;
    const joints = new Map();
    const boxes = new Map();
    for (const part of MUTANT_CREEPER_RIG) {
        const joint = new THREE.Group();
        joint.rotation.order = "ZYX";
        joint.position.set(part.pivot[0] / 16, -part.pivot[1] / 16,
            -part.pivot[2] / 16);
        joint.rotation.x = mutantPartPitch("MutantCreeper", part.name, 0, 0, 0, 0);
        joint.rotation.y = -(part.yaw || 0);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size[part.name].map(n => n / 16)));
        mesh.position.set(part.box[0] / 16, -part.box[1] / 16,
            -part.box[2] / 16);
        joint.add(mesh);
        (joints.get(part.parent) || root).add(joint);
        joints.set(part.name, joint);
        boxes.set(part.name, mesh);
    }
    root.updateMatrixWorld(true);
    const bounds = name => new THREE.Box3().setFromObject(boxes.get(name));
    for (const name of ["frontRightFoot", "frontLeftFoot", "backRightFoot", "backLeftFoot"]) {
        assert.ok(Math.abs(bounds(name).min.y) < 0.08, `${name} should touch the floor`);
    }
    for (const [upper, lower] of [["pelvis", "body"], ["body", "neck"],
        ["neck", "head"], ["pelvis", "frontLeftLeg"],
        ["frontLeftLeg", "frontLeftFoot"], ["pelvis", "backRightLeg"],
        ["backRightLeg", "backRightFoot"]]) {
        assert.ok(bounds(upper).intersectsBox(bounds(lower)),
            `${upper} and ${lower} should remain joined`);
    }
    assert.ok(bounds("head").max.y < 2.8, "the model should fit its 2.8 block hitbox");
});

// The entity modules use browser primitives at import time. These small stubs
// let the real mob methods run against a controlled world in Node.
class TestAudio {
    cloneNode() { return new TestAudio(); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    load() {}
}
const canvas = { getContext: () => ({}), addEventListener() {},
    style: {}, width: 1920, height: 1080 };
globalThis.window = { location: { href: "http://localhost/" },
    AudioContext: class {
        createMediaElementSource() { return { connect() {} }; }
        createStereoPanner() { return { connect() {}, pan: { value: 0 } }; }
    }, addEventListener() {} };
globalThis.Audio = TestAudio;
globalThis.Image = class {
    set src(value) { this._src = value; this.complete = true; this.naturalWidth = 128; }
    get src() { return this._src; }
};
globalThis.document = { body: { classList: { toggle() {} } },
    getElementById: () => null, querySelector: () => null,
    createElement: () => canvas, addEventListener() {} };
globalThis.localStorage = { getItem: () => null };

await import("../Assets/game/inventoryItem.js");
const [{ MutantCreeper, MutantZombie, MutantSkeleton, MutantEnderman,
    MutantSnowGolem, SpiderPig },
    { CreeperMinion, CreeperMinionEgg },
    { Vector2 }, { runtime }, { EntityTypes }] = await Promise.all([
    import("../Assets/entities/mobs/mutants.js"),
    import("../Assets/entities/mobs/creeperMinion.js"),
    import("../Assets/utils/classes.js"),
    import("../Assets/utils/runtime.js"),
    import("../Assets/game/entity.js"),
]);

function createWorld() {
    const events = { spawned: [], explosions: [], removed: [] };
    const world = {
        entities: [],
        player: { UUID: "player", position: new Vector2(0, 0),
            hitbox: new Vector2(32, 64), dimension: 0,
            abilities: { hasHealth: true }, velocity: new Vector2(),
            hit(amount) { this.damageTaken = (this.damageTaken || 0) + amount; } },
        getChunkForX: () => null,
        summonEntity(Type, position, props) {
            events.spawned.push({ Type, position, props });
            return { position, velocity: new Vector2(), ...props };
        },
        createExplosion(position, options) { events.explosions.push({ position, options }); },
        removeEntity(entity) { events.removed.push(entity); },
    };
    runtime.world = world;
    runtime.game = { settings: { sfxVolume: 0 } };
    runtime.GAMERULES = { doMobLoot: true, doMobGriefing: false, doDaylightCycle: true };
    runtime.deltaTime = 0.05;
    return { world, events };
}

test("mutant creeper heals from ordinary blasts but not another mutant's blast", () => {
    const { world } = createWorld();
    const creeper = new MutantCreeper(world, { position: new Vector2() });
    assert.equal(creeper.maxHealth, 150);
    assert.equal(creeper.hitbox.y / 64, 2.8);
    creeper.health = 90;
    creeper.hitByExplosion(20, null);
    assert.equal(creeper.health, 100);
    creeper.hitByExplosion(20, { entityTypeName: "MutantCreeper" });
    assert.equal(creeper.health, 100);
});

test("charge heals only if it finishes without enough hits", () => {
    const { world } = createWorld();
    const creeper = new MutantCreeper(world);
    creeper.health = 80;
    creeper.chargeTime = 0.01;
    creeper.chargeHits = 1;
    creeper.updateCharge();
    assert.equal(creeper.health, 117.5);
    creeper.health = 80;
    creeper.chargeTime = 1;
    creeper.chargeHits = 0;
    creeper.updateCharge();
    assert.equal(creeper.health, 80);
});

test("an open-sky charge can power the mutant creeper when its target approaches", () => {
    const { world } = createWorld();
    const creeper = new MutantCreeper(world);
    creeper.getSkyExposure = () => 1;
    creeper.chargeTime = 3;
    creeper.lightningPending = true;
    creeper.updateCharge();
    assert.equal(creeper.powered, true);
    assert.equal(creeper.chargeTime, 0);
    assert.equal(world.player.damageTaken, 6);
});

test("minion count follows health, and death pulls before the blast and egg", () => {
    const { world, events } = createWorld();
    const creeper = new MutantCreeper(world, { UUID: "boss" });
    world.entities.push(creeper);
    creeper.health = 75;
    creeper.summonMinions();
    assert.equal(events.spawned.length, 2);
    assert.ok(events.spawned.every(event => event.Type === CreeperMinion &&
        event.props.ownerUUID === "boss"));
    creeper.dieEvent();
    assert.equal(events.explosions.length, 0);
    runtime.deltaTime = 5.1;
    creeper.updateDeath();
    assert.equal(events.explosions.length, 1);
    assert.equal(events.explosions[0].options.destroyTerrain, false);
    assert.equal(events.spawned.at(-1).Type, CreeperMinionEgg);
    assert.equal(events.spawned.at(-1).props.ownerUUID, "player");
    assert.deepEqual(events.removed, [creeper]);
});

test("hostile mutants damage a Survival player in melee", () => {
    for (const Type of [MutantZombie, MutantSkeleton, MutantCreeper, MutantEnderman]) {
        const { world } = createWorld();
        const mutant = new Type(world, { position: new Vector2(0, 0) });
        mutant.updateEntity = () => {};
        mutant.aiUpdate = () => {};
        mutant.entityCollision = () => world.player;
        mutant.attackCooldown = 0;
        mutant.grounded = false;
        if (Type === MutantZombie || Type === MutantSkeleton) mutant.hitPlayerLogic();
        else mutant.update();
        assert.ok(world.player.damageTaken > 0, `${Type.name} should attack`);
    }
});

test("mutant zombie does not crash when no player overlaps it", () => {
    const { world } = createWorld();
    const zombie = new MutantZombie(world);
    world.player.type = EntityTypes.Player;
    world.player.position.x = 1000;
    world.entities.push(world.player, zombie);
    zombie.attackCooldown = 0;
    assert.doesNotThrow(() => zombie.hitPlayerLogic());
    assert.equal(world.player.damageTaken, undefined);
});

test("mutants use their own sounds and animate their attack parts", () => {
    for (const [Type, sound] of [
        [MutantZombie, "mutant_zombie"],
        [MutantSkeleton, "mutant_skeleton"],
        [MutantEnderman, "mutant_enderman"],
        [MutantCreeper, "mutant_creeper"],
    ]) {
        const { world } = createWorld();
        const mutant = new Type(world);
        assert.ok(mutant.ambientSounds.every(path => path.includes(sound)));
    }
    for (const type of ["MutantZombie", "MutantSkeleton", "MutantEnderman",
        "MutantSnowGolem", "SpiderPig"]) {
        assert.equal(mutantPartPitch(type, "leftArm", 1, 0, 0, 1), 0);
        assert.equal(mutantWalkBob(type, 1, 0), 0);
    }
    assert.equal(mutantAttackAmount("MutantZombie", 0.4, 0.4), 1);
    assert.equal(mutantAttackAmount("MutantZombie", 0, 0.4), 0);
    assert.ok(mutantPartPitch("MutantZombie", "leftArm", 0, 0, 1, 0, "melee") < -1);
    assert.ok(mutantPartPitch("MutantZombie", "leftArm", 0, 0, 1, 0, "throw") < -2);
    assert.ok(mutantPartPitch("MutantSkeleton", "rightArm", 0, 0, 1, 0, "shoot") < -1);
    assert.ok(mutantPartPitch("MutantEnderman", "upperRightArm", 0, 0, 1, 0) < 0);
    assert.ok(mutantPartPitch("MutantSnowGolem", "rightArm", 0, 0, 1, 0, "throw") < 0);
    assert.ok(mutantPartPitch("SpiderPig", "head", 0, 0, 1, 0, "bite") < 0);
});

test("moving mutants swing opposite limbs and settle when they stop", () => {
    for (const [type, left, right, foot, phase] of [
        ["MutantZombie", "leftLeg", "rightLeg", "leftFoot", Math.PI / 0.8],
        ["MutantSkeleton", "leftLeg", "rightLeg", "leftFoot", Math.PI],
        ["MutantEnderman", "leftLeg", "rightLeg", "leftForeleg", Math.PI / 0.6],
        ["MutantSnowGolem", "leftLeg", "rightLeg", "leftFoot", Math.PI / 0.9],
        ["SpiderPig", "frontLeftLeg", "frontRightLeg", "frontLeftFoot", 1],
    ]) {
        const leftAngle = mutantPartPitch(type, left, phase, 1, 0, 0);
        const rightAngle = mutantPartPitch(type, right, phase, 1, 0, 0);
        assert.ok(Math.abs(leftAngle) > 0.2, `${type} should take a visible step`);
        assert.ok(leftAngle * rightAngle < 0, `${type} legs should alternate`);
        assert.ok(mutantPartPitch(type, foot, phase, 1, 0, 0) * leftAngle < 0,
            `${type} lower leg should bend with the step`);
        assert.ok(mutantWalkBob(type, phase, 1) > 0, `${type} should step upward`);
        assert.equal(mutantPartPitch(type, left, phase, 0, 0, 0), 0);
    }
});

test("mutant skeleton uses its shooting pose for an arrow volley", () => {
    const { world, events } = createWorld();
    world.player.position.x = 5 * 64;
    const skeleton = new MutantSkeleton(world, { position: new Vector2(0, 0) });
    skeleton.updateEntity = () => {};
    skeleton.aiUpdate = () => {};
    skeleton.hitPlayerLogic = () => {};
    skeleton.volleyCooldown = 0;
    skeleton.update();
    assert.equal(events.spawned.length, 6);
    assert.equal(skeleton.attackPoseKind, "shoot");
    assert.equal(skeleton.body.mutantAttackPoseKind, "shoot");
});

test("mutant arms stay joined during melee and shooting poses", async () => {
    const { VoxelEntities } = await import("../Assets/rendering/entities.js");
    for (const [Type, kind] of [[MutantZombie, "melee"],
        [MutantSkeleton, "shoot"]]) {
        const { world } = createWorld();
        const mob = new Type(world);
        mob.getLightLevel = () => 15;
        mob.getSkyExposure = () => 1;
        mob.attackPoseKind = kind;
        mob.attackPoseDuration = 0.8;
        mob.attackPoseUntil = 1.8;
        const renderer = new VoxelEntities(new THREE.Scene());
        renderer.update([mob], 0, { position: { x: 0 } }, 1, false);
        const record = renderer.models.get(mob);
        const positions = record.geometry.getAttribute("position");
        const bounds = name => {
            const part = record.mutantPartByName.get(name);
            const box = new THREE.Box3();
            for (let i = 0; i < part.base.length; i++) {
                box.expandByPoint(new THREE.Vector3(
                    positions.getX(part.vertexStart + i),
                    positions.getY(part.vertexStart + i),
                    positions.getZ(part.vertexStart + i),
                ));
            }
            return box;
        };
        for (const side of ["left", "right"]) {
            assert.ok(bounds(`${side}Arm`).intersectsBox(bounds(`${side}Forearm`)),
                `${Type.name} ${side} elbow should stay joined`);
            if (Type === MutantSkeleton) {
                assert.ok(bounds(`${side}Shoulder`).intersectsBox(bounds(`${side}Arm`)),
                    `${Type.name} ${side} shoulder should stay joined`);
            }
        }
        renderer.dispose();
    }
});

test("walking mutant feet remain attached to their moving legs", async () => {
    const { VoxelEntities } = await import("../Assets/rendering/entities.js");
    for (const [Type, leg, foot, phase] of [
        [MutantZombie, "leftLeg", "leftFoot", Math.PI / 0.8],
        [MutantSkeleton, "leftLeg", "leftFoot", Math.PI],
        [MutantEnderman, "leftLeg", "leftForeleg", Math.PI / 0.6],
        [MutantSnowGolem, "leftLeg", "leftFoot", Math.PI / 0.9],
        [SpiderPig, "frontLeftLeg", "frontLeftFoot", 1],
    ]) {
        const { world } = createWorld();
        const mob = new Type(world);
        mob.getLightLevel = () => 15;
        mob.getSkyExposure = () => 1;
        mob.body.mutantWalkPhase = phase;
        mob.body.mutantWalkAmount = 1;
        const renderer = new VoxelEntities(new THREE.Scene());
        renderer.update([mob], 0, { position: { x: 0 } }, 1, false);
        const record = renderer.models.get(mob);
        const positions = record.geometry.getAttribute("position");
        const bounds = name => {
            const part = record.mutantPartByName.get(name);
            const box = new THREE.Box3();
            for (let i = 0; i < part.base.length; i++) {
                box.expandByPoint(new THREE.Vector3(
                    positions.getX(part.vertexStart + i),
                    positions.getY(part.vertexStart + i),
                    positions.getZ(part.vertexStart + i),
                ));
            }
            return box;
        };
        const part = record.mutantPartByName.get(leg);
        assert.ok(Math.abs(positions.getY(part.vertexStart) - part.base[0][1]) > 0.01,
            `${Type.name} leg should move`);
        assert.ok(bounds(leg).intersectsBox(bounds(foot)),
            `${Type.name} lower leg should stay joined`);
        renderer.dispose();
    }
});

test("classic mutant sprites move forearms with their upper arms", () => {
    const { world } = createWorld();
    const skeleton = new MutantSkeleton(world);
    const body = skeleton.body;
    const ctx = { save() {}, restore() {}, translate() {}, scale() {} };
    for (const part of Object.values(body.parts)) part.draw = () => {};
    body.draw(ctx, 1, 0, null);
    const restingX = body.parts.rightForearm.position.x;
    const restingFootX = body.parts.leftFoot.position.x;
    body.mutantAttackPoseKind = "shoot";
    body.mutantAttackPoseDuration = 0.8;
    body.mutantAttackPoseUntil = runtime.passedTime + 0.8;
    body.draw(ctx, 1, 0, null);
    assert.ok(body.parts.rightForearm.position.x > restingX);
    body.draw(ctx, -1, 180, null);
    assert.ok(body.parts.rightForearm.position.x < restingX);
    body.mutantAttackPoseUntil = 0;
    body.mutantWalkPhase = Math.PI;
    body.mutantWalkAmount = 1;
    body.draw(ctx, 1, 0, null);
    assert.notEqual(body.parts.leftFoot.position.x, restingFootX);
});

test("mutant snow golem attacks nearby hostile mobs", () => {
    const { world, events } = createWorld();
    const golem = new MutantSnowGolem(world, { position: new Vector2(0, 0) });
    golem.updateEntity = () => {};
    golem.aiUpdate = () => {};
    golem.attackCooldown = 0;
    world.entities.push(golem, { type: EntityTypes.Mob, isHostile: true, health: 20,
        dimension: 0, position: new Vector2(2 * 64, 0),
        hitbox: new Vector2(32, 64) });
    golem.update();
    assert.equal(events.spawned.length, 1);
    assert.equal(events.spawned[0].Type.name, "MutantIceShard");
});

test("creeper egg can be carried, accelerated by blasts, and hatches a companion", () => {
    const { world, events } = createWorld();
    world.entities.push(world.player);
    const egg = new CreeperMinionEgg(world, { ownerUUID: "player", powered: true,
        hatchAge: 1990 });
    egg.updateEntity = () => {};
    egg.interact(world.player);
    assert.equal(egg.carriedByUUID, "player");
    egg.hitByExplosion(3);
    egg.update();
    assert.equal(events.spawned.length, 1);
    assert.equal(events.spawned[0].Type, CreeperMinion);
    assert.equal(events.spawned[0].props.tamed, true);
    assert.equal(events.spawned[0].props.powered, true);
    assert.deepEqual(events.removed, [egg]);
});
