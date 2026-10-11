import test from "node:test";
import assert from "node:assert/strict";
import { terrainHeightAt } from "../../Shared/terrainHeight.js";
import { Noise, NoisePresets } from "../../Shared/noise.js";
import tooloud from "../../Shared/tooloud.js";
import { CHUNK_HEIGHT, CHUNK_WIDTH } from "../../Shared/constants.js";
import { terrainColumnFaces } from "../Assets/rendering/heightfield.js";

const noiseMaps = {
    continentalness: new Noise(6, 18, 0),
    erosion: new Noise(12, 12, 0),
    peaks: new Noise(22, 20, 0),
    heightDetail: new Noise(55, 6, 0),
    cave: new Noise(55, 10, 5),
};
const plains = { heightNoise: NoisePresets.Flat };
const mountain = { heightNoise: NoisePresets.Mountains };
const biomeAt = index => index < -2 || index >= 2 ? mountain : plains;

test("terrain forecasts match chunks sampled later in either travel direction", () => {
    for (const seed of [0, 1847, 9001, "forest"]) {
        tooloud.Perlin.setSeed(seed);
        const forecast = new Map();
        for (let x = -160; x <= 160; x++) forecast.set(x, terrainHeightAt(x, biomeAt, noiseMaps));
        for (const direction of [-1, 1]) {
            for (let index = -10; index < 10; index++) {
                const chunkIndex = direction * index;
                for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
                    const x = chunkIndex * CHUNK_WIDTH + localX;
                    if (!forecast.has(x)) continue;
                    const height = terrainHeightAt(x, biomeAt, noiseMaps);
                    assert.equal(height, forecast.get(x), `seed ${seed}, column ${x}`);
                    assert.ok(Number.isInteger(height) && height >= 1 && height <= CHUNK_HEIGHT - 2);
                }
            }
        }
    }
});

test("biome blending joins both sides of positive and negative chunk borders", () => {
    const low = { heightNoise: new Noise(0, 0, 30) };
    const high = { heightNoise: new Noise(0, 0, 60) };
    const quiet = Object.fromEntries(Object.keys(noiseMaps).map(key => [key, new Noise(0, 0, key === "cave" ? 5 : 0)]));
    for (const boundary of [-3 * CHUNK_WIDTH, 0, 3 * CHUNK_WIDTH]) {
        const biomes = index => index < boundary / CHUNK_WIDTH ? low : high;
        const heights = [];
        for (let x = boundary - CHUNK_WIDTH; x <= boundary + CHUNK_WIDTH; x++) {
            heights.push(terrainHeightAt(x, biomes, quiet));
        }
        assert.equal(heights.at(-1) - heights[0], 30);
        for (let i = 1; i < heights.length; i++) {
            assert.ok(heights[i] >= heights[i - 1]);
            assert.ok(heights[i] - heights[i - 1] <= 6, "no vertical cliff at the biome border");
        }
        const left = terrainHeightAt(boundary - 0.000001, biomes, quiet);
        const right = terrainHeightAt(boundary + 0.000001, biomes, quiet);
        assert.ok(Math.abs(left - right) <= 1, "border is continuous before block rounding");
    }
});

test("flat worlds keep the same surface even without noise or biome data", () => {
    for (const x of [-100000, -16, -1, 0, 15, 16, 100000]) {
        assert.equal(terrainHeightAt(x, null, null, true), CHUNK_HEIGHT / 2);
    }
});

test("separate scenery meshes match a continuous surface across chunk seams", () => {
    tooloud.Perlin.setSeed(1847);
    const floor = -CHUNK_HEIGHT;
    const heightAt = (x, depth) => terrainHeightAt(x, biomeAt, noiseMaps) - CHUNK_HEIGHT
        + Math.floor(Math.sin(x * 0.1 + depth * 0.2) * 3);
    const mesh = (start, end) => {
        const faces = [];
        for (let x = start; x < end; x++) {
            for (let depth = 2; depth < 5; depth++) faces.push(...terrainColumnFaces(x, depth, heightAt, floor));
        }
        return faces;
    };
    for (const boundary of [-CHUNK_WIDTH, 0, CHUNK_WIDTH]) {
        const left = mesh(boundary - CHUNK_WIDTH, boundary);
        const right = mesh(boundary, boundary + CHUNK_WIDTH);
        assert.deepEqual([...left, ...right], mesh(boundary - CHUNK_WIDTH, boundary + CHUNK_WIDTH));
        const flatFaces = terrainColumnFaces(boundary - 1, 3, () => -50, floor);
        assert.equal(flatFaces.length, 1, "a mesh edge does not add a false cliff");
    }
});
