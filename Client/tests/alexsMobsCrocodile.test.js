import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

class TestAudio {
    cloneNode() { return new TestAudio(); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    load() {}
}

globalThis.window = {
    location: { href: "http://localhost/" },
    AudioContext: class {
        createMediaElementSource() { return { connect() {} }; }
        createStereoPanner() { return { connect() {}, pan: { value: 0 } }; }
    },
    addEventListener() {},
};
globalThis.Audio = TestAudio;
globalThis.Image = class {
    set src(value) { this._src = value; this.complete = true; this.naturalWidth = 128; }
    get src() { return this._src; }
};
globalThis.document = {
    body: { classList: { toggle() {} } },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({
        getContext: () => ({}),
        addEventListener() {},
        style: {},
        width: 1920,
        height: 1080,
    }),
    addEventListener() {},
};
globalThis.localStorage = { getItem: () => null };

await import("../Assets/game/inventoryItem.js");

const [{ Crocodile }, { Vector2 }, { Entity, EntityTypes }, { Blocks }, { Items },
    { runtime }, { BLOCK_SIZE }, { Block }, { dimensions, Dimensions },
    { createAlexCrocodileRig, updateAlexCrocodileRig }, { VoxelEntities }] = await Promise.all([
    import("../Assets/entities/mobs/crocodile.js"),
    import("../Assets/utils/classes.js"),
    import("../Assets/game/entity.js"),
    import("../../Shared/blocks.js"),
    import("../../Shared/items.js"),
    import("../Assets/utils/runtime.js"),
    import("../Assets/utils/globals.js"),
    import("../Assets/world/block.js"),
    import("../Assets/world/dimension.js"),
    import("../Assets/rendering/alexsMobsCrocodileRig.js"),
    import("../Assets/rendering/entities.js"),
]);

function makeWorld(difficulty = "easy") {
    const world = {
        entities: [],
        difficulty,
        removed: [],
        drops: [],
        getBlockAtWorldPosition: () => null,
        removeEntity(entity) { this.removed.push(entity); },
        spawnDrop(position, props) { this.drops.push({ position, props }); },
        addDamageIndicator() {},
        getEntityByUUID(UUID) {
            return this.entities.find(entity => entity.UUID === UUID) || null;
        },
    };
    runtime.world = world;
    runtime.GAMERULES = {
        doMobLoot: true,
        doMobGriefing: true,
        doDaylightCycle: true,
    };
    runtime.deltaTime = 0.05;
    runtime.passedTime = 0;
    return world;
}

function makeTarget({
    UUID,
    name,
    type = EntityTypes.Mob,
    x = 0,
    y = 0,
    width = 32,
    height = 48,
    isHostile = false,
} = {}) {
    return {
        UUID,
        name,
        entityTypeName: name,
        type,
        position: new Vector2(x, y),
        hitbox: new Vector2(width, height),
        velocity: new Vector2(),
        targetVelocity: new Vector2(),
        dimension: 0,
        health: 20,
        isHostile,
        abilities: { hasHealth: true },
        damageTaken: 0,
        hit(amount) {
            this.damageTaken += amount;
            return true;
        },
    };
}

test("crocodiles target players and tagged prey, but respect Peaceful and age", () => {
    const world = makeWorld();
    const croc = new Crocodile(world, { UUID: "croc" });
    const player = makeTarget({
        UUID: "player",
        name: "Player",
        type: EntityTypes.Player,
        x: BLOCK_SIZE * 2,
    });
    world.entities = [croc, player];
    assert.equal(croc.findTarget(), player);

    world.difficulty = "peaceful";
    assert.equal(croc.findTarget(), null);

    world.difficulty = "easy";
    const pig = makeTarget({ UUID: "pig", name: "Pig", x: BLOCK_SIZE });
    world.entities = [croc, pig];
    assert.equal(croc.findTarget(), pig);

    const baby = new Crocodile(world, {
        UUID: "baby",
        babyAgeTicks: 100,
    });
    world.entities = [baby, player, pig];
    assert.equal(baby.findTarget(), null);
});

test("tamed crocodiles defend against monsters but ignore Creepers", () => {
    const world = makeWorld();
    const croc = new Crocodile(world, {
        UUID: "tamed",
        tamed: true,
        ownerUUID: "owner",
    });
    const zombie = makeTarget({
        UUID: "zombie",
        name: "Zombie",
        isHostile: true,
        x: BLOCK_SIZE,
    });
    const creeper = makeTarget({
        UUID: "creeper",
        name: "Creeper",
        isHostile: true,
        x: BLOCK_SIZE / 2,
    });
    world.entities = [croc, zombie, creeper];
    assert.equal(croc.findTarget(), zombie);
});

test("the source armor value reduces crocodile damage before health changes", () => {
    const world = makeWorld();
    const croc = new Crocodile(world, { UUID: "armored" });
    croc.hurtCooldown = 0;
    croc.hit(10, 0, 0, "Test hit");
    assert.ok(Math.abs(croc.health - 21.2) < 0.0001);
});

test("a water lunge grabs small prey and the 40-tick death roll deals repeated damage", () => {
    const world = makeWorld();
    const croc = new Crocodile(world, { UUID: "croc" });
    const prey = makeTarget({
        UUID: "prey",
        name: "Pig",
        x: BLOCK_SIZE * 2,
        width: 20,
        height: 20,
    });
    prey.world = world;
    world.entities = [croc, prey];
    croc.swimming = true;
    croc.currentTarget = prey;
    croc.startLunge();

    for (let tick = 0; tick < 6; tick++) croc.advanceAction(0.05);
    assert.equal(prey.damageTaken, 10);
    assert.equal(croc.action, "death_roll");
    assert.equal(prey.crocodileGrabbedByUUID, croc.UUID);
    Entity.prototype.updatePositionWithVelocity.call(prey);
    assert.deepEqual(prey.position, croc.getGrabPosition(prey));

    for (let tick = 0; tick < 10; tick++) croc.advanceAction(0.05);
    assert.equal(prey.damageTaken, 15);
    for (let tick = 0; tick < 30; tick++) croc.advanceAction(0.05);
    assert.equal(croc.action, null);
    assert.equal(prey.crocodileGrabbedByUUID, null);
});

test("rotten flesh breeding makes one parent egg-bearing and owner commands toggle sitting", () => {
    const world = makeWorld();
    const first = new Crocodile(world, { UUID: "first" });
    const second = new Crocodile(world, {
        UUID: "second",
        position: new Vector2(BLOCK_SIZE, 0),
    });
    const player = {
        UUID: "owner",
        abilities: { instaBuild: true },
    };
    world.entities = [first, second];
    first.interact(player, { itemId: Items.RottenFlesh });
    second.interact(player, { itemId: Items.RottenFlesh });
    assert.equal(first.hasEgg || second.hasEgg, true);

    const tamed = new Crocodile(world, {
        UUID: "tamed",
        tamed: true,
        ownerUUID: player.UUID,
        sitting: true,
    });
    assert.equal(tamed.interact(player, { itemId: null }), true);
    assert.equal(tamed.sitting, false);
    assert.equal(tamed.interact(player, { itemId: null }), true);
    assert.equal(tamed.sitting, true);
    assert.equal(tamed.interact(player, { itemId: Items.CookedBeef }), true);
    assert.equal(tamed.sitting, false);
    tamed.health = 10;
    assert.equal(tamed.interact(player, { itemId: Items.CookedBeef }), true);
    assert.equal(tamed.health, 20);
});

test("natural spawn checks require swamp substrate and nearby water", () => {
    const world = makeWorld();
    world.getBlockAtWorldPosition = (x, y) => {
        if (x === 0 && y === 128) {
            return { blockType: Blocks.GrassBlock, transform: { position: { x, y } } };
        }
        if (x === 0 && y === 64) {
            return { blockType: Blocks.Air, transform: { position: { x, y } } };
        }
        if (x === BLOCK_SIZE && y === 128) {
            return { blockType: Blocks.Water, transform: { position: { x, y } } };
        }
        return { blockType: Blocks.Air, transform: { position: { x, y } } };
    };
    assert.equal(
        Crocodile.canSpawnAt(world, 0, 128, "Swamp", 0),
        true,
    );
    assert.equal(
        Crocodile.canSpawnAt(world, 0, 128, "Desert", 0),
        false,
    );
});

test("the regular entity update steers a wild crocodile toward prey", () => {
    const world = makeWorld();
    world.getBlockAtWorldPosition = () => null;
    const dimension = dimensions[Dimensions.Overworld];
    const previousChunk = dimension.chunks.get(0);
    dimension.chunks.set(0, { generated: true });
    try {
        const croc = new Crocodile(world, { UUID: "moving-croc" });
        const pig = makeTarget({
            UUID: "moving-pig",
            name: "Pig",
            x: BLOCK_SIZE * 4,
        });
        world.entities = [croc, pig];
        for (let frame = 0; frame < 4; frame++) croc.update();
        assert.equal(croc.currentTarget, pig);
        assert.ok(croc.targetVelocity.x > 0);
    } finally {
        if (previousChunk) dimension.chunks.set(0, previousChunk);
        else dimension.chunks.delete(0);
    }
});

test("crocodile eggs crack at dawn, progress in other conditions, then hatch", () => {
    const world = makeWorld();
    world.getBlockAtWorldPosition = () => ({ blockType: Blocks.Sand });
    const egg = Object.create(Block.prototype);
    egg.world = world;
    egg.metaData = { hatch: 0, eggs: 1, hatchTicks: 0, wasDawn: false };
    egg.blockType = Blocks.CrocodileEgg;
    egg.dimensionIndex = 0;
    egg.transform = { position: { x: 0, y: 64 } };
    egg.syncMetaData = () => {};
    const visualStages = [];
    egg.setState = stage => visualStages.push(stage);
    let hatchedCount = 0;
    egg.hatchCrocodileEggs = count => { hatchedCount = count; };

    const previousRandom = Math.random;
    try {
        Math.random = () => 0;
        runtime.day = true;
        runtime.time = 6.6;
        egg.crocodileEggLogic();
        assert.equal(egg.metaData.hatch, 1);
        assert.deepEqual(visualStages, [1]);

        runtime.time = 7;
        egg.crocodileEggLogic();
        assert.equal(egg.metaData.hatch, 2);
        assert.deepEqual(visualStages, [1, 2]);
        egg.crocodileEggLogic();
        assert.equal(hatchedCount, 1);
    } finally {
        Math.random = previousRandom;
    }
});

test("crocodile save data retains health, ownership, eggs, and age", () => {
    const crocodile = new Crocodile(makeWorld(), {
        UUID: "croc",
        health: 18,
        tamed: true,
        ownerUUID: "owner",
        sitting: true,
        hasEgg: true,
        babyAgeTicks: 400,
    });
    const saved = crocodile.createSaveData();
    assert.equal(saved.health, 18);
    assert.equal(saved.tamed, true);
    assert.equal(saved.ownerUUID, "owner");
    assert.equal(saved.hasEgg, true);
    assert.equal(saved.babyAgeTicks, 400);
});

test("crocodile renders as the articulated Alex's Mobs cube rig", () => {
    const atlas = { width: 256, height: 256 };
    const rig = createAlexCrocodileRig(atlas, new THREE.Texture(atlas));
    const meshes = [];
    rig.group.traverse(object => {
        if (object.isMesh) meshes.push(object);
    });
    assert.ok(meshes.length >= 20);
    assert.ok(rig.pivots.tail1 && rig.pivots.tail2 && rig.pivots.tail3);
    assert.equal(rig.crown.visible, false);

    updateAlexCrocodileRig(rig, {
        direction: 1,
        velocity: { x: 0 },
        swimPhase: 0,
        swimming: false,
        tamed: true,
        baskingTimer: 0,
        action: "death_roll",
        actionTicks: 20,
        crowned: false,
    }, 0);
    assert.equal(rig.model.rotation.y, -Math.PI / 2);
    assert.equal(rig.pivots.body.rotation.z, -Math.PI * 3);

    for (const mesh of meshes) mesh.geometry.dispose();
    for (const texture of rig.textures) texture.dispose();
    for (const material of rig.materials) material.dispose();
});

test("voxel renderer adds the crocodile rig to the scene", () => {
    const atlas = { width: 256, height: 256 };
    const previousLoad = THREE.TextureLoader.prototype.load;
    THREE.TextureLoader.prototype.load = () => new THREE.Texture(atlas);
    const scene = { objects: [], add(object) { this.objects.push(object); } };
    try {
        const renderer = new VoxelEntities(scene);
        const image = { width: 256, height: 256, complete: true, naturalWidth: 256, src: "crocodile.png" };
        const record = renderer.create({
            isCrocodile: true,
            body: { image, sprite: "alexsmobs/crocodile_0.png" },
        });
        assert.ok(record?.crocodileRig);
        assert.equal(scene.objects[0], record.group);
        record.group.traverse(object => object.geometry?.dispose());
        for (const texture of record.textures) texture.dispose();
        for (const material of record.materials) material.dispose();
    } finally {
        THREE.TextureLoader.prototype.load = previousLoad;
    }
});
