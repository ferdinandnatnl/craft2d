import test from "node:test";
import assert from "node:assert/strict";

class TestImage {
    set src(value) {
        this._src = value;
        this.complete = true;
        this.naturalWidth = value.includes("catfish_small") ? 64 : 128;
        this.width = this.naturalWidth;
        this.height = this.naturalWidth;
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
    { Catfish, catfishSpawnSize },
    { Block },
    { Vector2 },
    { EntityTypes },
    { Blocks },
    { blockTypes },
    { Items },
    { getItem },
    { runtime },
    { BLOCK_SIZE },
    { VoxelEntities },
    { createAlexCatfishRig, updateAlexCatfishRig },
    { entityRegistry },
    { Entities },
] = await Promise.all([
    import("../Assets/entities/mobs/catfish.js"),
    import("../Assets/world/block.js"),
    import("../Assets/utils/classes.js"),
    import("../Assets/game/entity.js"),
    import("../../Shared/blocks.js"),
    import("../../Shared/blocks.js"),
    import("../../Shared/items.js"),
    import("../../Shared/item.js"),
    import("../Assets/utils/runtime.js"),
    import("../Assets/utils/globals.js"),
    import("../Assets/rendering/entities.js"),
    import("../Assets/rendering/alexsMobsCatfishRig.js"),
    import("../Assets/entities/entityRegistry.js"),
    import("../Assets/entities/entities.js"),
]);

function makeWorld() {
    const chunk = { x: 0, biome: { name: "River" }, entities: [] };
    const world = {
        entities: [],
        drops: [],
        removed: [],
        blockOverrides: new Map(),
        difficulty: "easy",
        getChunkForX: () => chunk,
        getBlockAtWorldPosition(x, y) {
            return this.blockOverrides.get(`${Math.floor(x / BLOCK_SIZE)},${Math.floor(y / BLOCK_SIZE)}`) ||
                { blockType: Blocks.Water };
        },
        removeEntity(entity) {
            this.removed.push(entity);
            this.entities = this.entities.filter(entry => entry !== entity);
        },
        spawnDrop(position, item) {
            const drop = {
                position: new Vector2(position.x, position.y),
                hitbox: new Vector2(12, 12),
                type: EntityTypes.Drop,
                dimension: 0,
                isReady: true,
                spawnedAt: runtime.passedTime,
                ...item,
            };
            this.drops.push(drop);
            this.entities.push(drop);
            return drop;
        },
        addDamageIndicator() {},
        getEntityByUUID(UUID) {
            return this.entities.find(entity => entity.UUID === UUID) || null;
        },
    };
    runtime.world = world;
    runtime.GAMERULES = { doMobLoot: true, doMobGriefing: true, doDaylightCycle: true };
    runtime.game = { settings: { sfxVolume: 0 } };
    runtime.deltaTime = 0.05;
    runtime.passedTime = 0;
    return world;
}

test("Catfish keeps the source sizes, health, storage capacity, and spawn variants", () => {
    const world = makeWorld();
    assert.equal(Entities.Catfish, Catfish);
    const small = new Catfish(world, { catfishSize: 0 });
    const medium = new Catfish(world, { catfishSize: 1 });
    const large = new Catfish(world, { catfishSize: 2 });
    assert.deepEqual(
        [small.maxHealth, medium.maxHealth, large.maxHealth],
        [10, 20, 30],
    );
    assert.deepEqual(
        [small.hitbox.x / BLOCK_SIZE, medium.hitbox.x / BLOCK_SIZE, large.hitbox.x / BLOCK_SIZE],
        [0.9, 1.25, 1.9],
    );
    for (const itemId of [Items.RawCatfish, Items.CookedCatfish, Items.Bone]) {
        small.addStomachItem({ itemId, count: 1 });
    }
    assert.equal(small.isFull(), true);
    assert.equal(medium.isFull(), false);
    assert.equal(large.isFull(), false);
    assert.equal(catfishSpawnSize("Swamp", sequence(0.1, 0.9)), 1);
    assert.equal(catfishSpawnSize("Swamp", sequence(0.9, 0.09)), 2);
    assert.equal(catfishSpawnSize("Plains", sequence(0.9, 0.1)), 0);
});

test("Sea Lantern and Sea Pickle support blocks use the registered placeable vanilla items", () => {
    const seaLantern = blockTypes.find(block => block.blockId === Blocks.SeaLantern);
    const seaPickle = blockTypes.find(block => block.blockId === Blocks.SeaPickle);
    assert.equal(getItem(Items.SeaLantern).placeBlock, Blocks.SeaLantern);
    assert.equal(getItem(Items.SeaPickle).placeBlock, Blocks.SeaPickle);
    assert.equal(seaLantern.lightLevel, 15);
    assert.equal(seaPickle.lightLevel, 6);
    assert.equal(seaPickle.collision, false);
});

test("Sea Pickle cluster metadata controls source light levels from one to four", () => {
    const pickle = Object.create(Block.prototype);
    pickle.blockType = Blocks.SeaPickle;
    pickle.lightSourceLevel = 6;
    pickle.wall = false;
    pickle.markChunkDirty = () => {};

    pickle.setMetaData();
    assert.equal(pickle.metaData.waterlogged, true);
    assert.equal(pickle.metaData.pickles, 1);
    assert.equal(pickle.lightSourceLevel, 6);

    assert.equal(pickle.addSeaPickle(), true);
    assert.equal(pickle.metaData.pickles, 2);
    assert.equal(pickle.lightSourceLevel, 9);
    assert.equal(pickle.addSeaPickle(), true);
    assert.equal(pickle.lightSourceLevel, 12);
    assert.equal(pickle.addSeaPickle(), true);
    assert.equal(pickle.lightSourceLevel, 15);
    assert.equal(pickle.addSeaPickle(), false);

    pickle.setBlockMetaData({ waterlogged: false, pickles: 4 });
    assert.equal(pickle.lightSourceLevel, 0);
});

test("Sea Lantern items tempt Catfish and nearby Sea Lantern blocks attract unfilled fish", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 0 });
    const player = {
        type: EntityTypes.Player,
        position: new Vector2(BLOCK_SIZE * 4, 0),
        hitbox: new Vector2(BLOCK_SIZE * 0.8, BLOCK_SIZE * 1.8),
        dimension: 0,
        health: 20,
        holdItem: { itemId: Items.SeaLantern },
    };
    world.player = player;
    world.entities = [catfish, player];

    assert.equal(catfish.findLanternPlayer(), player);
    catfish.update();
    assert.ok(catfish.targetPosition);
    assert.equal(catfish.foodTarget, null);

    player.holdItem = { itemId: Items.Bucket };
    catfish.lanternScanTicks = 1;
    world.blockOverrides.set("2,0", { blockType: Blocks.SeaLantern });
    catfish.tickUpdate();
    assert.deepEqual(catfish.lanternTargetBlock, new Vector2(BLOCK_SIZE * 2.5, BLOCK_SIZE * 0.5));
});

test("Sea Pickles behave as water for aquatic navigation and make Catfish spit", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 0 });
    world.blockOverrides.set("0,0", {
        blockType: Blocks.SeaPickle,
        metaData: { waterlogged: true, pickles: 1 },
    });
    assert.equal(catfish.isInWater(), true);
    assert.ok(catfish.findSeaPickleContact());
    world.blockOverrides.set("0,0", {
        blockType: Blocks.SeaPickle,
        metaData: { waterlogged: false, pickles: 1 },
    });
    assert.equal(catfish.isInWater(), false);
    world.blockOverrides.set("0,0", {
        blockType: Blocks.SeaPickle,
        metaData: { waterlogged: true, pickles: 1 },
    });

    catfish.stomachItems = [{ itemId: Items.RawCatfish, count: 1 }];
    catfish.tickUpdate();
    assert.equal(catfish.spitTime, 10);
    assert.equal(catfish.stomachItems.length, 0);
    assert.equal(world.drops.length, 1);

    catfish.stomachItems = [{ itemId: Items.RawCatfish, count: 2 }];
    assert.equal(catfish.interact({ abilities: {} }, { itemId: Items.SeaPickle }), true);
    assert.equal(catfish.stomachItems.length, 0);
    assert.equal(world.drops.length, 2);
});

test("small and medium Catfish collect item drops and spit them with a pickup delay", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 1 });
    const drop = {
        type: EntityTypes.Drop,
        itemId: Items.RawCatfish,
        count: 3,
        position: new Vector2(0, 0),
        hitbox: new Vector2(12, 12),
        dimension: 0,
    };
    assert.equal(catfish.pickUpItem(drop), true);
    assert.deepEqual(catfish.stomachItems, [{ itemId: Items.RawCatfish, count: 3 }]);
    runtime.passedTime = 20;
    catfish.spit();
    assert.equal(catfish.spitTime, 10);
    assert.equal(catfish.stomachItems.length, 0);
    assert.equal(world.drops.length, 1);
    assert.equal(world.drops[0].pickupDelayUntil, 21.5);
});

test("large Catfish swallow eligible registered mobs and spit them back at one quarter health", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 2 });
    const pig = {
        UUID: "pig-1",
        name: "Pig",
        entityTypeName: "Pig",
        type: EntityTypes.Mob,
        position: new Vector2(BLOCK_SIZE, 0),
        hitbox: new Vector2(BLOCK_SIZE * 0.7, BLOCK_SIZE * 0.8),
        dimension: 0,
        health: 8,
        createSaveData: () => ({ UUID: "pig-1", health: 8 }),
    };
    world.entities = [catfish, pig];
    assert.equal(catfish.dimension, 0);
    assert.equal(entityRegistry.Entities.Pig, Entities.Pig);
    assert.equal(catfish.isFoodTargetValid(pig), true);
    assert.equal(catfish.swallowEntity(pig), true);
    assert.equal(catfish.swallowedEntity.type, "Pig");
    let spawned = null;
    world.summonEntity = (Type, position, props) => {
        assert.equal(Type, entityRegistry.Entities.Pig);
        spawned = {
            type: EntityTypes.Mob,
            maxHealth: 20,
            health: props.health,
            position,
            dimension: props.dimension,
        };
        return spawned;
    };
    assert.equal(catfish.spitSwallowedEntity(), true);
    assert.equal(spawned.health, 5);
    assert.equal(world.getChunkForX(0).entities.includes(spawned), true);
    assert.equal(catfish.swallowedEntity, null);
});

test("large Catfish target and lethally bite a nearby player", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 2 });
    const player = {
        type: EntityTypes.Player,
        position: new Vector2(1, 1),
        hitbox: new Vector2(40, 80),
        dimension: 0,
        health: 20,
        abilities: { hasHealth: true },
        hit(damage) { this.damageReceived = damage; },
    };
    world.player = player;
    world.entities = [catfish, player];
    catfish.foodTarget = player;
    catfish.tryEatFoodTarget();
    assert.equal(player.damageReceived, 12000);
});

test("Catfish save data and bucket state preserve size, inventory, and swallowed mobs", () => {
    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 2, fromBucket: true });
    catfish.swallowedEntity = { type: "Pig", health: 8, state: { UUID: "pig-1" } };
    const saved = catfish.createSaveData();
    const restored = new Catfish(world, saved);
    assert.equal(restored.catfishSize, 2);
    assert.equal(restored.fromBucket, true);
    assert.deepEqual(restored.swallowedEntity, catfish.swallowedEntity);
    assert.deepEqual(restored.createBucketData().swallowedEntity, catfish.swallowedEntity);
});

test("source Catfish model atlases build and animate all three articulated sizes", () => {
    const sizes = ["small", "medium", "large"];
    for (const [size, sizeName] of sizes.entries()) {
        const image = { src: `catfish_${sizeName}.png`, width: size === 0 ? 64 : 128, height: size === 0 ? 64 : 128 };
        const rig = createAlexCatfishRig(image, size);
        const entity = {
            direction: 1,
            swimPhase: Math.PI / 2,
            velocity: new Vector2(40, 0),
            spitTime: 0,
        };
        updateAlexCatfishRig(rig, entity, 1);
        assert.equal(rig.sizeName, sizeName);
        assert.equal(rig.catfishRig, true);
        assert.ok(rig.pivots.tail && rig.pivots.tailFin);
        assert.ok(rig.group.children.length > 0);
    }

    const world = makeWorld();
    const catfish = new Catfish(world, { catfishSize: 2 });
    const scene = { added: [], add(group) { this.added.push(group); }, remove() {} };
    const renderer = new VoxelEntities(scene);
    const record = renderer.create(catfish);
    assert.equal(record.catfishRig, true);
    assert.equal(scene.added[0], record.group);
    renderer.remove(catfish);
});

function sequence(...values) {
    let index = 0;
    return () => values[index++] ?? values.at(-1) ?? 0;
}
