import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import {
    WEATHER_DURATION_RANGES,
    WeatherCycle,
} from "@2dcraft.com/shared/weather.js";
import {
    getPrecipitationKind,
    getWeatherConditions,
    isColdWeatherBiome,
} from "../Assets/world/weatherConditions.js";
import { getAmbientLayers } from "../Assets/game/ambientProfiles.js";

test("weather durations stay in the 1.20.1 ranges and repeat for the same seed", () => {
    const first = new WeatherCycle("weather-seed");
    const second = new WeatherCycle("weather-seed");
    assert.deepEqual(first.getState(), second.getState());

    for (const kind of Object.keys(WEATHER_DURATION_RANGES)) {
        const duration = first.sampleDuration(kind);
        const [minimum, maximum] = WEATHER_DURATION_RANGES[kind];
        assert.ok(duration >= minimum && duration <= maximum);
    }
});

test("weather timers, flags, and ramp levels survive save and reload", () => {
    const weather = new WeatherCycle("weather-seed");
    assert.equal(weather.setWeather("thunder", 500), true);
    const restored = new WeatherCycle("different-seed", weather.getState());

    assert.deepEqual(restored.getState(), weather.getState());
    restored.tick({ advanceCycle: false });
    assert.equal(restored.rainTime, 500);
    assert.equal(restored.thunderTime, 500);
    assert.equal(restored.rainLevel, 0.01);
    assert.equal(restored.thunderLevel, 0.01);

    const tick = restored.tick();
    assert.equal(tick.flagsChanged, false);
    assert.equal(restored.rainTime, 499);
    assert.equal(restored.thunderTime, 499);
    assert.equal(restored.rainLevel, 0.02);
    assert.equal(restored.thunderLevel, 0.02);
});

test("old or malformed weather saves start clear with the supplied seed", () => {
    const weather = new WeatherCycle("old-seed");
    assert.equal(weather.loadState(null, "world-seed"), false);
    assert.equal(weather.seed, "world-seed");
    assert.equal(weather.raining, false);
    assert.equal(weather.thundering, false);
    assert.equal(weather.rainLevel, 0);
    assert.equal(weather.thunderLevel, 0);
});

test("starting a fresh world can reset weather even when its seed is unchanged", () => {
    const weather = new WeatherCycle("reused-seed");
    weather.setWeather("thunder", 300);
    weather.tick({ advanceCycle: false });
    weather.reset();

    assert.equal(weather.seed, "reused-seed");
    assert.equal(weather.raining, false);
    assert.equal(weather.thundering, false);
    assert.equal(weather.rainLevel, 0);
    assert.equal(weather.thunderLevel, 0);
    assert.deepEqual(weather.getState(), new WeatherCycle("reused-seed").getState());
});

test("server world save preserves weather state", () => {
    return import("../../Server/Classes/world.js").then(({ World }) => {
        const world = new World();
        world.setSeed("server-seed");
        world.weather.setWeather("rain", 240);
        world.weather.tick({ advanceCycle: false });

        const saved = world.saveWorld();
        const loaded = new World();
        assert.equal(loaded.loadWorld(saved), true);
        assert.deepEqual(loaded.weather.getState(), world.weather.getState());
        assert.equal(loaded.dimensions.length, 3);
    });
});

test("snow is selected from cold biome data and precipitation needs open Overworld sky", () => {
    const player = { dimension: Dimensions.Overworld };
    const world = { weather: { rainLevel: 0.8, thunderLevel: 0.4 } };
    const tundra = { name: "Snowy Taiga", maxTemp: 0.25, topLayer: Blocks.SnowedGrassBlock };
    const plains = { name: "Plains", maxTemp: 0.65, topLayer: Blocks.GrassBlock };

    assert.equal(isColdWeatherBiome(tundra), true);
    assert.equal(isColdWeatherBiome(plains), false);
    const snow = getWeatherConditions(world, player, tundra);
    const rain = getWeatherConditions(world, player, plains);
    assert.equal(snow.snowing, true);
    assert.equal(rain.snowing, false);
    assert.equal(getPrecipitationKind(snow, player.dimension, true), "snow");
    assert.equal(getPrecipitationKind(rain, player.dimension, true), "rain");
    assert.equal(getPrecipitationKind(rain, player.dimension, false), null);
    assert.equal(getPrecipitationKind(rain, Dimensions.Nether, true), null);
});

test("rain and thunder ambience uses open-sky and sheltered variants", () => {
    const rain = getAmbientLayers({
        dimension: "Overworld",
        biome: { name: "Plains" },
        raining: true,
        rainLevel: 0.5,
        rainSound: "rain2",
        openSky: true,
    });
    assert.ok(rain.some(layer => layer.sound === "weather/rain2.ogg"));
    assert.equal(rain.find(layer => layer.id.startsWith("rain:")).volume, 0.07);

    const shelteredStorm = getAmbientLayers({
        dimension: "Overworld",
        biome: { name: "Forest" },
        thundering: true,
        thunderLevel: 0.5,
        openSky: false,
    });
    assert.ok(shelteredStorm.some(layer => layer.sound === "weather/storm-away.ogg"));

    const exposedStorm = getAmbientLayers({
        dimension: "Overworld",
        biome: { name: "Forest" },
        thundering: true,
        thunderLevel: 0.5,
        openSky: true,
        inAir: false,
    });
    assert.ok(exposedStorm.some(layer => layer.sound === "weather/storm-close.ogg"));
});

test("precipitation spawns outdoors, stops under roofs, and clears outside Overworld", async () => {
    const draws = { rain: 0, snow: 0 };
    const canvasContext = {
        canvas: null,
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() { draws.rain++; },
        fillRect() { draws.snow++; },
    };
    const canvas = {
        width: 1920,
        height: 1080,
        getContext: () => canvasContext,
        getBoundingClientRect: () => ({ width: 1920, height: 1080 }),
    };
    canvasContext.canvas = canvas;
    globalThis.document = {
        body: { classList: { toggle() {} } },
        getElementById: id => id === "canvas" ? canvas : null,
        querySelector: () => ({ style: { setProperty() {} } }),
        createElement: () => ({}),
        addEventListener() {},
        removeEventListener() {},
    };
    globalThis.window = {
        location: { href: "http://localhost/game.html" },
        AudioContext: class {},
        addEventListener() {},
    };
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.Image = class {};
    globalThis.Audio = class {};
    globalThis.localStorage = { getItem: () => null };

    const [{ WeatherPrecipitationEmitter }, { runtime }] = await Promise.all([
        import("../Assets/world/weatherPrecipitation.js"),
        import("../Assets/utils/runtime.js"),
    ]);
    runtime.deltaTime = 1 / 60;
    runtime.passedTime = 1;
    runtime.camera = { x: 0, y: 0 };

    let openSky = true;
    const biome = { name: "Plains", maxTemp: 0.65 };
    const player = {
        dimension: Dimensions.Overworld,
        position: { x: 0, y: 0 },
        hitbox: { x: 32, y: 64 },
    };
    const world = {
        seed: "weather-seed",
        player,
        weather: { rainLevel: 0.8, thunderLevel: 0 },
        getChunkForX: () => ({ biome }),
        getBlockAtWorldPosition(x, y) {
            if (Math.abs(y - 64 * 0.18) < 0.01) {
                return { blockType: Blocks.Air, sunLight: openSky };
            }
            return null;
        },
    };
    const emitter = new WeatherPrecipitationEmitter(world);

    emitter.update();
    assert.ok(emitter.particles.length > 0);
    assert.ok(emitter.particles.every(particle => particle.kind === "rain"));
    emitter.draw(runtime.camera);
    assert.ok(draws.rain > 0);
    const outdoorCount = emitter.particles.length;

    openSky = false;
    emitter.update();
    assert.equal(emitter.particles.length, outdoorCount);

    openSky = true;
    biome.name = "Snowy Taiga";
    biome.maxTemp = 0.25;
    biome.topLayer = Blocks.SnowedGrassBlock;
    const snowEmitter = new WeatherPrecipitationEmitter(world);
    snowEmitter.update();
    assert.ok(snowEmitter.particles.length > 0);
    assert.ok(snowEmitter.particles.every(particle => particle.kind === "snow"));
    snowEmitter.draw(runtime.camera);
    assert.ok(draws.snow > 0);

    player.dimension = Dimensions.Nether;
    emitter.update();
    assert.equal(emitter.particles.length, 0);
});
