import { WORLDGEN_VERSION, savedWorldgenVersion } from "@2dcraft.com/shared/overworldGeneration.js";
import { Dimension } from "./dimension.js";
import { randomMinecraftSeed } from "@2dcraft.com/shared/seed.js";
import { WeatherCycle } from "@2dcraft.com/shared/weather.js";

export class World {
    constructor() {
        this.seed = randomMinecraftSeed();
        this.worldgenVersion = WORLDGEN_VERSION;
        this.time = 1;
        this.weather = new WeatherCycle(this.seed);
        this.dimensions = [
            new Dimension("Overworld"),
            new Dimension("Nether"),
            new Dimension("The End"),
        ];
    }

    getDimension(index) {
        if (index < 0 || index >= this.dimensions.length) {
            return null;
        }
        return this.dimensions[index];
    }

    setSeed(seed) {
        this.seed = String(seed ?? 0);
        this.weather.setSeed(this.seed);
    }

    loadWorld(world) {
        if (world == null) {
            return false;
        }

        this.setSeed(world.seed);
        this.worldgenVersion = world.worldgenVersion == null ? 2 : savedWorldgenVersion(world.worldgenVersion);
        this.time = Number.isFinite(world.time)
            ? Math.max(0, Math.min(8, world.time))
            : 1;
        this.weather.loadState(world.weather, this.seed);
        this.dimensions = [];
        for (let i = 0; i < world.dimensions.length; i++) {
            if (world.dimensions[i].name == null) return false;
            if (world.dimensions[i].chunks == null) return false;

            const chunks = new Map();

            for (let j = 0; j < world.dimensions[i].chunks.length; j++) {
                if (world.dimensions[i].chunks[j].x == null) return false;
                if (world.dimensions[i].chunks[j].chunk == null) return false;

                chunks.set(
                    world.dimensions[i].chunks[j].x,
                    world.dimensions[i].chunks[j].chunk
                );
            }

            this.dimensions.push(
                new Dimension(world.dimensions[i].name, chunks)
            );
        }

        // Older multiplayer saves may contain only Overworld and Nether.
        while (this.dimensions.length < 3) {
            this.dimensions.push(new Dimension("The End"));
        }
        if (this.dimensions[2]?.name === "Eather") {
            this.dimensions[2].name = "The End";
        }

        return true;
    }

    saveWorld() {
        let world = {
            seed: this.seed,
            worldgenVersion: this.worldgenVersion,
            time: this.time,
            weather: this.weather.getState(),
            dimensions: [],
        };
        for (let i = 0; i < this.dimensions.length; i++) {
            const chunks = this.dimensions[i].getChunksForSaving();

            world.dimensions.push({
                name: this.dimensions[i].name,
                chunks: chunks,
            });
        }
        return world;
    }
}
