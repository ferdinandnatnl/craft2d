import { cacheFarChunks } from "./chunkCache.js";
import { WORLDGEN_VERSION, mountainBiomeAt, normalizeClimate, seaLevelForVersion } from "@2dcraft.com/shared/overworldGeneration.js";
import { runtime } from "../utils/runtime.js";
import tooloud from "@2dcraft.com/shared/tooloud.js";
import { InventoryItem } from "../game/inventoryItem.js";
import { LootTable } from "@2dcraft.com/shared/lootTable.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, RENDER_DISTANCE, TERRAIN_HEIGHT, WATER_LEVEL, multiplayer } from "../utils/globals.js";
import { camera } from "../utils/renderer.js";
import { AllBiomes, ClimateOverworldBiomes, LowlandOverworldBiomes, OverworldBiomes } from "@2dcraft.com/shared/biome.js";
import { getBlock, Metadata } from "./block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Chunk } from "./chunk.js";
import { activeDimension, dimensions } from "./dimension.js";
import { loadChunk, saveChunk } from "./saving.js";
import { Structures } from "@2dcraft.com/shared/structures.js";
import { terrainHeightAt } from "@2dcraft.com/shared/terrainHeight.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import { VILLAGE_CENTER, VILLAGE_PIECES, isVillageChunk, villageStructureForBiome } from "@2dcraft.com/shared/village.js";
import { createSeededRandom, perlinSeed, randomInt, randomMinecraftSeed, seedHash } from "@2dcraft.com/shared/seed.js";
import { isRandomSpreadChunk } from "@2dcraft.com/shared/randomSpread.js";
import { Entities } from "../entities/entities.js";
import { Vector2 } from "../utils/classes.js";

function pumpkinPatchColumn(seed, chunkIndex) {
    const value = seedHash(seed, `pumpkin:${chunkIndex}`);
    return value % 29 === 0 ? (value >>> 8) % CHUNK_WIDTH : -1;
}

// Vanilla Java randomized-spread placements projected onto this 2D world.
const STRUCTURE_PLACEMENTS = [
    {
        name: "RuinedPortal",
        dimension: Dimensions.Overworld,
        spacing: 40,
        separation: 15,
        salt: 34222645,
    },
    {
        name: "DesertTemple",
        dimension: Dimensions.Overworld,
        biome: OverworldBiomes.Desert,
        drySurface: true,
        spacing: 32,
        separation: 8,
        salt: 14357617,
    },
    {
        name: "Iglo",
        dimension: Dimensions.Overworld,
        biome: OverworldBiomes.Tundra,
        drySurface: true,
        spacing: 32,
        separation: 8,
        salt: 14357618,
    },
    {
        name: "WitchHut",
        dimension: Dimensions.Overworld,
        biome: OverworldBiomes.Swamp,
        spacing: 32,
        separation: 8,
        salt: 14357620,
    },
    {
        name: "NetherFortress",
        dimension: Dimensions.Nether,
        spacing: 27,
        separation: 4,
        salt: 30084232,
    },
];

export class WorldGenerator {
    constructor(world) {
        this.world = world;
        this.specialWorldProps = {};
        this.multiplayerSeedLoaded = !multiplayer;
        this.worldgenVersion = multiplayer ? 2 : (world.worldgenVersion ?? WORLDGEN_VERSION);
        this.world.worldgenVersion = this.worldgenVersion;
        this.forceToBiome = null;
        this.loadingWorld = true;
        this.villageSites = new Map();

        this.setNoiseSeed();
    }

    setNoiseSeed() {
        this.villageSites?.clear();
        const seed = this.worldgenVersion < 2
            ? this.world.seed
            : perlinSeed(this.world.seed);
        tooloud.Perlin.setSeed(seed);
    }

    printNoiseOutput(noise, count = 100) {
        let minValue = Infinity;
        let maxValue = -Infinity;

        for (let i = 0; i < count; i++) {
            const noiseValue = noise.getNoise(i, 0);
            console.log(`Mapped noise value: ${i} - ${noiseValue}`);

            if (noiseValue < minValue) minValue = noiseValue;
            if (noiseValue > maxValue) maxValue = noiseValue;
        }

        console.log("Minimum Noise Value:", minValue);
        console.log("Maximum Noise Value:", maxValue);
    }

    locateBiome(biome) {
        // Start search from player/camera center so we find the closest matching biome.
        const center =
            typeof camera !== "undefined" &&
            camera &&
            camera.getCurrentChunkIndex
                ? camera.getCurrentChunkIndex()
                : runtime.world && runtime.world.player
                  ? Math.floor(runtime.world.player.x / (CHUNK_WIDTH * BLOCK_SIZE))
                  : 0;

        const maxRadius = 10000;
        for (let r = 0; r < maxRadius; r++) {
            const indices = r === 0 ? [center] : [center + r, center - r];
            for (const idx of indices) {
                const currentBiome = this.calculateChunkBiome(idx);
                if (currentBiome === biome) return idx;
            }
        }

        return false;
    }

    villageSiteAt(anchorChunkIndex) {
        const structureName = villageStructureForBiome(this.calculateChunkBiome(
            anchorChunkIndex, Dimensions.Overworld,
        ));
        if (!structureName) return null;

        const floors = [];
        const levels = [];
        const waterlines = [];
        for (let index = 0; index < VILLAGE_PIECES.length; index++) {
            const chunkIndex = anchorChunkIndex + index - VILLAGE_CENTER;
            const biome = this.calculateChunkBiome(chunkIndex, Dimensions.Overworld);

            const columnLevels = Array.from({ length: CHUNK_WIDTH }, (_, x) =>
                this.getTerrainHeight(chunkIndex * CHUNK_WIDTH + x, Dimensions.Overworld) + 1);
            const surface = Math.max(...columnLevels);
            const waterline = seaLevelForVersion(this.worldgenVersion) +
                biome.waterLevel - WATER_LEVEL + 1;
            const floor = Math.max(surface, waterline + 2);
            // Villages need one walkable terrace. Reject cliffs and deep stilts
            // rather than spanning them with disconnected raised platforms.
            if (VILLAGE_PIECES[index] !== "Square" &&
                (floor - Math.min(...columnLevels) > 7 ||
                    surface - Math.min(...columnLevels) > 7)) return null;
            floors.push(floor);
            levels.push(columnLevels);
            waterlines.push(waterline);
        }

        const allLevels = levels.flat();
        const villageFloor = Math.round(
            (Math.min(...allLevels) + Math.max(...allLevels)) / 2,
        );
        if (allLevels.some(level => Math.abs(villageFloor - level) > 4))
            return null;
        if (waterlines.some(waterline => villageFloor <= waterline + 1))
            return null;
        floors.fill(villageFloor);

        return { anchorChunkIndex, structureName, floors };
    }

    villageSiteForRegion(region) {
        if (this.villageSites.has(region)) return this.villageSites.get(region);
        const spacing = this.worldgenVersion >= 4 ? 96 : 24;
        const start = region * spacing;
        const end = start + spacing - 1;
        let candidateChunkIndex = null;
        for (let index = start; index <= end; index++) {
            if (isVillageChunk(this.world.seed, index, this.worldgenVersion)) {
                candidateChunkIndex = index;
                break;
            }
        }
        if (candidateChunkIndex === null) return null;

        const firstCenter = start + VILLAGE_CENTER;
        const lastCenter = end - VILLAGE_CENTER;
        for (let radius = 0; radius < spacing; radius++) {
            const centers = radius === 0
                ? [candidateChunkIndex]
                : [candidateChunkIndex + radius, candidateChunkIndex - radius];
            for (const center of centers) {
                if (center < firstCenter || center > lastCenter) continue;
                const site = this.villageSiteAt(center);
                if (site) {
                    this.villageSites.set(region, site);
                    return site;
                }
            }
        }
        this.villageSites.set(region, null);
        return null;
    }

    villageSiteForCandidate(candidateChunkIndex) {
        if (!isVillageChunk(this.world.seed, candidateChunkIndex, this.worldgenVersion))
            return null;
        const spacing = this.worldgenVersion >= 4 ? 96 : 24;
        return this.villageSiteForRegion(Math.floor(candidateChunkIndex / spacing));
    }

    villagePathHeight(site, index) {
        return site.floors[index];
    }

    villageSiteForChunk(chunkIndex) {
        const spacing = this.worldgenVersion >= 4 ? 96 : 24;
        const firstRegion = Math.floor((chunkIndex - VILLAGE_CENTER) / spacing);
        const lastRegion = Math.floor((chunkIndex + VILLAGE_CENTER) / spacing);
        for (let region = firstRegion; region <= lastRegion; region++) {
            const site = this.villageSiteForRegion(region);
            if (!site) continue;
            const index = chunkIndex - site.anchorChunkIndex + VILLAGE_CENTER;
            if (index >= 0 && index < VILLAGE_PIECES.length) {
                return { ...site, index, piece: VILLAGE_PIECES[index] };
            }
        }
        return null;
    }

    locateVillage() {
        if (this.specialWorldProps.noStructures || this.specialWorldProps.void)
            return null;

        const playerX = runtime.world?.player?.position.x ?? 0;
        const center = Math.floor(playerX / (CHUNK_WIDTH * BLOCK_SIZE));
        const spacing = this.worldgenVersion >= 4 ? 96 : 24;
        let nearestSite = null;
        let nearestDistance = Infinity;
        for (let radius = 0; radius < 10000; radius++) {
            if (nearestSite && radius > nearestDistance + spacing) break;
            const candidates = radius === 0
                ? [center]
                : [center + radius, center - radius];

            for (const chunkIndex of candidates) {
                const site = this.villageSiteForCandidate(chunkIndex);
                if (!site) continue;
                const distance = Math.abs(site.anchorChunkIndex - center);
                if (distance < nearestDistance) {
                    nearestSite = site;
                    nearestDistance = distance;
                }
            }
        }

        return nearestSite ? {
            chunkIndex: nearestSite.anchorChunkIndex,
            x: nearestSite.anchorChunkIndex * CHUNK_WIDTH + 8,
            y: this.villagePathHeight(nearestSite, VILLAGE_CENTER, 8) + 1,
        } : null;
    }

    loadCustomSeed(seedInput) {
        this.specialWorldProps = {};
        this.forceToBiome = null;

        seedInput = String(seedInput ?? "").trim();
        const seedPreset = seedInput.toLowerCase();

        this.world.seed = seedInput;
        this.world.weather?.setSeed(seedInput);
        this.world.weather?.reset();
        this.world.weatherPrecipitationEmitter?.setSeed(seedInput);
        this.world.weatherPrecipitationEmitter?.clear();
        this.setNoiseSeed();

        switch (seedPreset) {
            case "flat":
                this.specialWorldProps.flat = true;
                break;

            case "void":
                this.specialWorldProps.void = true;
                break;

            case "skyblock":
                this.specialWorldProps.void = true;
                this.specialWorldProps.skyblock = true;
                break;

            case "redstone":
                this.specialWorldProps.flat = true;
                this.specialWorldProps.noMobs = true;
                this.specialWorldProps.redstone = true;
                this.specialWorldProps.noStructures = true;
                break;

            // Preserve the old keyword-biome saves. In new worlds these are
            // ordinary text seeds that follow Minecraft Java seed conversion.
            default:
                if (this.worldgenVersion < 2) {
                    const legacyBiomes = {
                        desert: OverworldBiomes.Desert,
                        mountain: OverworldBiomes.Mountain,
                        forest: OverworldBiomes.Forest,
                        plains: OverworldBiomes.Plains,
                        swamp: OverworldBiomes.Swamp,
                        jungle: OverworldBiomes.RainForest,
                        rainforest: OverworldBiomes.RainForest,
                        savanna: OverworldBiomes.Savanna,
                        taiga: OverworldBiomes.Taiga,
                        tundra: OverworldBiomes.Tundra,
                        seasonalforest: OverworldBiomes.SeasonalForest,
                        seasonal: OverworldBiomes.SeasonalForest,
                        "seasonal forest": OverworldBiomes.SeasonalForest,
                        cherry: OverworldBiomes.CherryBlossom,
                        "cherry blossom": OverworldBiomes.CherryBlossom,
                    };
                    this.forceToBiome = legacyBiomes[seedPreset] ?? null;
                }
        }
    }

    biomesInChunkCount(count) {
        let biomeCount = {};
        const displayNames = {};

        for (let i = 0; i < count; i++) {
            const biome = this.calculateChunkBiome(i);

            // Find canonical key in AllBiomes (e.g. SeasonalForest) that maps to this biome object.
            const key =
                Object.keys(AllBiomes).find((k) => AllBiomes[k] === biome) ||
                // fallback: remove spaces from display name to match key format
                biome.name.replace(/\s+/g, "");

            displayNames[key] = biome.name;
            biomeCount[key] = (biomeCount[key] || 0) + 1;
        }

        // Print found biomes using their display names
        for (const key of Object.keys(biomeCount)) {
            const name = displayNames[key] || key;
            console.log(
                `${name}: ${((biomeCount[key] / count) * 100).toFixed(2)}%`,
            );
        }

        // All biomes not in the count — print using the Biome.display name
        for (const key in AllBiomes) {
            if (!biomeCount[key]) {
                console.log(`${AllBiomes[key].name}: 0%`);
            }
        }
    }

    logClimateSamples(count = 200, dimensionIndex = activeDimension) {
        const dimension = dimensions[dimensionIndex];
        const { temperature, wetness, mountains } = dimension.noiseMaps;

        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const toUnit = (value, noise) => {
            const min = noise.min - noise.intensity * 0.5;
            const max = noise.min + noise.intensity * 0.5;
            if (max === min) return 0.5;
            return clamp((value - min) / (max - min), 0, 1);
        };

        const stats = {
            temp: { min: Infinity, max: -Infinity, sum: 0 },
            wet: { min: Infinity, max: -Infinity, sum: 0 },
            mount: { min: Infinity, max: -Infinity, sum: 0 },
            tempUnit: { min: Infinity, max: -Infinity, sum: 0 },
            wetUnit: { min: Infinity, max: -Infinity, sum: 0 },
            mountUnit: { min: Infinity, max: -Infinity, sum: 0 },
        };

        for (let i = 0; i < count; i++) {
            const temp = temperature.getNoise(i, 20000);
            const wet = wetness.getNoise(i, 10000);
            const mount = mountains.getNoise(i, 30000);
            const tempUnit = toUnit(temp, temperature);
            const wetUnit = toUnit(wet, wetness);
            const mountUnit = toUnit(mount, mountains);

            stats.temp.min = Math.min(stats.temp.min, temp);
            stats.temp.max = Math.max(stats.temp.max, temp);
            stats.temp.sum += temp;

            stats.wet.min = Math.min(stats.wet.min, wet);
            stats.wet.max = Math.max(stats.wet.max, wet);
            stats.wet.sum += wet;

            stats.mount.min = Math.min(stats.mount.min, mount);
            stats.mount.max = Math.max(stats.mount.max, mount);
            stats.mount.sum += mount;

            stats.tempUnit.min = Math.min(stats.tempUnit.min, tempUnit);
            stats.tempUnit.max = Math.max(stats.tempUnit.max, tempUnit);
            stats.tempUnit.sum += tempUnit;

            stats.wetUnit.min = Math.min(stats.wetUnit.min, wetUnit);
            stats.wetUnit.max = Math.max(stats.wetUnit.max, wetUnit);
            stats.wetUnit.sum += wetUnit;

            stats.mountUnit.min = Math.min(stats.mountUnit.min, mountUnit);
            stats.mountUnit.max = Math.max(stats.mountUnit.max, mountUnit);
            stats.mountUnit.sum += mountUnit;
        }

        const avg = (value) => value / count;

        console.log("Climate sample stats:");
        console.log(
            `Temp raw min/max/avg: ${stats.temp.min.toFixed(2)} / ${stats.temp.max.toFixed(2)} / ${avg(stats.temp.sum).toFixed(2)}`,
        );
        console.log(
            `Wet raw min/max/avg: ${stats.wet.min.toFixed(2)} / ${stats.wet.max.toFixed(2)} / ${avg(stats.wet.sum).toFixed(2)}`,
        );
        console.log(
            `Mount raw min/max/avg: ${stats.mount.min.toFixed(2)} / ${stats.mount.max.toFixed(2)} / ${avg(stats.mount.sum).toFixed(2)}`,
        );
        console.log(
            `Temp unit min/max/avg: ${stats.tempUnit.min.toFixed(2)} / ${stats.tempUnit.max.toFixed(2)} / ${avg(stats.tempUnit.sum).toFixed(2)}`,
        );
        console.log(
            `Wet unit min/max/avg: ${stats.wetUnit.min.toFixed(2)} / ${stats.wetUnit.max.toFixed(2)} / ${avg(stats.wetUnit.sum).toFixed(2)}`,
        );
        console.log(
            `Mount unit min/max/avg: ${stats.mountUnit.min.toFixed(2)} / ${stats.mountUnit.max.toFixed(2)} / ${avg(stats.mountUnit.sum).toFixed(2)}`,
        );
    }

    regenerateWorld() {
        const newSeed = randomMinecraftSeed();
        this.world.seed = newSeed;
        this.setNoiseSeed();

        this.world.entities = [];
        this.world.entities.push(this.world.player);

        setTimeout(() => {
            this.world.player.setOnGround();
        }, 1);
    }

    async getChunkFromServer(x, dimensionIndex = activeDimension) {
        try {
            const chunkData = await runtime.server.get({
                type: "getChunk",
                message: { x: x, dimensionIndex: dimensionIndex },
            });

            return chunkData.chunk;
        } catch (error) {
            return null;
        }
    }

    async generateWorld(dimensionIndex = activeDimension) {
        if (this.loadingWorld) return;

        const dimension = dimensions[dimensionIndex];
        const currentChunkIndex = camera.getCurrentChunkIndex();

        for (
            let i = currentChunkIndex - RENDER_DISTANCE;
            i <= currentChunkIndex + RENDER_DISTANCE;
            i++
        ) {
            const chunkX = i * CHUNK_WIDTH * BLOCK_SIZE;

            let willUploadChunk = false;

            if (multiplayer) {
                if (!dimension.chunks.has(chunkX)) {
                    const chunkFromServer = await this.world.getChunkFromServer(
                        chunkX,
                        dimensionIndex,
                    );
                    if (chunkFromServer) {
                        loadChunk(chunkX, chunkFromServer, dimensionIndex);
                    } else {
                        willUploadChunk = true;
                        const oldChunkData = this.getNeighborBiomeData(
                            i,
                            currentChunkIndex,
                            dimensionIndex,
                        );
                        this.generateChunk(
                            i,
                            chunkX,
                            oldChunkData,
                            dimensionIndex,
                        );
                    }
                }
            } else if (!dimension.chunks.has(chunkX) && dimension.storedChunks.has(chunkX)) {
                const saved = dimension.storedChunks.get(chunkX);
                loadChunk(chunkX, saved, dimensionIndex);
                dimension.storedChunks.delete(chunkX);
            } else if (!dimension.chunks.has(chunkX)) {
                const oldChunkData = this.getNeighborBiomeData(
                    i,
                    currentChunkIndex,
                    dimensionIndex,
                );
                this.generateChunk(i, chunkX, oldChunkData, dimensionIndex);
            } else {
                const chunk = dimension.chunks.get(chunkX);
                if (chunk.spawnTime && chunk.spawnTime <= runtime.passedTime) {
                    chunk.spawnTime = 0;
                    chunk.spawnMobs(runtime.day);
                }
            }

            const chunk = this.world.getChunkForX(chunkX, dimensionIndex);
            // Structure generation only needs to inspect the world while a
            // nearby chunk is still unprocessed. generateWorld runs every
            // animation frame, so scanning every loaded chunk here stalls
            // larger saved worlds once generation has finished.
            if (!this.specialWorldProps.noStructures &&
                chunk && !chunk.generated) {
                this.generateStructures(dimensionIndex);
            }

            this.postProcessChunk(chunk);

            if (willUploadChunk) {
                this.world.uploadChunkToServer(chunkX, dimensionIndex);
            }
        }
        if (!multiplayer) cacheFarChunks(dimension, currentChunkIndex, saveChunk);
    }

    generateStructure(
        structure,
        x,
        y,
        dimensionIndex = activeDimension,
        random = Math.random,
    ) {
        const structureData = Structures[structure];
        if (!structureData) return;

        const originBlockX = Math.floor(x / BLOCK_SIZE) + structureData.shift.x;
        const originBlockY = Math.floor(y / BLOCK_SIZE) + structureData.shift.y;

        let structureWidth = structureData.blocks[0].length;
        let structureHeight = structureData.blocks.length;

        if (structureData.walls) {
            if (structureData.walls[0].length > structureWidth) {
                structureWidth = structureData.walls[0].length;
            }
            if (structureData.walls.length > structureHeight) {
                structureHeight = structureData.walls.length;
            }
        }

        const flip = random() < 0.5;

        let chunk = null;

        for (let i = 0; i < structureWidth; i++) {
            const colIndex = flip ? structureWidth - 1 - i : i;
            for (let j = 0; j < structureHeight; j++) {
                const rowIndex = structureHeight - 1 - j;
                const blockRow = structureData.blocks[rowIndex] || [];
                const wallRow = structureData.walls?.[rowIndex] || [];

                const blockType = blockRow[colIndex] ?? Blocks.Air;
                const wallType = wallRow[colIndex] ?? Blocks.Air;

                const blockX = (originBlockX + i) * BLOCK_SIZE;
                const blockUserY = originBlockY + j;
                const blockY = this.world.userBlockYToWorld(blockUserY);

                if (!chunk) chunk = this.world.getChunkForX(blockX, dimensionIndex);

                if (blockType instanceof LootTable) {
                    this.generateChestWithLoot(
                        blockType,
                        blockX,
                        blockY,
                        chunk,
                        random,
                    );
                } else if (blockType !== Blocks.Air) {
                    chunk.setBlockTypeAtPosition(blockX, blockY, blockType);
                }

                if (wallType instanceof LootTable) {
                    this.generateChestWithLoot(wallType, blockX, blockY, chunk, random);
                } else if (wallType !== Blocks.Air) {
                    chunk.setBlockTypeAtPosition(
                        blockX,
                        blockY,
                        wallType,
                        null,
                        true,
                    );
                }
            }
        }
    }

    generateChestWithLoot(lootTable, x, y, chunk, random = Math.random) {
        const loot = lootTable.getRandomLoot(random);

        let storage = [[]];

        for (let y = 0; y < 3; y++) {
            storage[y] = [];
            for (let x = 0; x < 9; x++) {
                storage[y][x] = new InventoryItem();
            }
        }

        const newStorage = this.populateStorageWithLoot(loot, storage, random);

        chunk.setBlockTypeAtPosition(
            x,
            y,
            Blocks.Chest,
            new Metadata({ storage: newStorage }),
        );
    }

    populateStorageWithLoot(loot, storage, random = Math.random) {
        for (const item of loot) {
            let placed = false;
            let attempts = 10;
            while (!placed && attempts > 0) {
                const randomSlotX = randomInt(random, 0, storage[0].length);
                const randomSlotY = randomInt(random, 0, storage.length);
                if (storage[randomSlotY][randomSlotX].count === 0) {
                    storage[randomSlotY][randomSlotX] = item;
                    placed = true;
                }
                attempts--;
            }
            if (!placed) {
                for (let y = 0; y < storage.length && !placed; y++) {
                    for (let x = 0; x < storage[y].length && !placed; x++) {
                        if (storage[y][x].count === 0) {
                            storage[y][x] = item;
                            placed = true;
                        }
                    }
                }
            }
        }
        return storage;
    }

    getTerrainHeight(worldX, dimensionIndex = activeDimension) {
        return terrainHeightAt(worldX,
            (index) => this.calculateChunkBiome(index, dimensionIndex),
            dimensions[dimensionIndex].noiseMaps,
            this.specialWorldProps.flat,
            this.worldgenVersion,
        );
    }

    findSpawnBlockX() {
        if (this.specialWorldProps.flat || this.specialWorldProps.void) return 0;

        const maxRadius = CHUNK_WIDTH * (this.worldgenVersion >= 4 ? 64 : 16);
        let steepFallback = null;

        for (let radius = 0; radius <= maxRadius; radius++) {
            const candidates = radius === 0 ? [0] : [radius, -radius];
            for (const worldX of candidates) {
                const height = this.getTerrainHeight(worldX, Dimensions.Overworld);
                const biome = this.calculateChunkBiome(
                    Math.floor(worldX / CHUNK_WIDTH),
                    Dimensions.Overworld,
                );
                const waterline = seaLevelForVersion(this.worldgenVersion) + (biome?.waterLevel ?? WATER_LEVEL) - WATER_LEVEL;
                if (height <= waterline + 2) continue;

                if (steepFallback === null) steepFallback = worldX;
                const slope = Math.max(
                    Math.abs(height - this.getTerrainHeight(worldX - 2, Dimensions.Overworld)),
                    Math.abs(height - this.getTerrainHeight(worldX + 2, Dimensions.Overworld)),
                );
                if (slope <= 4) return worldX;
            }
        }

        return steepFallback ?? 0;
    }

    calculateChunkBiome(chunkIndex, dimensionIndex = activeDimension) {
        const dimension = dimensions[dimensionIndex];
        const { temperature, wetness, mountains } = dimension.noiseMaps;
        const climateIndex = this.worldgenVersion >= 4 && dimensionIndex === Dimensions.Overworld
            ? chunkIndex / 4 : chunkIndex;
        const temp = temperature.getNoise(climateIndex, 20000);
        const wet = wetness.getNoise(climateIndex, 10000);
        const mount = mountains.getNoise(climateIndex, 30000);

        let biome = this.getBiomeForNoise(
            temp,
            wet,
            mount,
            dimensionIndex === Dimensions.Overworld
                ? (this.worldgenVersion >= 3 ? LowlandOverworldBiomes : ClimateOverworldBiomes)
                : dimension.biomeSet,
            dimension.noiseMaps,
        );

        if (dimensionIndex === Dimensions.Overworld && this.worldgenVersion >= 3 &&
            !this.specialWorldProps.flat) {
            const worldX = chunkIndex * CHUNK_WIDTH + CHUNK_WIDTH / 2;
            const peaks = dimension.noiseMaps.peaks;
            const key = mountainBiomeAt({
                seaLevel: seaLevelForVersion(this.worldgenVersion),
                height: terrainHeightAt(worldX, null, dimension.noiseMaps, false, this.worldgenVersion),
                temperature: normalizeClimate(temp, temperature),
                wetness: normalizeClimate(wet, wetness),
                peaks: normalizeClimate(peaks.getNoise(this.worldgenVersion >= 4 ? worldX / 4 : worldX, 20000), peaks),
            });
            if (key) biome = OverworldBiomes[key];
        }

        if (this.specialWorldProps.flat)
            biome = dimension.biomeSet.Plains || biome;
        if (this.forceToBiome != null && dimensionIndex === Dimensions.Overworld)
            biome = this.forceToBiome;
        if (!biome) {
            biome =
                dimension.biomeSet.Plains ||
                Object.values(dimension.biomeSet)[0];
        }

        return biome;
    }

    getNeighborBiomeData(
        currentIndex,
        cameraIndex,
        dimensionIndex = activeDimension,
    ) {
        const neighborIndex =
            currentIndex < cameraIndex ? currentIndex + 1 : currentIndex - 1;
        const neighborChunkX = neighborIndex * CHUNK_WIDTH * BLOCK_SIZE;
        const neighborBiome = this.calculateChunkBiome(
            neighborIndex,
            dimensionIndex,
        );

        return { x: neighborChunkX, biome: neighborBiome };
    }

    generateChunk(
        chunkIndex,
        chunkX,
        oldChunkData,
        dimensionIndex = activeDimension,
    ) {
        const dimension = dimensions[dimensionIndex];
        const biome = this.calculateChunkBiome(chunkIndex, dimensionIndex);

        const newChunk = new Chunk(
            runtime.world,
            chunkX,
            CHUNK_WIDTH,
            biome,
            oldChunkData,
            false,
            dimensionIndex,
        );
        dimension.chunks.set(chunkX, newChunk);
    }

    getChunk(worldX, dimension = activeDimension) {
        return this.world.getDimensionChunks(dimension).has(worldX)
            ? this.world.getDimensionChunks(dimension).get(worldX)
            : null;
    }

    postProcessChunk(chunk) {
        if (!chunk) return;

        if (chunk.dimension === Dimensions.End) {
            if (!chunk.generated) chunk.generateEndOutpost();
            if (!chunk.generated && !this.specialWorldProps.noMobs &&
                Math.abs(chunk.x / (CHUNK_WIDTH * BLOCK_SIZE)) <= 2) {
                chunk.spawnMobs(false);
            }
            chunk.generated = true;
            return;
        }

        if (this.specialWorldProps.void) {
            chunk.applyBufferedBlocks();
            return;
        }

        if (chunk.generated) {
            if (
                chunk.dimension === Dimensions.Overworld &&
                !chunk.aquaticSpawningInitialized &&
                !this.specialWorldProps.noMobs
            ) {
                chunk.spawnAquaticMobs();
            }
            if (chunk.dimension === Dimensions.Overworld &&
                runtime.passedTime >= chunk.caveSpawnTime) chunk.spawnCaveMobs();
            return;
        }

        if (!chunk.generated) {
            chunk.generateOres();

            if (!this.specialWorldProps.flat) {
                chunk.generateCaves();
            }

            chunk.applyBufferedBlocks();
            chunk.generateWater();

            if (!this.specialWorldProps.flat && !this.specialWorldProps.noStructures) {
                chunk.generateCaveStructures();
            }

            const pumpkinColumn = pumpkinPatchColumn(
                this.world.seed,
                chunk.x / (CHUNK_WIDTH * BLOCK_SIZE),
            );
            if (
                chunk.dimension === Dimensions.Overworld &&
                !this.specialWorldProps.flat &&
                !this.specialWorldProps.noStructures &&
                !chunk.hasVillage &&
                pumpkinColumn >= 0 &&
                [
                    OverworldBiomes.Plains,
                    OverworldBiomes.Forest,
                    OverworldBiomes.Taiga,
                    OverworldBiomes.Savanna,
                ].includes(chunk.biome)
            ) {
                const groundY = chunk.findGroundLevel(
                    pumpkinColumn,
                    false,
                    true,
                );
                if (getBlock(chunk.getBlockType(pumpkinColumn, groundY))?.air) {
                    chunk.setBlockType(pumpkinColumn, groundY, Blocks.Pumpkin);
                }
            }

            if (!this.specialWorldProps.noMobs) chunk.spawnMobs(runtime.day);

            if (!this.specialWorldProps.flat && !chunk.hasVillage) {
                chunk.generateTrees();
                chunk.generateGrass();
            }

            chunk.generateBedrock();

            chunk.generateEndShrine();

            chunk.generated = true;
            if (chunk.dimension === Dimensions.Overworld) chunk.spawnCaveMobs();
        }
    }

    generateStructures(dimensionIndex = activeDimension) {
        const dimension = dimensions[dimensionIndex];
        dimension.chunks.forEach((chunk, chunkX) => {
            if (chunk.generated || chunk.hasVillage) {
                return;
            }

            const chunkIndex = chunkX / (CHUNK_WIDTH * BLOCK_SIZE);
            const villageSite = dimensionIndex === Dimensions.Overworld
                ? this.villageSiteForChunk(chunkIndex) : null;
            if (dimensionIndex === Dimensions.Overworld &&
                villageSite &&
                this.generateVillage(
                    chunk,
                    dimensionIndex,
                    villageSite,
                    createSeededRandom(this.world.seed,
                        `structure:village:${villageSite.anchorChunkIndex}:${chunkIndex}`),
                )) {
                return;
            }

            for (const placement of STRUCTURE_PLACEMENTS) {
                if (placement.dimension !== dimensionIndex ||
                    !isRandomSpreadChunk(this.world.seed, chunkIndex,
                        this.worldgenVersion >= 4
                            ? { ...placement, spacing: placement.spacing * 4,
                                separation: placement.separation * 4 } : placement)) continue;
                if (placement.biome && chunk.biome !== placement.biome) continue;

                const structure = Structures[placement.name];
                const random = createSeededRandom(
                    this.world.seed,
                    `structure:${dimensionIndex}:${chunkIndex}:${placement.name}`,
                );
                const structureX = chunk.x +
                    randomInt(random, 0, CHUNK_WIDTH) * BLOCK_SIZE;
                const localX = chunk.getLocalX(structureX);
                const surfaceAirY = chunk.findGroundLevel(localX, false, true);
                if (
                    placement.drySurface &&
                    surfaceAirY <= seaLevelForVersion(this.worldgenVersion) + chunk.biome.waterLevel - WATER_LEVEL + 1
                ) continue;
                const surfaceGroundY = surfaceAirY - 1;
                let structureY;

                if (structure.underground) {
                    const structureHeight = structure.blocks.length;
                    const shiftY = structure.shift?.y ?? 1;
                    const undergroundOffset = randomInt(
                        random,
                        8,
                        Math.ceil(CHUNK_HEIGHT / 2.5),
                    );
                    const maxOriginY =
                        surfaceGroundY - 2 - (structureHeight - 1);
                    let originBlockY =
                        surfaceGroundY - undergroundOffset + shiftY;
                    originBlockY = Math.min(originBlockY, maxOriginY);
                    const baseBlockY = Math.max(1, originBlockY - shiftY);
                    structureY = baseBlockY * BLOCK_SIZE;
                } else {
                    structureY = surfaceAirY * BLOCK_SIZE;
                }

                this.generateStructure(
                    placement.name,
                    structureX,
                    structureY,
                    dimensionIndex,
                    random,
                );
                return;
            }
        });
    }

    generateVillage(
        chunk,
        dimensionIndex,
        site,
        random = Math.random,
    ) {
        const { structureName, index, piece } = site;
        const villageStructure = Structures[structureName];
        if (!villageStructure) return false;
        const levels = Array.from({ length: CHUNK_WIDTH }, (_, x) =>
            chunk.findGroundLevel(x, false, true));
        const villageGround = villageStructure.villageGround;
        if (piece === "Square") {
            levels.forEach((level, x) => {
                const pathY = this.villagePathHeight(site, index, x);
                for (let y = level; y < pathY; y++) {
                    chunk.setBlockType(x, y, villageGround);
                }
                for (let y = pathY; y < level; y++) {
                    chunk.setBlockType(x, y, Blocks.StructureAir);
                }
                chunk.setBlockType(x, pathY, villageStructure.villagePath);
            });
            if (piece === "Square") {
                for (const [start, canopy] of [
                    [2, villageStructure.villageCanopy], [10, Blocks.WhiteWool],
                ]) {
                    const marketY = Math.max(...Array.from({ length: 4 }, (_, i) =>
                        this.villagePathHeight(site, index, start + i)));
                    for (const x of [start, start + 3]) {
                        for (let y = this.villagePathHeight(site, index, x) + 1;
                            y <= marketY + 2; y++) {
                            chunk.setBlockType(x, y, villageStructure.villageTimber, true);
                        }
                    }
                    for (let x = start; x <= start + 3; x++) {
                        chunk.setBlockType(x, marketY + 3, canopy, true);
                    }
                    for (let x = start + 1; x <= start + 2; x++) {
                        chunk.setBlockType(x, marketY + 1, Blocks.OakPlanks, true);
                    }
                }
                for (const x of [0, 15]) {
                    chunk.setBlockType(x, this.villagePathHeight(site, index, x) + 1,
                        Blocks.Torch);
                }
            }
        } else {
            const floorY = site.floors[index];
            const building = Structures[`${structureName}${piece}`];
            levels.forEach((level, x) => {
                for (let y = level; y < floorY; y++) {
                    chunk.setBlockType(x, y, villageGround);
                }
                for (let y = floorY; y < level; y++) {
                    chunk.setBlockType(x, y, Blocks.StructureAir);
                }
            });
            this.generateStructure(`${structureName}${piece}`, chunk.x,
                floorY * BLOCK_SIZE, dimensionIndex, random);
            for (const x of building.villageEntrances) {
                for (const y of [floorY + 1, floorY + 2]) {
                    const door = chunk.getBlock(x, y);
                    const expected = building.blocks[10 - (y - floorY)][x];
                    if (door?.blockType === expected) {
                        door.setBlockMetaData({ open: true });
                    }
                }
            }
        }
        chunk.hasVillage = true;

        if (!this.specialWorldProps.noMobs && runtime.GAMERULES.doMobSpawning) {
            const villagers = piece === "Square" ? [6, 9] : [8];
            for (const x of villagers) {
                const floorY = this.villagePathHeight(site, index, x);
                const villager = this.world.summonEntity(
                    Entities.Villager,
                    new Vector2(chunk.x + (x + 0.2) * BLOCK_SIZE, 0),
                    { myChunkX: chunk.x, homeX: chunk.x + 8 * BLOCK_SIZE },
                );
                villager.dimension = dimensionIndex;
                villager.position.y = this.world.userBlockYToWorld(floorY + 1) -
                    villager.hitbox.y;
                chunk.entities.push(villager);
            }
        }
        return true;
    }

    fill(
        startX,
        startY,
        endX,
        endY,
        blockType,
        dimensionIndex = activeDimension,
    ) {
        const originalStartX = startX;
        const originalStartY = startY;

        if (startX > endX) {
            startX = endX;
            endX = originalStartX;
        }

        if (startY > endY) {
            startY = endY;
            endY = originalStartY;
        }

        for (let x = startX; x <= endX; x += BLOCK_SIZE) {
            for (let y = startY; y <= endY; y += BLOCK_SIZE) {
                this.world.setBlockTypeAtPosition(
                    x,
                    y,
                    blockType,
                    false,
                    dimensionIndex,
                    null,
                );
            }
        }
    }

    getBiomeForNoise(temp, wetness, mountains, biomeSet, noiseMaps) {
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const toUnit = (value, noise) => {
            const min = noise.min - noise.intensity * 0.5;
            const max = noise.min + noise.intensity * 0.5;
            if (max === min) return 0.5;
            return clamp((value - min) / (max - min), 0, 1);
        };
        const rangeToUnit = (value, noise, fallback) => {
            if (!Number.isFinite(value)) return fallback;
            return toUnit(value, noise);
        };
        const resolveRange = (minVal, maxVal, noise) => {
            const finiteMin = Number.isFinite(minVal);
            const finiteMax = Number.isFinite(maxVal);
            const useNormalized =
                finiteMin &&
                finiteMax &&
                minVal >= 0 &&
                maxVal <= 1 &&
                minVal <= maxVal;

            if (useNormalized) {
                return { min: minVal, max: maxVal };
            }

            return {
                min: rangeToUnit(minVal, noise, 0),
                max: rangeToUnit(maxVal, noise, 1),
            };
        };
        const rangeScore = (value, min, max) => {
            const center = (min + max) / 2;
            const halfRange = Math.max(0.001, (max - min) / 2);
            return Math.abs(value - center) / halfRange;
        };
        const rangeDistance = (value, min, max) => {
            if (value < min) return min - value;
            if (value > max) return value - max;
            return 0;
        };

        const t = toUnit(temp, noiseMaps.temperature);
        const w = toUnit(wetness, noiseMaps.wetness);
        const m = toUnit(mountains, noiseMaps.mountains);

        let best = null;
        let bestScore = Infinity;

        for (const biomeName in biomeSet) {
            const b = biomeSet[biomeName];

            const tempRange = resolveRange(
                b.minTemp,
                b.maxTemp,
                noiseMaps.temperature,
            );
            const wetRange = resolveRange(
                b.minWet,
                b.maxWet,
                noiseMaps.wetness,
            );
            const mountRange = resolveRange(
                b.minMount,
                b.maxMount,
                noiseMaps.mountains,
            );

            const tempScore = rangeScore(t, tempRange.min, tempRange.max);
            const wetScore = rangeScore(w, wetRange.min, wetRange.max);
            const mountScore = rangeScore(m, mountRange.min, mountRange.max);

            const tempOut = rangeDistance(t, tempRange.min, tempRange.max);
            const wetOut = rangeDistance(w, wetRange.min, wetRange.max);
            const mountOut = rangeDistance(m, mountRange.min, mountRange.max);
            const outPenalty = tempOut + wetOut + mountOut;

            const score =
                tempScore +
                wetScore +
                mountScore * 1.2 +
                (outPenalty > 0 ? 5 + outPenalty * 10 : 0);

            if (score < bestScore) {
                bestScore = score;
                best = b;
            }
        }

        return best || biomeSet.Plains || Object.values(biomeSet)[0];
    }
}
