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

const [{ Blocks }, { runtime }, { Vector2 }, { EntityTypes }, , { Minion, MinionState }, { Items }, { DEFAULT_MINION_CONFIG }] =
    await Promise.all([
        import("../../Shared/blocks.js"),
        import("../Assets/utils/runtime.js"),
        import("../Assets/utils/classes.js"),
        import("../Assets/game/entity.js"),
        import("../Assets/game/inventoryItem.js"),
        import("../Assets/entities/mobs/minion.js"),
        import("../../Shared/items.js"),
        import("../Assets/entities/minions/config.js"),
    ]);
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => ({ unref() {} });
let World;
try {
    ({ World } = await import("../Assets/world/world.js"));
} finally {
    globalThis.setInterval = originalSetInterval;
}

function createWorld(blockAt = () => ({ blockType: Blocks.Air })) {
    const chunk = { x: 0, entities: [], generated: true };
    return {
        entities: [],
        minionReservations: new Map(),
        getChunkForX: () => chunk,
        getDimensionChunks: () => new Map([[0, chunk]]),
        getBlockAtWorldPosition(worldX, worldY) {
            return blockAt(
                Math.floor(worldX / 64),
                Math.floor(worldY / 64),
            );
        },
        removeEntity(entity) {
            this.entities = this.entities.filter((entry) => entry !== entity);
        },
    };
}

function addMinion(world) {
    const minion = new Minion(world, {
        position: new Vector2(0, 0),
        ownerUUID: "owner",
    });
    world.entities.push(minion);
    return minion;
}

function createMinion(blockAt = () => ({ blockType: Blocks.Air })) {
    const world = createWorld(blockAt);
    return { minion: addMinion(world), world };
}

test("move orders enter the movement state instead of resource search", () => {
    const { minion } = createMinion();

    minion.setJob({ type: "move", target: { x: 4, y: 8 } }, { sync: false });

    assert.equal(minion.state, MinionState.MovingToTarget);
});

test("minion mining tracks block damage for the destroy overlay", () => {
    const { minion } = createMinion();
    const block = {
        transform: { position: { x: 3 * 64, y: 6 * 64 } },
        wall: false,
        breakingSound: [],
    };

    minion.beginMiningBlock(block, "3,6");
    minion.advanceMiningProgress(block, 0.25, 0.1);

    assert.deepEqual(minion.miningBlockPosition, { x: 3, y: 6, wall: false });
    assert.equal(minion.miningProgress, 0.4);
    assert.equal(minion.miningStage, 4);

    minion.clearMiningProgress();
    assert.equal(minion.miningBlockPosition, null);
    assert.equal(minion.miningStage, 0);
});

test("restored minions keep their saved UUID", () => {
    const world = createWorld();
    const minion = new Minion(world, {
        position: new Vector2(0, 0),
        ownerUUID: "owner",
        UUID: "saved-minion-id",
    });

    assert.equal(minion.UUID, "saved-minion-id");
});

test("minions keep their movement command between AI updates", () => {
    const { minion, world } = createMinion();
    world.entities.push({ UUID: "owner", type: EntityTypes.Player, health: 20 });
    minion.state = MinionState.MovingToTarget;
    minion.noCollision = true;
    minion.noGravity = true;
    minion.getCurrentChunk = () => ({ generated: true });
    minion.body = null;
    minion.targetVelocity.x = minion.speed * 64;
    minion.updateWorkerAI = () => {
        minion.targetVelocity.x = minion.speed * 64;
    };
    minion.updateNetworkState = () => {};

    const previousDeltaTime = runtime.deltaTime;
    runtime.deltaTime = 1 / 60;
    try {
        for (let frame = 0; frame < 30; frame++) minion.update();
        assert.ok(minion.position.x > 24);
    } finally {
        runtime.deltaTime = previousDeltaTime;
    }
});

test("minion walk animation follows the original biped tick timing", () => {
    const { minion } = createMinion();
    const previousDelta = runtime.deltaTime;
    runtime.deltaTime = 0.05;
    minion.grounded = true;
    minion.updateEntity = () => {
        minion.position.x += 96 * runtime.deltaTime;
        minion.grounded = true;
    };

    try {
        minion.update();

        assert.ok(Math.abs(minion.walkAnimationAmount - 0.12) < 1e-8);
        assert.ok(Math.abs(minion.walkAnimationPhase - 0.12) < 1e-8);
    } finally {
        runtime.deltaTime = previousDelta;
    }
});

test("woodcut orders route to a nearby tree and break its logs", () => {
    const blocks = new Map();
    const setBlock = (x, y, blockType) => blocks.set(`${x},${y}`, blockType);
    for (let x = -8; x <= 12; x++) setBlock(x, 8, Blocks.Stone);
    for (let y = 4; y <= 7; y++) setBlock(3, y, Blocks.OakLog);
    const world = createWorld((x, y) => {
        const blockType = blocks.get(`${x},${y}`) ?? Blocks.Air;
        if (blockType === Blocks.Air) return { blockType };
        return {
            blockType,
            x,
            y,
            chunkX: 0,
            transform: { position: new Vector2(x * 64, y * 64) },
            breakBlock() { setBlock(x, y, Blocks.Air); },
            entityCollision() {},
            startEntityCollision() {},
            endEntityCollision() {},
        };
    });
    const minion = addMinion(world);
    const owner = { UUID: "owner", type: EntityTypes.Player, health: 20 };
    world.entities.push(owner);
    minion.position = new Vector2(0, 8 * 64 - minion.hitbox.y);
    minion.grounded = true;
    minion.noGravity = true;
    minion.getCurrentChunk = () => ({ generated: true });
    minion.updateNetworkState = () => {};
    minion.setJob({ type: "woodcut", target: { x: 3, y: 6 } }, { sync: false });

    const previousDeltaTime = runtime.deltaTime;
    const previousRules = runtime.GAMERULES;
    const previousWorld = runtime.world;
    runtime.deltaTime = 1 / 60;
    runtime.GAMERULES = { ...previousRules, doMobGriefing: true };
    runtime.world = world;
    try {
        for (let frame = 0; frame < 900; frame++) minion.update();
        assert.ok(minion.position.x > 0, "the worker should move toward the tree");
        for (let y = 4; y <= 7; y++) {
            assert.equal(blocks.get(`3,${y}`), Blocks.Air,
                `the worker should break every connected tree log, including ${y}`);
        }
    } finally {
        runtime.deltaTime = previousDeltaTime;
        runtime.GAMERULES = previousRules;
        runtime.world = previousWorld;
    }
});

test("workers resume a strip mine after finishing a discovered vein", () => {
    const state = Minion.prototype.stateForJob.call(
        { _activeVein: [{ x: 3, y: 6 }] },
        { type: "stripmine", started: true },
    );

    assert.equal(state, MinionState.SearchingResources);
    assert.equal(
        Minion.prototype.stateForJob.call(
            { _activeVein: null },
            { type: "stripmine", started: true },
        ),
        MinionState.Excavating,
    );
});

test("the original strip mine advances horizontally for 80 segments", () => {
    const { minion } = createMinion();
    minion.job = {
        type: "stripmine",
        started: true,
        currentX: 0,
        currentY: 8,
        direction: 1,
        steps: 0,
    };
    minion.state = MinionState.Excavating;
    minion.blockAt = () => ({ blockType: Blocks.Air });
    minion.currentFootNode = () => ({ x: 1, y: 8 });

    minion.digNextTunnelStep(0.1);

    assert.equal(minion.job.currentX, 1);
    assert.equal(minion.job.steps, 1);
    assert.equal(minion.state, MinionState.Excavating);
});

test("default minion config matches the licensed mod's deed and block lists", () => {
    assert.equal(DEFAULT_MINION_CONFIG.evilDeedXPCost, 2);
    assert.equal(DEFAULT_MINION_CONFIG.evilDeeds.length, 27);
    assert.ok(DEFAULT_MINION_CONFIG.evilDeeds.includes("Become Pop Smash Star"));
    assert.deepEqual(DEFAULT_MINION_CONFIG.treeBlockNames, [
        "cactus",
        "brown mushroom block",
        "red mushroom block",
    ]);
    assert.deepEqual(DEFAULT_MINION_CONFIG.worthlessBlockNames, [
        "torch",
        "snow",
        "chest",
    ]);
});

test("workers deliver when a different item cannot fit in their occupied slots", () => {
    const { minion, world } = createMinion();
    minion.inventory.forEach((slot, index) => {
        slot.blockId = 10_000 + index;
        slot.itemId = null;
        slot.count = 1;
    });
    const drop = {
        type: EntityTypes.Drop,
        dimension: minion.dimension,
        isReady: true,
        position: new Vector2(0, 0),
        hitbox: new Vector2(8, 8),
        blockId: null,
        itemId: 20_000,
        count: 3,
        props: {},
    };
    world.entities.push(drop);

    minion.pickUpNearbyDrops();

    assert.equal(minion.state, MinionState.DeliveringResources);
    assert.equal(drop.count, 3);
    assert.equal(minion.inventory.length, 24);
    assert.equal(minion.inventory.reduce((total, slot) => total + slot.count, 0), 24);
});

test("ore orders discover every connected block in a vein", () => {
    const vein = new Map([
        ["4,6", Blocks.IronOre],
        ["4,7", Blocks.IronOre],
        ["5,5", Blocks.IronOre],
        ["8,6", Blocks.IronOre],
    ]);
    const { minion } = createMinion((x, y) => ({
        blockType: vein.get(`${x},${y}`) ?? Blocks.Air,
    }));
    minion.job = {
        type: "mine-vein",
        target: { x: 4, y: 6 },
        blockType: Blocks.IronOre,
    };

    const target = minion.findOreTarget();

    assert.deepEqual(
        minion.job.targets.map(({ x, y }) => `${x},${y}`).sort(),
        ["4,6", "4,7"],
    );
    assert.equal(target.blockType, Blocks.IronOre);
});

test("four workers reserve separate excavation targets", () => {
    const world = createWorld((x, y) => ({
        blockType: y === 7 || (y === 6 && x >= 0 && x <= 6 && x % 2 === 0)
            ? Blocks.Stone
            : Blocks.Air,
    }));
    const workers = Array.from({ length: 4 }, () => addMinion(world));

    for (const minion of workers) {
        minion.job = {
            type: "excavate",
            bounds: { minX: 0, maxX: 6, minY: 6, maxY: 6 },
        };
        minion.state = MinionState.SearchingResources;
        minion.navigateTo = () => true;
        minion.searchAndWork(1);
    }

    assert.equal(new Set(workers.map((minion) => minion.currentTargetKey)).size, 4);
    assert.ok(workers.every((minion) => minion.currentTarget));
});

test("workers stop a mining attempt when mob griefing is disabled", () => {
    const { minion } = createMinion();
    const previousRules = runtime.GAMERULES;
    runtime.GAMERULES = { doMobGriefing: false };
    minion.job = { type: "mine-vein" };
    minion.state = MinionState.Mining;
    minion.currentTarget = { x: 0, y: 6, blockType: Blocks.Stone };
    minion.currentTargetKey = "0:0,6";
    minion.miningKey = "0,6";
    minion.miningTimer = 5;
    minion.position = new Vector2(0, 0);
    minion.hitbox = new Vector2(32, 80);
    minion.canReachBlock = () => true;
    minion.blockAt = () => ({ blockType: Blocks.Stone });

    try {
        minion.workOnCurrentTarget(0.1);
        assert.equal(minion.state, MinionState.Unreachable);
        assert.equal(minion.currentTarget, null);
    } finally {
        runtime.GAMERULES = previousRules;
    }
});

test("workers use the original teleport fallback only after three failed paths", () => {
    const { minion } = createMinion();
    let teleports = 0;
    minion.job = { type: "move", target: { x: 4, y: 8 } };
    minion.teleportToNode = () => {
        teleports++;
        return true;
    };
    const destination = [{ x: 4, y: 8 }];

    assert.equal(minion.navigateTo(destination, "blocked"), false);
    assert.equal(minion.navigateTo(destination, "blocked"), false);
    assert.equal(minion.navigateTo(destination, "blocked"), true);
    assert.equal(teleports, 1);
});

test("following minions also use the original teleport fallback after three failures", () => {
    const { minion } = createMinion();
    let teleports = 0;
    minion.job = { type: "follow" };
    minion.teleportToNode = () => {
        teleports++;
        return true;
    };
    const destination = [{ x: 4, y: 8 }];

    assert.equal(minion.navigateTo(destination, "follow"), false);
    assert.equal(minion.navigateTo(destination, "follow"), false);
    assert.equal(minion.navigateTo(destination, "follow"), true);
    assert.equal(teleports, 1);
});

test("minions carry the matching original iron tool and respect its harvest level", () => {
    const { minion } = createMinion();
    const ore = { blockType: Blocks.IronOre };
    minion.setHeldToolForBlock(ore);
    assert.equal(minion.holdItem.itemId, Items.IronPickaxe);

    let dropped = null;
    const ironOreBlock = {
        ...ore,
        x: 0,
        y: 6,
        chunkX: 0,
        transform: { position: new Vector2(0, 6 * 64) },
        breakBlock(shouldDrop) { dropped = shouldDrop; },
    };
    assert.equal(minion.breakWorkerBlock(ironOreBlock), true);
    assert.equal(dropped, true);

    minion.setHeldToolForBlock({ blockType: Blocks.Obsidian });
    const obsidianBlock = {
        blockType: Blocks.Obsidian,
        x: 0,
        y: 6,
        chunkX: 0,
        transform: { position: new Vector2(0, 6 * 64) },
        breakBlock(shouldDrop) { dropped = shouldDrop; },
    };
    assert.equal(minion.breakWorkerBlock(obsidianBlock), true);
    assert.equal(dropped, false);
});

test("block mutation and worker drops keep their source dimension", () => {
    const calls = [];
    const world = {
        getDimensionChunks(dimension) {
            return new Map([[0, {
                setBlockTypeLocal(...args) { calls.push({ dimension, args }); },
            }]]);
        },
        summonEntity(_entity, position, props, _sync, UUID) {
            calls.push({ dropDimension: props.dimension, position, UUID });
            return { dimension: props.dimension };
        },
    };
    World.prototype.setBlockType.call(world, {
        chunkX: 0,
        x: 2,
        y: 9,
        wall: false,
        dimensionIndex: 2,
    }, Blocks.Air);
    World.prototype.spawnDrop.call(world, new Vector2(10, 20), {
        blockId: Blocks.Stone,
        count: 1,
    }, 2);

    assert.equal(calls[0].dimension, 2);
    assert.deepEqual(calls[0].args.slice(0, 4), [2, 9, Blocks.Air, false]);
    assert.equal(calls[1].dropDimension, 2);
});

test("ownerless workers use the original configured despawn timeout", () => {
    const { minion, world } = createMinion();
    let removed = false;
    world.removeEntity = () => { removed = true; };
    minion.ownerMissingTimer = 300;
    runtime.deltaTime = 0.1;

    minion.update();

    assert.equal(removed, true);
});
