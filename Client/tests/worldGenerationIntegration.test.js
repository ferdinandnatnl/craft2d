import test from "node:test";
import assert from "node:assert/strict";
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


const { Chunk } = await import("../Assets/world/chunk.js");
const { WorldGenerator } = await import("../Assets/world/generator.js");
const { Blocks } = await import("../../Shared/blocks.js");
const { OverworldBiomes } = await import("../../Shared/biome.js");
const { BLOCK_SIZE, CHUNK_HEIGHT } = await import("../../Shared/constants.js");
const { runtime } = await import("../Assets/utils/runtime.js");
const { World: ServerWorld } = await import("../../Server/Classes/world.js");

function makeWorld(seed, version = 5) {
    const world = { seed, worldgenVersion: version };
    world.generator = new WorldGenerator(world);
    world.generator.alexCaveSpawnBlockX = 0;
    return world;
}

function generate(world, index) {
    const chunk = Object.create(Chunk.prototype);
    const data = Array.from({length:CHUNK_HEIGHT}, () => Array(16).fill(Blocks.Air));
    Object.assign(chunk, {world, x:index*16*BLOCK_SIZE, width:16, height:110,
        dimension:0, biome:world.generator.calculateChunkBiome(index),
        setBlockType(x,y,block,wall=false) { if (!wall && data[y]) data[y][x] = block; },
        getBlockType(x,y) { return data[y]?.[x] ?? Blocks.Air; },
    });
    chunk.generateHeight();
    chunk.generateOres();
    chunk.generateOverworldCaves();
    return data;
}

test("actual generation passes retain seeded blocks independent of chunk order", () => {
    const world = makeWorld(1847);
    const forward = [-2,-1,0,1,2].map(index => generate(world,index));
    const reverse = [2,1,0,-1,-2].map(index => generate(world,index)).reverse();
    assert.deepEqual(forward,reverse);
    assert.ok(forward.flat(2).includes(Blocks.Deepslate));
    const old = makeWorld(1847,2);
    const legacy = generate(old, 0);
    assert.ok(legacy.slice(195).flat().every(block => block !== Blocks.Deepslate));
    assert.ok(legacy.slice(0, 145).flat().includes(Blocks.Deepslate));
});

test("actual cave pass places lush and dripstone materials", () => {
    const world = makeWorld(9001);
    const found = new Set();
    for (let index=-40; index<40; index++) {
        for (const block of generate(world,index).flat()) found.add(block);
    }
    for (const block of [Blocks.MossBlock, Blocks.DripstoneBlock, Blocks.CaveVines,
        Blocks.PointedDripstone, Blocks.HangingDripstone, Blocks.CopperOre]) {
        assert.ok(found.has(block), `generation never placed ${block}`);
    }
});

test("surface biome selection uses landform without recursive height lookup", () => {
    const world=makeWorld(1847);
    const found=new Set();
    for(let i=-512;i<512;i++) found.add(world.generator.calculateChunkBiome(i));
    for(const key of ["FrozenPeaks","JaggedPeaks","SnowySlopes","Grove","Meadow"])
        assert.ok(found.has(OverworldBiomes[key]),key);
});

test("spawn checks reject fresh torch light and daylight, while allowing dark caves", () => {
    const chunk=Object.create(Chunk.prototype);
    const torch={blockType:Blocks.Torch,lightSourceLevel:14};
    let lit=false,roof=true;
    chunk.dimension=0;
    chunk.world={getBlockAtWorldPosition(x,y) {
        if(lit && x===12*BLOCK_SIZE && y===20*BLOCK_SIZE)return torch;
        return {blockType:roof && y===10*BLOCK_SIZE ? Blocks.Stone : Blocks.Air,lightSourceLevel:0};
    }};
    runtime.time=1;
    assert.equal(chunk.hostileSpawnIsDark(0,20*BLOCK_SIZE),true);
    lit=true;
    assert.equal(chunk.hostileSpawnIsDark(0,20*BLOCK_SIZE),false);
    lit=false;roof=false;
    assert.equal(chunk.hostileSpawnIsDark(0,20*BLOCK_SIZE),false);
    runtime.time=4.5;
    assert.equal(chunk.hostileSpawnIsDark(0,20*BLOCK_SIZE),true);
});

test("server saves preserve generation version and old saves keep v2", () => {
    const world=new ServerWorld();
    assert.equal(world.worldgenVersion,5);
    const save=world.saveWorld();
    const loaded=new ServerWorld();
    assert.equal(loaded.loadWorld(save),true);
    assert.equal(loaded.worldgenVersion,5);
    delete save.worldgenVersion;
    assert.equal(loaded.loadWorld(save),true);
    assert.equal(loaded.worldgenVersion,2);
});

test("full 256-row chunk survives compact save, eviction, and reload", async () => {
    const { loadChunk, saveChunk } = await import("../Assets/world/saving.js");
    const { dimensions } = await import("../Assets/world/dimension.js");
    const previousWorld = runtime.world;
    const previousChunks = dimensions[0].chunks;
    dimensions[0].chunks = new Map();
    try {
        const world = makeWorld(1847, 4);
        world.entities = [];
        world.getChunkForX = x => dimensions[0].chunks.get(
            Math.floor(x / (16 * BLOCK_SIZE)) * 16 * BLOCK_SIZE);
        world.getBlockAtWorldPosition = (x, y, wall = false) => {
            const owner = world.getChunkForX(x);
            return owner?.getBlockLocal(Math.floor((x - owner.x) / BLOCK_SIZE),
                Math.floor(y / BLOCK_SIZE), wall);
        };
        runtime.world = world;
        const chunk = new Chunk(world, 0, 16,
            world.generator.calculateChunkBiome(0), null, false, 0);
        dimensions[0].chunks.set(0, chunk);
        chunk.generateOres();
        chunk.generateOverworldCaves();
        const before = saveChunk(chunk);
        assert.equal(before.blocks.height, CHUNK_HEIGHT);
        dimensions[0].chunks.delete(0);
        loadChunk(0, { ...before, biome: { name: chunk.biome.name } }, 0);
        assert.deepEqual(saveChunk(dimensions[0].chunks.get(0)), before);
    } finally {
        dimensions[0].chunks = previousChunks;
        runtime.world = previousWorld;
    }
});
