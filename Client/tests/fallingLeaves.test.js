import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { runtime } from "../Assets/utils/runtime.js";
import {
    FALLING_LEAVES_DEFAULTS,
    advanceFallingLeafMotion,
    getFallingLeafProfile,
    getFallingLeafSpawnChance,
    normalizeFallingLeavesSettings,
    shouldSpawnFallingLeaf,
} from "../Assets/world/fallingLeafPhysics.js";

test("default leaf rates match Falling Leaves' deciduous and conifer defaults", () => {
    assert.equal(getFallingLeafSpawnChance(Blocks.OakLeaves), 0.01);
    assert.equal(getFallingLeafSpawnChance(Blocks.SpruceLeaves), 0);
    assert.equal(getFallingLeafSpawnChance(Blocks.JungleLeaves), 0);
});

test("conifer and per-block spawn rates can be changed", () => {
    const settings = normalizeFallingLeavesSettings({
        coniferLeafSpawnRate: 20,
        leafSpawnRates: { [Blocks.JungleLeaves]: 10 },
    });

    assert.equal(getFallingLeafSpawnChance(Blocks.SpruceLeaves, settings), 0.01);
    assert.equal(getFallingLeafSpawnChance(Blocks.JungleLeaves, settings), 0.005);
});

test("leaf spawn checks use the configured chance", () => {
    assert.equal(shouldSpawnFallingLeaf(Blocks.OakLeaves, 0.009), true);
    assert.equal(shouldSpawnFallingLeaf(Blocks.OakLeaves, 0.01), false);
    assert.equal(shouldSpawnFallingLeaf(Blocks.SpruceLeaves, 0), false);
});

test("unknown tree leaves use their own block texture and conifer rate", () => {
    const profile = getFallingLeafProfile(9001, {
        name: "Fir Leaves",
        sprite: "fir_leaves",
    });
    assert.equal(profile.kind, "conifer");
    assert.equal(profile.sprite, "fir_leaves");
    assert.equal(getFallingLeafSpawnChance(9001, FALLING_LEAVES_DEFAULTS, {
        name: "Fir Leaves",
        sprite: "fir_leaves",
    }), 0);
});

test("a block can override its falling-leaf texture", () => {
    assert.equal(
        getFallingLeafProfile(Blocks.OakLeaves, {
            particleSprite: "custom/oak_leaf",
        }).sprite,
        "custom/oak_leaf",
    );
});

test("wind steers leaves and gravity accelerates them downward", () => {
    const next = advanceFallingLeafMotion({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        gravity: 80,
        windCoefficient: 0.9,
        grounded: false,
        inWater: false,
    }, 0.05, 10);

    assert.ok(next.vx > 0);
    assert.ok(next.vy > 0);
    assert.ok(next.x > 0);
    assert.ok(next.y > 0);
});

test("grounded and floating leaves do not gain gravity", () => {
    const base = {
        x: 3,
        y: 7,
        vx: 0,
        vy: 0,
        gravity: 80,
        windCoefficient: 0.9,
    };

    assert.equal(advanceFallingLeafMotion({ ...base, grounded: true }, 0.1, 0).y, 7);
    assert.equal(advanceFallingLeafMotion({ ...base, inWater: true }, 0.1, 0).y, 7);
});

test("leaf settings are clamped to supported limits", () => {
    const settings = normalizeFallingLeavesSettings({
        enabled: false,
        leafSpawnRate: 99,
        leafSize: -4,
        leafLifespan: 900,
        maxParticles: 0,
    });

    assert.equal(settings.enabled, false);
    assert.equal(settings.leafSpawnRate, 40);
    assert.equal(settings.leafSize, 1);
    assert.equal(settings.leafLifespan, 600);
    assert.equal(settings.maxParticles, 1);
});

async function loadClientEmitter() {
    globalThis.document ??= {
        getElementById: () => null,
        querySelector: () => null,
    };
    globalThis.window ??= { location: { href: "http://localhost/" } };
    globalThis.window.location ??= { href: "http://localhost/" };
    globalThis.window.AudioContext ??= class {};
    globalThis.window.indexedDB ??= { open: () => ({}) };
    globalThis.Image ??= class {
        constructor() {
            this.width = 16;
            this.height = 16;
        }

        set src(value) {
            this._src = value;
        }
    };
    return import("../Assets/world/fallingLeaves.js");
}

test("breaking a leaf block emits leaf-shaped particles", async () => {
    const { FallingLeavesEmitter } = await loadClientEmitter();
    const emitter = new FallingLeavesEmitter({}, { random: () => 0 });

    emitter.spawnFromBlock({
        blockType: Blocks.OakLeaves,
        transform: { position: { x: 0, y: 0 } },
        dimensionIndex: 0,
        wall: false,
    });

    assert.equal(emitter.particles.length, 5);
});

test("loaded nearby leaves spawn client particles at the configured rate", async () => {
    const { FallingLeavesEmitter } = await loadClientEmitter();
    const previousDelta = runtime.deltaTime;
    const previousTime = runtime.passedTime;
    const leaf = {
        blockType: Blocks.OakLeaves,
        transform: { position: { x: 0, y: 0 } },
        dimensionIndex: 0,
    };
    const world = {
        seed: "test-seed",
        player: {
            position: { x: 0, y: 0 },
            hitbox: { x: 64, y: 64 },
            dimension: 0,
        },
        chunks_in_render_distance: new Map([[0, {
            x: 0,
            dimension: 0,
            blocks: [[leaf]],
        }]]),
        getBlockAtWorldPosition: () => null,
    };
    const emitter = new FallingLeavesEmitter(world, {
        settings: { leafSpawnRate: 40 },
        random: () => 0,
    });

    try {
        runtime.deltaTime = 1;
        runtime.passedTime = 1;
        emitter.update();
        assert.equal(emitter.particles.length, 12);
    } finally {
        runtime.deltaTime = previousDelta;
        runtime.passedTime = previousTime;
    }
});
