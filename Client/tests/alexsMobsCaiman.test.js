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

const [
    { Caiman },
    { Vector2 },
    { Entity, EntityTypes },
    { Blocks },
    { Items, items },
    { runtime },
    { BLOCK_SIZE },
    { Block },
    { createAlexCaimanRig, updateAlexCaimanRig },
    { VoxelEntities },
    { Entities },
] = await Promise.all([
    import("../Assets/entities/mobs/caiman.js"),
    import("../Assets/utils/classes.js"),
    import("../Assets/game/entity.js"),
    import("../../Shared/blocks.js"),
    import("../../Shared/items.js"),
    import("../Assets/utils/runtime.js"),
    import("../Assets/utils/globals.js"),
    import("../Assets/world/block.js"),
    import("../Assets/rendering/alexsMobsCaimanRig.js"),
    import("../Assets/rendering/entities.js"),
    import("../Assets/entities/entities.js"),
]);

function makeWorld() {
    const world = {
        entities: [],
        difficulty: "easy",
        getBlockAtWorldPosition: () => null,
        removeEntity() {},
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
    runtime.game = { settings: { sfxVolume: 0 } };
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
        abilities: { hasHealth: true },
        damageTaken: 0,
        hit(amount) {
            this.damageTaken += amount;
            return true;
        },
    };
}

test("Caiman is a separate swamp species with source-sized spawn rules", () => {
    assert.equal(Entities.Caiman, Caiman);
    const world = makeWorld();
    const feetY = 4 * BLOCK_SIZE;
    const blocks = new Map([
        [`0,${feetY}`, { blockType: Blocks.GrassBlock }],
        [`0,${feetY - BLOCK_SIZE}`, { blockType: Blocks.Air }],
        [`${BLOCK_SIZE},${feetY}`, { blockType: Blocks.Water }],
    ]);
    world.getBlockAtWorldPosition = (x, y) => blocks.get(`${x},${y}`) || null;
    assert.equal(Caiman.canSpawnAt(world, 0, feetY, "Swamp", 0), true);
    assert.equal(Caiman.canSpawnAt(world, 0, feetY, "Desert", 0), false);
});

test("wild Caimans hunt source prey and ignore players", () => {
    const world = makeWorld();
    const caiman = new Caiman(world, { UUID: "wild-caiman" });
    const player = makeTarget({
        UUID: "player",
        name: "Player",
        type: EntityTypes.Player,
        x: BLOCK_SIZE,
    });
    const chicken = makeTarget({
        UUID: "chicken",
        name: "Chicken",
        x: BLOCK_SIZE * 3,
    });
    world.entities = [caiman, player, chicken];
    assert.equal(caiman.findTarget(), chicken);
});

test("tamed Caimans defend an owner against the mob that hurt them", () => {
    const world = makeWorld();
    const caiman = new Caiman(world, {
        UUID: "tamed-caiman",
        tamed: true,
        ownerUUID: "owner",
    });
    const owner = makeTarget({
        UUID: "owner",
        name: "Player",
        type: EntityTypes.Player,
    });
    const zombie = makeTarget({ UUID: "zombie", name: "Zombie", x: BLOCK_SIZE });
    owner.flashColor = () => {};
    owner.decreaseHealth = damage => { owner.health -= damage; };
    owner.world = world;
    owner.hurtCooldown = 0;
    world.entities = [caiman, owner, zombie];
    Entity.prototype.damage.call(owner, 2, zombie);
    assert.equal(owner.retaliationTarget, zombie);
    assert.equal(caiman.findTarget(), zombie);
    assert.equal(caiman.grabDefendOwner, true);
});

test("Caimans remember and retaliate against players who attack them", () => {
    const world = makeWorld();
    const caiman = new Caiman(world, { UUID: "caiman" });
    const player = makeTarget({
        UUID: "player",
        name: "Player",
        type: EntityTypes.Player,
    });
    world.entities = [caiman, player];
    caiman.hurtCooldown = 0;
    caiman.hit(2, 0, 0, "Test hit", player);
    assert.equal(caiman.findTarget(), player);
});

test("Caiman grab pins prey and applies the source attack damage", () => {
    const world = makeWorld();
    const caiman = new Caiman(world, { UUID: "caiman" });
    const prey = makeTarget({ UUID: "prey", name: "Pig", x: BLOCK_SIZE });
    world.entities = [caiman, prey];
    caiman.chaseTarget(prey, 0.05);
    assert.equal(caiman.direction, 1);
    assert.equal(prey.damageTaken, 3);
    assert.equal(caiman.getGrabbedTarget(), prey);
    assert.equal(prey.position.y, caiman.position.y + (caiman.hitbox.y - prey.hitbox.y) / 2);
});

test("Caiman eggs share reptile cracking and hatch the right species", () => {
    const world = makeWorld();
    world.getBlockAtWorldPosition = () => ({ blockType: Blocks.Sand });
    const egg = Object.create(Block.prototype);
    egg.world = world;
    egg.metaData = { hatch: 2, eggs: 3, hatchTicks: 0, wasDawn: true };
    egg.blockType = Blocks.CaimanEgg;
    egg.dimensionIndex = 0;
    egg.transform = { position: { x: 0, y: 64 } };
    let hatched = 0;
    egg.hatchCaimanEggs = count => { hatched = count; };
    const previousRandom = Math.random;
    try {
        Math.random = () => 0;
        runtime.day = true;
        runtime.time = 7;
        egg.reptileEggLogic();
        assert.equal(hatched, 3);
    } finally {
        Math.random = previousRandom;
    }
});

test("Caiman eggs hatch tame and sitting babies near a player", () => {
    const world = makeWorld();
    const player = makeTarget({
        UUID: "owner",
        name: "Player",
        type: EntityTypes.Player,
        x: 0,
        y: 64,
    });
    world.entities = [player];
    world.getBlockWorldPosition = () => new Vector2(0, 64);
    world.setBlockTypeAtPosition = () => true;
    const chunk = { entities: [] };
    world.getChunkForX = () => chunk;
    world.summonEntity = (Type, position, props) => {
        const entity = new Type(world, { ...props, position });
        world.entities.push(entity);
        return entity;
    };
    const egg = Object.create(Block.prototype);
    egg.world = world;
    egg.chunkX = 0;
    egg.dimensionIndex = 0;
    egg.hatchCaimanEggs(3);
    const hatchlings = world.entities.filter(entity => entity.isCaiman);
    assert.equal(hatchlings.length, 3);
    assert.ok(hatchlings.every(entity => entity.isBaby && entity.tamed &&
        entity.ownerUUID === "owner" && entity.command === 2));
});

test("Caiman food and ownership state register for inventory and saves", () => {
    const world = makeWorld();
    const caiman = new Caiman(world, {
        UUID: "saved-caiman",
        health: 17,
        tamed: true,
        ownerUUID: "owner",
        command: 2,
        hasEgg: true,
        babyAgeTicks: 400,
    });
    const saved = caiman.createSaveData();
    assert.equal(saved.health, 17);
    assert.equal(saved.command, 2);
    assert.equal(saved.hasEgg, true);
    assert.equal(saved.babyAgeTicks, 400);
    assert.equal(items.find(item => item.itemId === Items.RawCatfish)?.smeltOutput.itemId,
        Items.CookedCatfish);
    assert.equal(items.find(item => item.itemId === Items.CaimanEgg)?.placeBlock,
        Blocks.CaimanEgg);
});

test("Caiman renders with the articulated source atlas and is added to the scene", () => {
    const atlas = { width: 128, height: 128, src: "caiman.png" };
    const rig = createAlexCaimanRig(atlas);
    const meshes = [];
    rig.group.traverse(object => {
        if (object.isMesh) meshes.push(object);
    });
    assert.ok(meshes.length >= 18);
    assert.ok(rig.pivots.tail1 && rig.pivots.tail2 && rig.pivots.tail3);
    assert.ok(rig.pivots.head && rig.pivots.bottomJaw && rig.pivots.topJaw);
    updateAlexCaimanRig(rig, {
        direction: 1,
        velocity: { x: 0 },
        swimPhase: 0,
        swimming: false,
        isBaby: false,
        tamed: false,
        command: 0,
        bellowing: false,
        grabbedTargetUUID: null,
    }, 0);
    assert.equal(rig.model.rotation.y, -Math.PI / 2);
    rig.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rig.group);
    const modelSize = bounds.getSize(new THREE.Vector3());
    assert.ok(bounds.min.y >= -0.03);
    assert.ok(bounds.max.y < 0.5);
    assert.ok(modelSize.x > 1.4 && modelSize.x < 1.8);

    const scene = { objects: [], add(object) { this.objects.push(object); } };
    const renderer = new VoxelEntities(scene);
    const image = {
        width: 128,
        height: 128,
        complete: true,
        naturalWidth: 128,
        src: "caiman.png",
    };
    const record = renderer.create({
        isCaiman: true,
        body: { image, sprite: "alexsmobs/caiman.png" },
    });
    assert.ok(record?.caimanRig);
    assert.equal(scene.objects[0], record.group);
    for (const mesh of meshes) mesh.geometry.dispose();
    rig.texture.dispose();
    rig.material.dispose();
    record.group.traverse(object => object.geometry?.dispose());
    record.texture.dispose();
    record.material.dispose();
});
