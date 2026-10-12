import test from "node:test";
import assert from "node:assert/strict";

class TestImage {
    set src(value) {
        this._src = value;
        this.complete = true;
        this.naturalWidth = 128;
        this.width = 128;
        this.height = 128;
    }
    get src() { return this._src; }
}

globalThis.window = {
    location: { href: "http://localhost/" },
    AudioContext: class {
        createMediaElementSource() { return { connect() {} }; }
        createStereoPanner() { return { connect() {}, pan: { value: 0 } }; }
    },
    addEventListener() {},
};
globalThis.Audio = class {
    cloneNode() { return new this.constructor(); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    load() {}
};
globalThis.Image = TestImage;
globalThis.document = {
    body: { classList: { toggle() {} } },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ getContext: () => ({}) }),
    addEventListener() {},
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

await import("../Assets/game/inventoryItem.js");

const [
    { Centipede, followCentipedeTrail },
    { Vector2 },
    { Entity, EntityTypes },
    { Blocks },
    { Items },
    { getItem },
    { Entities },
    { runtime },
    { BLOCK_SIZE },
    { createAlexCentipedeRig, updateAlexCentipedeRig },
] = await Promise.all([
    import("../Assets/entities/mobs/centipede.js"),
    import("../Assets/utils/classes.js"),
    import("../Assets/game/entity.js"),
    import("../../Shared/blocks.js"),
    import("../../Shared/items.js"),
    import("../../Shared/item.js"),
    import("../Assets/entities/entities.js"),
    import("../Assets/utils/runtime.js"),
    import("../Assets/utils/globals.js"),
    import("../Assets/rendering/alexsMobsCentipedeRig.js"),
]);

function makeWorld() {
    const chunk = { x: 0, entities: [] };
    const world = {
        entities: [],
        removed: [],
        difficulty: "normal",
        getChunkForX: () => chunk,
        getBlockAtWorldPosition() {
            return { blockType: Blocks.Air, lightLevel: 0 };
        },
        removeEntity(entity) {
            this.removed.push(entity);
            this.entities = this.entities.filter(entry => entry !== entity);
        },
        addDamageIndicator() {},
    };
    runtime.world = world;
    runtime.GAMERULES = { doMobLoot: true, doMobGriefing: true };
    runtime.game = { settings: { sfxVolume: 0 } };
    runtime.deltaTime = 0.05;
    runtime.passedTime = 0;
    return world;
}

test("Centipede keeps source health, armor, segment counts, and source drop", () => {
    const world = makeWorld();
    const centipede = new Centipede(world, { segmentCount: 8 });
    assert.equal(centipede.maxHealth, 35);
    assert.equal(centipede.armorPoints, 6);
    assert.equal(centipede.segmentCount, 8);
    assert.equal(centipede.isHostile, true);
    assert.equal(Items.CentipedeLeg, 1535);
    assert.equal(getItem(Items.CentipedeLeg).name, "Centipede Leg");
    assert.equal(Entities.Centipede, Centipede);
    assert.equal(getItem(Items.CentipedeSpawnEgg).spawnEntity, "Centipede");
    assert.deepEqual(
        centipede.lootTable.getRandomLoot(() => 0.5).map(drop => drop.itemId),
        [Items.CentipedeLeg],
    );
    assert.equal(Centipede.randomSegmentCount(() => 0), 5);
    assert.equal(Centipede.randomSegmentCount(() => 0.999), 8);
});

test("Centipede trail spaces source body parts along its saved path", () => {
    const trail = Array.from({ length: 20 }, (_, index) => ({
        x: -index * BLOCK_SIZE * 0.2,
        y: index * BLOCK_SIZE * 0.1,
    }));
    const segments = followCentipedeTrail(trail, 5);
    assert.equal(segments.length, 5);
    assert.ok(segments[0].x < 0);
    assert.ok(segments[0].y > 0);
    assert.ok(segments[4].x < segments[0].x);
    assert.ok(Number.isFinite(segments[4].angle));
});

test("Centipede targets source prey, bites for eight, and applies difficulty poison", () => {
    const world = makeWorld();
    const centipede = new Centipede(world, { position: new Vector2(0, 0) });
    const player = {
        type: EntityTypes.Player,
        name: "Player",
        position: new Vector2(BLOCK_SIZE * 0.1, 0),
        hitbox: new Vector2(BLOCK_SIZE * 0.8, BLOCK_SIZE * 1.8),
        dimension: 0,
        health: 20,
        abilities: { hasHealth: true },
        hit(damage) { this.health -= damage; },
        applyPoison(ticks, amplifier) { this.poison = { ticks, amplifier }; },
    };
    world.player = player;
    world.entities = [centipede, player];

    assert.equal(centipede.findTarget(), player);
    assert.equal(centipede.tryAttack(player), true);
    assert.equal(player.health, 12);
    assert.deepEqual(player.poison, { ticks: 200, amplifier: 1 });
});

test("Centipede armor reduces hits and poison duration can be saved and restored", () => {
    const world = makeWorld();
    const centipede = new Centipede(world, { noAi: true });
    centipede.hurtCooldown = 0;
    assert.equal(centipede.hit(10, 0, 0), true);
    assert.ok(Math.abs(centipede.health - 25.48) < 0.001);

    centipede.applyPoison(60, 1);
    centipede.poisonDamageTicks = 2;
    const effectData = centipede.getStatusEffectSaveData();
    const restored = new Centipede(world, { noAi: true });
    restored.loadStatusEffectSaveData(effectData);
    assert.deepEqual(restored.getStatusEffectSaveData(), effectData);

    const poisoned = {
        health: 2,
        position: new Vector2(),
        hitbox: new Vector2(1, 1),
        poisonTicks: 0,
        poisonAmplifier: 0,
        poisonDamageTicks: 0,
        hit(damage) { this.health = Math.max(1, this.health - damage); },
    };
    Entity.prototype.applyPoison.call(poisoned, 2, 0);
    poisoned.poisonDamageTicks = 1;
    Entity.prototype.statusEffectsLogic.call(poisoned);
    assert.equal(poisoned.health, 1);
    Entity.prototype.statusEffectsLogic.call(poisoned);
    assert.equal(poisoned.health, 1);
    assert.equal(poisoned.poisonTicks, 0);

    const saved = centipede.createSaveData();
    const loaded = new Centipede(world, saved);
    assert.equal(loaded.segmentCount, centipede.segmentCount);
    assert.deepEqual(loaded.segmentTrail, centipede.segmentTrail);
});

test("Source Centipede model builds the requested articulated length", () => {
    const image = new Image();
    image.src = "alexsmobs/cave_centipede.png";
    const rig = createAlexCentipedeRig(image, 7);
    const entity = {
        direction: 1,
        position: new Vector2(0, 0),
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.9),
        velocity: new Vector2(BLOCK_SIZE, 0),
        segmentPositions: Array.from({ length: 7 }, (_, index) => ({
            x: -index * BLOCK_SIZE * 0.84,
            y: index * BLOCK_SIZE * 0.1,
            angle: 0.1,
        })),
        walkPhase: Math.PI / 2,
    };
    updateAlexCentipedeRig(rig, entity, 1);
    assert.equal(rig.centipedeRig, true);
    assert.equal(rig.pieces.length, 7);
    assert.equal(rig.group.children.length, 7);
    assert.ok(rig.pieces[6].position.x < rig.pieces[1].position.x);
});
