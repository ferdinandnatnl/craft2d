import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "@2dcraft.com/shared/blocks.js";

class TestAudio {
    static instances = [];

    constructor() {
        this.volume = 1;
        this.paused = true;
        this.src = "";
        TestAudio.instances.push(this);
    }
    cloneNode() {
        const clone = new TestAudio();
        clone.src = this.src;
        return clone;
    }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
}

globalThis.window = {
    location: { href: "http://localhost/game.html" },
    AudioContext: class {},
    addEventListener() {},
};
globalThis.Audio = TestAudio;
globalThis.Image = class {};
globalThis.localStorage = { getItem: () => null };
const documentListeners = new Map();
globalThis.document = {
    body: { classList: { toggle() {} } },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({}),
    addEventListener(name, listener) {
        const listeners = documentListeners.get(name) || [];
        listeners.push(listener);
        documentListeners.set(name, listeners);
    },
    removeEventListener(name, listener) {
        documentListeners.set(name,
            (documentListeners.get(name) || []).filter((entry) => entry !== listener));
    },
};

const [{ AmbientSoundscape, getAmbientContext }, { runtime }] = await Promise.all([
    import("../Assets/game/ambientSoundscape.js"),
    import("../Assets/utils/runtime.js"),
]);

function createWorld({ feetBlockY = 50, headWater = false, sunlit = true } = {}) {
    const biome = { name: "Plains", waterLevel: 10 };
    const world = {
        player: {
            dimension: 0,
            position: { x: 0, y: feetBlockY * 64 },
            hitbox: { x: 32, y: 64 },
        },
        generator: {
            getTerrainHeight: () => 50,
            calculateChunkBiome: () => biome,
        },
        getChunkForX: () => ({ biome }),
        getBlockAtWorldPosition: () => headWater
            ? { blockType: Blocks.Water, sunLight: false }
            : { blockType: Blocks.Air, sunLight: sunlit },
    };
    return world;
}

test("ambient context detects surface, caves, and deep caves from terrain and sky light", () => {
    const surface = getAmbientContext(createWorld());
    assert.equal(surface.underground, false);
    assert.equal(surface.inAir, false);

    const cave = getAmbientContext(createWorld({ feetBlockY: 62, sunlit: false }));
    assert.equal(cave.underground, true);
    assert.equal(cave.deepCave, false);

    const deepCave = getAmbientContext(createWorld({ feetBlockY: 72, sunlit: false }));
    assert.equal(deepCave.underground, true);
    assert.equal(deepCave.deepCave, true);
});

test("ambient context selects underwater audio only when the player's head is submerged", () => {
    const shallow = getAmbientContext(createWorld({ feetBlockY: 64, headWater: true }));
    assert.equal(shallow.underwater, true);
    assert.equal(shallow.deepWater, false);

    const deep = getAmbientContext(createWorld({ feetBlockY: 70, headWater: true }));
    assert.equal(deep.underwater, true);
    assert.equal(deep.deepWater, true);
});

test("ambient loops start after user activation and crossfade between dimensions", () => {
    runtime.game = { settings: { sfxVolume: 100 } };
    TestAudio.instances.length = 0;
    const world = createWorld();
    world.getChunkForX = () => ({ biome: { name: "Forest", waterLevel: 10 } });
    const soundscape = new AmbientSoundscape(world);

    soundscape.update(0.05);
    assert.equal(TestAudio.instances.length, 0);

    const pointerListeners = documentListeners.get("pointerdown") || [];
    pointerListeners[pointerListeners.length - 1]();
    assert.equal(soundscape.layers.size, 2);
    assert.ok([...soundscape.layers.values()].every(({ audio }) => !audio.paused));

    soundscape.update(0.1);
    assert.ok([...soundscape.layers.values()].some(({ audio }) => audio.volume > 0));

    world.player.dimension = 1;
    soundscape.update(0.05);
    assert.equal(soundscape.layers.size, 3);
    soundscape.dispose();
    assert.equal(soundscape.layers.size, 0);
    assert.ok(TestAudio.instances.every((audio) => audio.paused));
});
