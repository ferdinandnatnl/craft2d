import { runtime } from "../utils/runtime.js";
import { Entities } from "../entities/entities.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { playPositionalSound } from "../game/sounds.js";
import { Vector2, randomRange } from "../utils/classes.js";
import { BLOCK_SIZE, CAVES_THRESHOLD, CHUNK_HEIGHT, CHUNK_WIDTH, TERRAIN_HEIGHT, mobSpawnDelay } from "../utils/globals.js";
import { OverworldBiomes } from "@2dcraft.com/shared/biome.js";
import { Block, getBlock } from "./block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { findNetherPortalFrame } from "@2dcraft.com/shared/netherPortal.js";
import { Dimensions, activeDimension, getDimension, getDimensionChunks } from "./dimension.js";
import { Trees } from "@2dcraft.com/shared/trees.js";
import { caveCellAt, caveColumnAt } from "@2dcraft.com/shared/caves.js";
import tooloud from "@2dcraft.com/shared/tooloud.js";
import { END_OUTPOST_X, END_SHRINE_WIDTH, endIslandSurfaceY, isEndShrineChunk } from "@2dcraft.com/shared/endProgression.js";
import { countMobsNearPlayer, MAX_MOBS_NEAR_PLAYER } from "./mobLimits.js";
import { daylightFactor } from "../utils/daylight.js";
import { catfishSpawnSize } from "../entities/mobs/catfish.js";

const MUTANT_VARIANTS = {
    Zombie: "MutantZombie",
    Husk: "MutantZombie",
    Drowned: "MutantZombie",
    Creeper: "MutantCreeper",
    Skeleton: "MutantSkeleton",
    WitherSkeleton: "MutantSkeleton",
    Enderman: "MutantEnderman",
};
function caveFeatureFor(seed, cellIndex) {
    let hash = 2166136261;
    for (const character of `cave:${seed}:${cellIndex}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    const roll = (hash >>> 0) % 6;
    if (roll === 0) return "warden";
    if (roll === 2 || roll === 4) return "mineshaft";
    return null;
}

export class Chunk {
    constructor(
        world,
        x = 0,
        width = 8,
        biome = OverworldBiomes.Plains,
        previousChunk = null,
        generated = false,
        dimension = Dimensions.Overworld
    ) {
        this.world = world;
        this.biome = biome;
        this.previousChunk = previousChunk;
        this.x = x;
        this.blocks = [];
        this.walls = [];
        this.width = width;
        this.height = CHUNK_HEIGHT;
        this.generated = generated;

        this.dimension = dimension;

        this.entities = [];
        this.update = [];
        this.spawnTime = 0;
        this.caveSpawnTime = 0;
        this.aquaticSpawningInitialized = false;

        this.generateChunk();
    }

    generateArray() {
        // Initialize blocks array for chunk
        for (let y = 0; y < this.height; y++) {
            this.blocks[y] = [];
            this.walls[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.blocks[y][x] = new Block(
                    this.world,
                    x,
                    y,
                    Blocks.Air,
                    this.x
                );
                this.walls[y][x] = new Block(
                    this.world,
                    x,
                    y,
                    Blocks.Air,
                    this.x,
                    true
                );

                this.blocks[y][x].dimensionIndex = this.dimension;
                this.walls[y][x].dimensionIndex = this.dimension;

                this.blocks[y][x].setBlockType(Blocks.Air, true);
                this.walls[y][x].setBlockType(Blocks.Air, true);

                const worldX = x * BLOCK_SIZE; // Use x for horizontal
                const worldY = y * BLOCK_SIZE; // Use y for vertical

                this.blocks[y][x].transform.position.x = worldX + this.x;
                this.blocks[y][x].transform.position.y = worldY;
                this.walls[y][x].transform.position.x = worldX + this.x;
                this.walls[y][x].transform.position.y = worldY;
            }
        }
    }

    generateChunk() {
        if (this.generated) return;

        this.generateArray(); // Initialize blocks

        if (this.dimension === Dimensions.End) {
            this.generateEndIsland();
            return;
        }

        if (this.world.generator.specialWorldProps.void) {
            this.generated = true;

            if (
                this.world.generator.specialWorldProps.skyblock &&
                this.x == 0
            ) {
                this.generateSkyBlock();
                return;
            }

            if (this.x == 0) this.generateVoidBlock();

            return;
        }

        this.generateHeight(); // Generate terrain height
    }

    generateEndIsland() {
        for (let x = 0; x < this.width; x++) {
            const worldBlockX = this.x / BLOCK_SIZE + x;
            const surface = endIslandSurfaceY(worldBlockX);
            if (surface === null) continue;
            for (let y = surface; y >= Math.max(surface - 6, 0); y--) {
                this.setBlockType(x, y, Blocks.EndStone);
            }
        }
    }

    generateEndOutpost() {
        if (this.dimension !== Dimensions.End) return;
        for (const blockX of [-END_OUTPOST_X, END_OUTPOST_X]) {
            const localX = blockX - this.x / BLOCK_SIZE;
            if (localX < 2 || localX >= this.width - 2) continue;
            const surface = endIslandSurfaceY(blockX);
            if (surface === null) continue;
            for (const offset of [-2, -1, 0, 1, 2]) {
                this.setBlockType(localX + offset, surface, Blocks.StoneBricks);
            }
            for (const offset of [-2, 2]) {
                for (let y = surface + 1; y <= surface + 3; y++) {
                    this.setBlockType(localX + offset, y, Blocks.StoneBricks);
                }
            }
            this.world.generator.generateChestWithLoot(new LootTable([
                new LootItem({ itemId: Items.Diamond, maxCount: 4 }),
                new LootItem({ itemId: Items.GoldenApple, maxCount: 2 }),
                new LootItem({ itemId: Items.EnderPearl, maxCount: 3 }),
            ]), blockX * BLOCK_SIZE,
            (CHUNK_HEIGHT - surface - 2) * BLOCK_SIZE, this);
        }
    }

    generateEndShrine() {
        if (this.dimension !== Dimensions.Overworld ||
            !isEndShrineChunk(this.x / BLOCK_SIZE)) return;

        const height = Math.max(...Array.from({ length: END_SHRINE_WIDTH },
            (_, x) => this.getHeight(x)));
        for (let x = 0; x < END_SHRINE_WIDTH; x++) {
            // Keep the frames level on uneven ground and above shallow water.
            for (let y = this.getHeight(x) + 1; y <= height; y++) {
                this.setBlockType(x, y, Blocks.StoneBricks);
            }
            this.setBlockType(x, height + 1, Blocks.EndPortalFrame);
            this.setBlockType(x, height + 2, Blocks.Air);
        }
    }

    generateVoidBlock() {
        this.setBlockType(0, CHUNK_HEIGHT / 2, Blocks.Glass);
    }

    generateSkyBlock() {
        const length = 4;

        // Grass layer
        for (
            let i = -BLOCK_SIZE * length;
            i < BLOCK_SIZE * length;
            i += BLOCK_SIZE
        ) {
            this.setBlockTypeAtPosition(
                i,
                (CHUNK_HEIGHT / 2) * BLOCK_SIZE,
                Blocks.GrassBlock
            );
        }
        // Dirt layers 2 thick
        for (
            let y = (CHUNK_HEIGHT / 2) * BLOCK_SIZE + BLOCK_SIZE;
            y < (CHUNK_HEIGHT / 2) * BLOCK_SIZE + BLOCK_SIZE * 3;
            y += BLOCK_SIZE
        ) {
            for (
                let i = -BLOCK_SIZE * length;
                i < BLOCK_SIZE * length;
                i += BLOCK_SIZE
            ) {
                this.setBlockTypeAtPosition(i, y, Blocks.Dirt);
            }
        }

        // Chest
        this.world.generator.generateChestWithLoot(
            new LootTable([
                new LootItem({ blockId: Blocks.IceBlock, maxCount: 1 }),
                new LootItem({ itemId: Items.LavaBucket, maxCount: 1 }),
                new LootItem({ itemId: Items.Seeds, maxCount: 3 }),
            ]),
            -BLOCK_SIZE * 3,
            (CHUNK_HEIGHT / 2) * BLOCK_SIZE - BLOCK_SIZE,
            this
        );

        // Tree
        setTimeout(() => {
            this.spawnTreeAt(Trees.Oak.variants[1], 2, CHUNK_HEIGHT / 2);
        }, 10);
    }

    getHeight(x) {
        return this.world.generator.getTerrainHeight(this.x / BLOCK_SIZE + x, this.dimension);
    }

    getWorldX(x) {
        return this.x + x;
    }

    applyBufferedBlocks() {
        const chunkX = this.x;
        const pendingBlocks = getDimension(this.dimension).pendingBlocks;
        if (pendingBlocks.has(chunkX)) {
            const entry = pendingBlocks.get(chunkX);
            // Only apply blocks matching this chunk's dimension
            if (entry.dimensionIndex === this.dimension) {
                entry.blocks.forEach((block) => {
                    if (block.blockType !== Blocks.Air) {
                        this.setBlockTypeAtPosition(
                            block.x,
                            block.y,
                            block.blockType,
                            block.metaData,
                            block.wall
                        );
                    }
                });
                pendingBlocks.delete(chunkX);
            }
        }
    }

    generateHeight() {
        for (let x = 0; x < this.width; x++) {
            let height = 0;

            if (!this.biome.fullChunk) height = this.getHeight(x);
            else {
                // Fill the entire chunk with the base block
                for (let y = 0; y < this.height; y++) {
                    this.setBlockType(x, y, this.biome.baseBlock);
                }
                continue;
            }

            if (this.world.generator.specialWorldProps.flat) {
                height = CHUNK_HEIGHT / 2;
            }

            if (this.world.generator.specialWorldProps.redstone) {
                // Set all blocks to Sandstone
                for (let y = 0; y < height; y++) {
                    this.setBlockType(x, y, Blocks.SandStone);
                }
                continue;
            }

            // Draw the top layer (first level) with a constant thickness.
            for (let y = height; y > height - this.biome.firstLayerWidth; y--) {
                this.setBlockType(x, y, this.biome.topLayer);
            }

            // Draw the second layer immediately below the top layer.
            for (
                let y = height - this.biome.firstLayerWidth;
                y >
                height -
                    this.biome.firstLayerWidth -
                    this.biome.secondLayerWidth;
                y--
            ) {
                this.setBlockType(x, y, this.biome.secondLayer);
            }

            // Fill the remaining depth with stone.
            for (
                let y =
                    height -
                    this.biome.firstLayerWidth -
                    this.biome.secondLayerWidth;
                y > 0;
                y--
            ) {
                this.setBlockType(x, y, this.biome.baseBlock);
                this.setBlockType(x, y, this.biome.baseBlock, true);
            }
        }
    }

    generateWater() {
        // Flat worlds use a fixed surface, so the normal height noise cannot
        // decide where water belongs. Keep new flat chunks dry and consistent.
        if (this.world.generator.specialWorldProps.flat) return;
        const maxWaterLevel = TERRAIN_HEIGHT + this.biome.waterLevel; // Calculate max water height

        for (let x = 0; x < this.width; x++) {
            const terrainHeight = this.getHeight(x); // Get terrain height at this x

            // Loop from one level above the terrain up to the max water level
            for (let y = terrainHeight + 1; y <= maxWaterLevel; y++) {
                const blockType = this.getBlockType(x, y);

                // Place water only if the block is air (empty)
                if (getBlock(blockType).air) {
                    this.setBlockType(x, y, this.biome.fluidType);
                }

                if (
                    this.getDown(x, y) &&
                    this.getDown(x, y).blockType == this.biome.topLayer
                )
                    this.setBlockType(x, y - 1, this.biome.waterSandType);
                if (
                    this.getLeft(x, y) &&
                    this.getLeft(x, y).blockType == this.biome.topLayer
                )
                    this.setBlockType(x - 1, y, this.biome.waterSandType);
                if (
                    this.getRight(x, y) &&
                    this.getRight(x, y).blockType == this.biome.topLayer
                )
                    this.setBlockType(x + 1, y, this.biome.waterSandType);
            }
        }
    }

    spawnMobs(passive = true) {
        if (!runtime.GAMERULES.doMobSpawning) return;

        // The Nether and End have no passive mob phase.
        if (this.dimension !== Dimensions.Overworld) passive = false;

        if (this.dimension === Dimensions.Overworld) this.spawnAquaticMobs();

        // If peaceful, don't spawn hostile googlies, but allow passive mobs
        if (this.world && this.world.difficulty === "peaceful" && !passive) {
            this.setMobSpawnTime();
            return;
        }

        if (
            (this.biome.mobs.length == 0 && passive) ||
            (this.biome.googlies.length == 0 && !passive)
        )
            return;

        const nearbyMobs = countMobsNearPlayer(this.world, this.dimension);
        if (nearbyMobs >= MAX_MOBS_NEAR_PLAYER) {
            this.setMobSpawnTime();
            return;
        }

        const count = Math.min(
            randomRange(-this.biome.maxMobs, this.biome.maxMobs),
            MAX_MOBS_NEAR_PLAYER - nearbyMobs,
        );

        if (count <= 0) {
            this.setMobSpawnTime();
            return;
        }

        let spawned = 0;
        let spawnedMutant = false;
        for (let i = 0; i < count; i++) {
            const randomX = randomRange(0, this.width);

            // The Nether has a solid roof. Find a cave floor near the player's
            // height instead of placing mobs on top of bedrock.
            let netherGround = null;
            if (this.dimension === Dimensions.Nether) {
                const playerFeet = (this.world.player?.position.y ?? 0) +
                    (this.world.player?.hitbox.y ?? 0);
                const candidates = [];
                for (let y = 1; y < this.height - 3; y++) {
                    const floor = this.getBlockType(randomX, y);
                    const above = this.getBlockType(randomX, y + 1);
                    const head = this.getBlockType(randomX, y + 2);
                    if (!getBlock(floor)?.collision || !getBlock(above)?.air ||
                        !getBlock(head)?.air) continue;
                    const feet = (this.height - y - 1) * BLOCK_SIZE;
                    if (Math.abs(feet - playerFeet) <= 12 * BLOCK_SIZE) {
                        candidates.push({ y, feet });
                    }
                }
                if (!candidates.length) continue;
                netherGround = candidates[randomRange(0, candidates.length)];
            } else if (this.dimension === Dimensions.End &&
                this.findGroundLevel(randomX) === 0) {
                continue;
            }

            const baseEntity = passive
                ? this.biome.mobs[randomRange(0, this.biome.mobs.length)]
                : this.biome.googlies[
                      randomRange(0, this.biome.googlies.length)
                  ];
            const mutantVariant = MUTANT_VARIANTS[baseEntity];
            const randomEntity = !passive && !spawnedMutant && mutantVariant &&
                randomRange(0, 12) === 0
                ? mutantVariant
                : baseEntity;
            if (randomEntity !== baseEntity) spawnedMutant = true;

            const entity = this.world.summonEntity(
                Entities[randomEntity],
                new Vector2(randomX * BLOCK_SIZE + this.x, 0),
                { myChunkX: this.x }
            );

            // Chunks may be generated for a destination before it is active.
            entity.dimension = this.dimension;
            this.entities.push(entity);
            spawned++;

            if (netherGround) {
                entity.position.y = netherGround.feet - entity.hitbox.y;
            } else if (this.dimension === Dimensions.End) {
                entity.setOnGround();
            } else {
                setTimeout(() => entity.setOnGround(), 400);
            }
        }
        if (spawned === 0) this.setMobSpawnTime();
    }

    spawnCaveMobs() {
        this.caveSpawnTime = runtime.passedTime + randomRange(25, 46);
        const player = this.world.player;
        if (this.dimension !== Dimensions.Overworld ||
            this.world.generator.specialWorldProps.noMobs ||
            this.world.difficulty === "peaceful" ||
            !runtime.GAMERULES.doMobSpawning ||
            player?.dimension !== this.dimension) return;

        const playerX = Math.floor(player.position.x / BLOCK_SIZE);
        const playerFeetY = CHUNK_HEIGHT -
            (player.position.y + player.hitbox.y) / BLOCK_SIZE;
        if (playerFeetY > this.world.generator.getTerrainHeight(playerX, this.dimension) - 6) return;

        const remaining = Math.min(2,
            4 - this.entities.filter(entity => entity.isHostile && entity.health > 0).length,
            MAX_MOBS_NEAR_PLAYER - countMobsNearPlayer(this.world, this.dimension));
        if (remaining <= 0) return;

        const floors = [];
        for (let x = 0; x < this.width; x++) {
            const worldX = this.x / BLOCK_SIZE + x;
            const distance = Math.abs(worldX - playerX);
            if (distance < 8 || distance > 32) continue;
            const surface = this.getHeight(x);
            const minY = Math.max(3, Math.floor(playerFeetY) - 8);
            const maxY = Math.min(this.height - 4, Math.ceil(playerFeetY) + 8, surface - 8);
            for (let y = minY; y <= maxY; y++) {
                const floor = getBlock(this.getBlockType(x, y - 1));
                if (!floor?.collision || floor.fluid ||
                    this.getBlockType(x, y) !== Blocks.Air ||
                    this.getBlockType(x, y + 1) !== Blocks.Air ||
                    (this.getBlock(x, y)?.lightLevel ?? 0) > 7) continue;
                floors.push({ x, y });
            }
        }
        if (!floors.length) return;

        const hasCentipede = this.entities.some(entity =>
            entity.isCentipede && entity.health > 0,
        );
        let spawnedCentipede = false;
        if (!hasCentipede && remaining > 0 && randomRange(0, 12) === 0) {
            const floor = floors.splice(randomRange(0, floors.length), 1)[0];
            const centipede = this.world.summonEntity(
                Entities.Centipede,
                new Vector2(this.x + floor.x * BLOCK_SIZE, 0),
                { myChunkX: this.x },
            );
            centipede.position.y = this.world.userBlockYToWorld(floor.y) -
                centipede.hitbox.y;
            centipede.dimension = this.dimension;
            this.entities.push(centipede);
            spawnedCentipede = true;
        }

        for (let i = spawnedCentipede ? 1 : 0; i < remaining && floors.length; i++) {
            const floor = floors.splice(randomRange(0, floors.length), 1)[0];
            const choices = this.getBlockType(floor.x, floor.y + 2) === Blocks.Air
                ? this.biome.googlies
                : this.biome.googlies.filter(name => name !== "Enderman");
            if (!choices.length) break;
            const entity = this.world.summonEntity(
                Entities[choices[randomRange(0, choices.length)]],
                new Vector2(this.x + floor.x * BLOCK_SIZE, 0),
                { myChunkX: this.x },
            );
            entity.position.y = this.world.userBlockYToWorld(floor.y) - entity.hitbox.y;
            entity.dimension = this.dimension;
            this.entities.push(entity);
        }
    }

    spawnAquaticMobs() {
        this.aquaticSpawningInitialized = true;
        if (
            this.dimension !== Dimensions.Overworld ||
            this.world.generator.specialWorldProps.noMobs ||
            !runtime.GAMERULES.doMobSpawning
        ) return;

        const existing = this.entities.filter((entity) => entity.isAquatic).length;
        const spawnLimit = 4;
        if (existing >= spawnLimit) return;
        const activeMobCount = countMobsNearPlayer(this.world, this.dimension);
        if (activeMobCount >= MAX_MOBS_NEAR_PLAYER) return;

        const waterCells = [];
        const deepWaterCells = [];
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.getBlockType(x, y) !== Blocks.Water) continue;

                const verticalWater = [
                    this.getBlockType(x, y - 1) === Blocks.Water,
                    this.getBlockType(x, y + 1) === Blocks.Water,
                ];
                if (!verticalWater.some(Boolean)) continue;

                const position = new Vector2(
                    this.x + x * BLOCK_SIZE + (BLOCK_SIZE - BLOCK_SIZE * 0.9) / 2,
                    this.world.userBlockYToWorld(y + 1) + BLOCK_SIZE * 0.25,
                );
                waterCells.push(position);

                if (
                    verticalWater.every(Boolean) &&
                    this.getBlockType(x, y - 2) === Blocks.Water &&
                    this.getBlockType(x, y + 2) === Blocks.Water
                ) {
                    deepWaterCells.push(position);
                }
            }
        }
        if (!waterCells.length) return;

        const speciesForBiome = this.biome.minTemp >= 0.65
            ? ["Cod", "TropicalFish", "TropicalFish", "Pufferfish"]
            : this.biome.minTemp <= 0.25
              ? ["Cod", "Salmon", "Salmon"]
              : ["Cod", "Cod", "Salmon", "TropicalFish", "Pufferfish"];
        const remaining = spawnLimit - existing;
        let count = Math.min(
            remaining,
            MAX_MOBS_NEAR_PLAYER - activeMobCount,
            randomRange(1, 3),
        );
        const catfishGroup = randomRange(0, 18) === 0;
        if (catfishGroup) count = Math.min(count, 2);

        for (let i = 0; i < count; i++) {
            const isSquid = !catfishGroup && deepWaterCells.length > 0 && randomRange(0, 8) === 0;
            const species = isSquid
                ? "Squid"
                : catfishGroup
                  ? "Catfish"
                : speciesForBiome[randomRange(0, speciesForBiome.length)];
            const cells = isSquid ? deepWaterCells : waterCells;
            const cellPosition = cells[randomRange(0, cells.length)];
            const catfishSize = species === "Catfish"
                ? catfishSpawnSize(this.biome.name)
                : null;
            const dimensions = species === "Catfish"
                ? Entities.Catfish.spawnSizeFor(catfishSize)
                : {
                    width: species === "Pufferfish" ? 0.7 : 0.9,
                    height: species === "Squid" ? 0.9 :
                        species === "Pufferfish" ? 0.7 : 0.5,
                };
            const width = dimensions.width * BLOCK_SIZE;
            const height = dimensions.height * BLOCK_SIZE;
            const entity = this.world.summonEntity(
                Entities[species],
                new Vector2(
                    cellPosition.x + (BLOCK_SIZE * 0.9 - width) / 2,
                    cellPosition.y + (BLOCK_SIZE * 0.5 - height) / 2,
                ),
                {
                    myChunkX: this.x,
                    ...(species === "Catfish" ? { catfishSize } : {}),
                },
            );
            entity.dimension = this.dimension;
            this.entities.push(entity);
        }
    }

    removeEntityFromChunk(entity) {
        const index = this.entities.indexOf(entity);
        this.entities.splice(index, 1);

        if (this.spawnTime) return;

        if (this.entities.length === 0) {
            this.setMobSpawnTime();
        }
    }

    setMobSpawnTime() {
        this.spawnTime = runtime.passedTime +
            randomRange(mobSpawnDelay.min, mobSpawnDelay.max);
    }

    updateChunk() {
        // Iterate backwards in case blocks remove themselves from the update array.
        for (let i = this.update.length - 1; i >= 0; i--) {
            const block = this.update[i];
            // Retrieve the block's updateSpeed from its block data.
            const speed = getBlock(block.blockType).updateSpeed || 1;

            // Initialize the accumulator if it doesn't exist.
            if (block._updateAccumulator === undefined) {
                block._updateAccumulator = 0;
            }

            // Add the speed value each tick.
            block._updateAccumulator += speed;

            // When the accumulator reaches at least 1, perform an update.
            if (block._updateAccumulator >= 1) {
                block.update();
                block._updateAccumulator -= 1; // subtract 1 while preserving any remainder.
            }
        }
    }

    getAllBlocks(blockType) {
        const returnBlocks = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const block = this.blocks[y][x];
                if (block.blockType === blockType) returnBlocks.push(block);
            }
        }

        return returnBlocks;
    }

    getDown(x, y) {
        return this.getBlock(x, y - 1); // Block below
    }

    getUp(x, y) {
        return this.getBlock(x, y + 1); // Block above
    }

    getLeft(x, y) {
        return this.getBlock(x - 1, y); // Block to the left
    }

    getRight(x, y) {
        return this.getBlock(x + 1, y); // Block to the right
    }

    generateBedrock() {
        for (let i = 0; i < this.width; i++) {
            this.setBlockType(i, 0, Blocks.Bedrock); // Set bedrock at the bottom
        }

        if (getDimension(this.dimension).bedrockRoof) {
            for (let i = 0; i < this.width; i++) {
                this.setBlockType(i, CHUNK_HEIGHT - 1, Blocks.Bedrock); // Set bedrock at the top
            }
        }
    }

    generateTrees() {
        if (!this.biome.treeType) return;
        if (this.biome.treeType.length == 0) return;
        for (
            let i = this.x;
            i < this.x + CHUNK_WIDTH * BLOCK_SIZE;
            i += BLOCK_SIZE
        ) {
            const noiseOutput = getDimension(
                this.dimension
            ).noiseMaps.tree.getNoise(i);
            if (noiseOutput >= this.biome.treeThreshold) {
                this.spawnTree(this.getLocalX(i, this));
            }
        }
    }

    generateGrass() {
        if (!this.biome.grassType) return;
        if (this.biome.grassType.length == 0) return;
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            if (
                getDimension(this.dimension).noiseMaps.grass.getNoise(
                    this.getWorldX(x)
                ) >= 1 && randomRange(0, 5) === 0
            ) {
                const y = this.findGroundLevel(x, false, true);
                if (!getBlock(this.getBlockType(x, y)).air) continue;
                const randomGrass =
                    this.biome.grassType[
                        randomRange(0, this.biome.grassType.length)
                    ];
                if (randomGrass === Blocks.DeadBush && randomRange(0, 5) !== 0) continue;

                this.setBlockType(x, y, randomGrass);
            }
        }
    }

    spawnTree(x) {
        const y = this.findGroundLevel(x, false, true); // Find valid ground level`
        if (!getBlock(this.getBlockType(x, y)).air) return;
        const randomTree = this.getRandomTreeFromBiome(); // Pick a random tree
        if (!randomTree) return;
        this.spawnTreeAt(randomTree, x, y); // Spawn the tree at the position
    }

    findGroundLevel(x, correctY = false, validGround = false) {
        for (let y = this.height - 1; y >= 0; y--) {
            const blockAtPos = this.getBlockType(x, y);
            if (
                blockAtPos != Blocks.GrassBlock &&
                blockAtPos != Blocks.SnowedGrassBlock &&
                blockAtPos != Blocks.Sand &&
                blockAtPos != Blocks.Podzol
            ) {
                if (validGround) continue;
            }
            if (!getBlock(blockAtPos).collision) continue;
            if (correctY) return y;
            return y + 1;
        }
        return 0;
    }

    generateCaves() {
        if (this.dimension === Dimensions.Overworld) {
            this.generateOverworldCaves();
            return;
        }

        const halfwayPoint = this.biome.heightNoise.min / 1.2;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let x = 0; x < CHUNK_WIDTH; x++) {
                const noiseValue = getDimension(
                    this.dimension
                ).noiseMaps.cave.getNoise(x + this.x / BLOCK_SIZE, y);

                let dynamicThreshold = CAVES_THRESHOLD;

                // Apply linear adjustment only from halfway up to the top
                if (y >= halfwayPoint) {
                    const heightFactor =
                        (y - halfwayPoint) /
                        (this.biome.heightNoise.min - halfwayPoint);
                    dynamicThreshold =
                        CAVES_THRESHOLD * (1 - Math.min(heightFactor, 1));
                }

                // Check if the noise value meets the adjusted threshold
                if (noiseValue <= dynamicThreshold) {
                    this.setBlockType(x, y, Blocks.Air); // Create cave openings
                }
            }
        }
    }

    generateOverworldCaves() {
        for (let x = 0; x < this.width; x++) {
            const worldX = this.x / BLOCK_SIZE + x;
            const surface = this.getHeight(x);
            const column = caveColumnAt(worldX);
            const carved = [];

            for (let y = 2; y <= surface; y++) {
                const cell = caveCellAt(worldX, y, surface, column);
                carved[y] = cell;
                if (cell === "air") this.setBlockType(x, y, Blocks.Air);
                else if (cell === "water") this.setBlockType(x, y, Blocks.Water);
                else if (cell === "lava") this.setBlockType(x, y, Blocks.Lava);
            }

            // Dress exposed cavern rock after carving, using the original
            // profile so new stalagmites cannot grow more stalagmites.
            for (let y = 3; y < surface - 4; y++) {
                if (this.getBlockType(x, y) !== this.biome.baseBlock) continue;
                const cavern = column.caverns.find(room =>
                    Math.abs(y - room.centerY) < room.radiusY + 4 &&
                    Math.abs(worldX - room.centerX) < room.radiusX);
                if (!cavern) continue;

                const feature = tooloud.Perlin.noise(worldX * 0.31, y * 0.23, 3229);
                if (carved[y + 1] === "air" || carved[y + 1] === "water" ||
                    carved[y + 1] === "lava") {
                    const material = carved[y + 1] === "water" ? Blocks.Gravel :
                        carved[y + 1] === "lava" ? Blocks.SmoothStone :
                        cavern.style === "moss" ? Blocks.MossyCobblestone :
                            feature > 0.15 ? Blocks.SmoothStone : this.biome.baseBlock;
                    this.setBlockType(x, y, material);
                    if (carved[y + 1] !== "air" || feature < 0.38) continue;
                    const length = Math.min(3, 1 + Math.floor((feature - 0.38) * 9));
                    for (let tip = 1; tip <= length && carved[y + tip] === "air"; tip++) {
                        this.setBlockType(x, y + tip, cavern.style === "moss" ?
                            Blocks.MossyCobblestone : Blocks.SmoothStone);
                    }
                } else if (carved[y - 1] === "air") {
                    if (cavern.style === "glow" && feature > 0.36) {
                        this.setBlockType(x, y, Blocks.Glowstone);
                    } else if (feature > 0.39) {
                        const length = Math.min(3, 1 + Math.floor((feature - 0.39) * 9));
                        for (let tip = 1; tip <= length && carved[y - tip] === "air"; tip++) {
                            this.setBlockType(x, y - tip, cavern.style === "moss" ?
                                Blocks.MossyCobblestone : Blocks.SmoothStone);
                        }
                    }
                }
            }
        }
    }

    generateCaveStructures() {
        if (this.dimension !== Dimensions.Overworld) return;

        const worldStart = this.x / BLOCK_SIZE;
        const worldEnd = worldStart + this.width;
        const rooms = new Map();
        for (let x = 0; x < this.width; x++) {
            const worldX = worldStart + x;
            for (const cavern of caveColumnAt(worldX).caverns) {
                const feature = caveFeatureFor(this.world.seed, cavern.cellIndex);
                if (feature && cavern.centerX >= worldStart &&
                    cavern.centerX < worldEnd) {
                    const localCenterX = Math.max(0, Math.min(this.width - 1,
                        Math.floor(cavern.centerX - worldStart)));
                    const centerBlock = this.getBlockType(localCenterX,
                        Math.floor(cavern.centerY));
                    if (centerBlock !== Blocks.Air && centerBlock !== Blocks.Water) continue;
                    rooms.set(cavern.centerX, { ...cavern, feature });
                }
            }
        }

        for (const cavern of rooms.values()) {
            const centerX = Math.max(5, Math.min(this.width - 6,
                Math.floor(cavern.centerX - worldStart)));
            if (cavern.feature === "warden") this.generateWardenDen(cavern, centerX, worldStart);
            else if (cavern.feature === "mineshaft") this.generateCaveMineshaft(cavern, centerX, worldStart);
        }
    }

    findCaveFloorY(x, cavern) {
        const lowest = Math.max(3, Math.floor(cavern.centerY - cavern.radiusY) + 2);
        const highest = Math.min(this.height - 4, Math.floor(cavern.centerY) + 2);
        for (let y = highest; y >= lowest; y--) {
            if (this.getBlockType(x, y) !== Blocks.Air) continue;
            const floor = getBlock(this.getBlockType(x, y - 1));
            if (floor?.collision && !floor.fluid) return y;
        }
        return null;
    }

    generateCaveMineshaft(cavern, centerX, worldStart) {
        if (cavern.lake) return;

        const startX = centerX - 4;
        const tracks = [];
        for (let x = startX; x <= startX + 8; x++) {
            const floorY = this.findCaveFloorY(x, cavern);
            if (floorY === null) return;
            tracks.push({ x, floorY });
        }

        for (const { x, floorY } of tracks) {
            this.setBlockType(x, floorY - 1, Blocks.OakPlanks);
            this.setBlockType(x, floorY, Blocks.Rail);
        }

        const first = tracks[0];
        const last = tracks[tracks.length - 1];
        for (const end of [first, last]) {
            for (let rise = 1; rise <= 3; rise++) {
                if (this.getBlockType(end.x, end.floorY + rise) === Blocks.Air) {
                    this.setBlockType(end.x, end.floorY + rise, Blocks.OakLog);
                }
            }
        }
        const beamY = Math.min(first.floorY, last.floorY) + 3;
        for (const { x } of tracks) {
            if (this.getBlockType(x, beamY) === Blocks.Air) {
                this.setBlockType(x, beamY, Blocks.OakLog);
            }
        }

        for (const [index, variant] of [[1, "normal"], [7, "chest"]]) {
            const track = tracks[index];
            const cart = this.world.summonEntity(
                Entities.Minecart,
                new Vector2((worldStart + track.x) * BLOCK_SIZE,
                    this.world.userBlockYToWorld(track.floorY) - 0.8 * BLOCK_SIZE),
                { variant },
            );
            cart.dimension = this.dimension;
        }
    }

    generateWardenDen(cavern, centerX, worldStart) {
        const floorY = cavern.lake ? cavern.waterLevel + 2 :
            this.findCaveFloorY(centerX, cavern) ?? Math.floor(cavern.centerY - 2);
        if (floorY < 3 || floorY + 3 >= this.height) return;

        // A raised sculk dais keeps the den dry in flooded chambers.
        for (let x = centerX - 3; x <= centerX + 3; x++) {
            this.setBlockType(x, floorY - 1,
                x === centerX - 1 ? Blocks.SculkCatalyst : Blocks.Sculk);
        }
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            for (let y = floorY; y <= floorY + 3; y++) {
                this.setBlockType(x, y, Blocks.Air);
            }
        }
        this.setBlockType(centerX - 3, floorY, Blocks.SculkSensor);
        this.setBlockType(centerX + 2, floorY, Blocks.SculkShrieker);
        this.setBlockType(centerX + 3, floorY, Blocks.SculkSensor);

        this.world.generator.generateChestWithLoot(new LootTable([
            new LootItem({ itemId: Items.EchoShard, maxCount: 2 }),
            new LootItem({ itemId: Items.Diamond, maxCount: 3 }),
            new LootItem({ itemId: Items.GoldenApple, maxCount: 1 }),
            new LootItem({ itemId: Items.RedstoneDust, maxCount: 8, subtract: 3 }),
        ]), (worldStart + centerX + 4) * BLOCK_SIZE,
        this.world.userBlockYToWorld(floorY), this);

        if (this.world.generator.specialWorldProps.noMobs ||
            this.world.difficulty === "peaceful" ||
            !runtime.GAMERULES?.doMobSpawning) return;

        const warden = this.world.summonEntity(
            Entities.Warden,
            new Vector2((worldStart + centerX) * BLOCK_SIZE,
                this.world.userBlockYToWorld(floorY) - 3 * BLOCK_SIZE),
            { myChunkX: this.x },
        );
        warden.dimension = this.dimension;
        this.entities.push(warden);
    }

    generateOres() {
        const noiseMaps = getDimension(this.dimension).noiseMaps;

        if (!noiseMaps.ores) return;

        const oreEntries = Object.entries(noiseMaps.ores);

        oreEntries.forEach(([oreKey, ore], index) => {
            // Offset is the index of the ore in the ores array * 10000
            const offset = index * 10000;

            const depth = ore.depth || CHUNK_HEIGHT;

            this.generateOre(
                ore.noise,
                ore.threshold,
                ore.block,
                offset,
                depth
            ); // Generate ores
        });
    }

    generateOre(noise, threshold, block, offset, height = CHUNK_HEIGHT) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let x = 0; x < CHUNK_WIDTH; x++) {
                const noiseValue = noise.getNoise(
                    x + this.x / BLOCK_SIZE,
                    y + offset
                );

                if (this.getBlockType(x, y) != this.biome.baseBlock) continue;

                if (noiseValue > threshold) continue;

                if (y > height) continue;

                this.setBlockType(x, y, block);

                // if (block === Blocks.Lava)
                //    game.chat.message(
                //         `Generated ore ${GetBlock(block).name} at (${x}, ${y}) in chunk at x=${this.x} in dimension ${this.dimension}`,
                //     );
            }
        }
    }

    getRandomTreeFromBiome() {
        const trees = this.biome.treeType;
        const variants = trees[randomRange(0, trees.length)].variants;

        return variants[randomRange(0, variants.length)];
    }

    spawnTreeAt(tree, x, y) {
        if (y <= 3) return;

        // Select a random variant from the tree
        const structure = tree.blocks; // Get the block layout

        // Randomly choose to flip (mirroring) the structure.
        const flip = randomRange(0, 2) === 1; // flip is true 50% of the time

        const treeHeight = structure.length;
        const treeWidth = structure[0].length;

        // Calculate the bottom center of the tree
        const offsetX = Math.floor(treeWidth / 2) * BLOCK_SIZE;
        const offsetY = 0; // Bottom-most row is the base

        for (let i = 0; i < treeHeight; i++) {
            const layerWidth = structure[i].length;
            for (let j = 0; j < layerWidth; j++) {
                const flippedI = treeHeight - i - 1;

                const block = structure[flippedI][j];

                if (block === Blocks.Air) continue; // Skip air blocks

                // If flipped, mirror the column index.
                const columnIndex = flip ? layerWidth - 1 - j : j;

                // Calculate the world coordinates
                const worldX =
                    this.x +
                    x * BLOCK_SIZE -
                    offsetX +
                    columnIndex * BLOCK_SIZE;
                const userBlockY = y + i;
                const worldY =
                    this.userYToLocalY(userBlockY) * BLOCK_SIZE - offsetY;

                if (getBlock(block).noPriority) {
                    // Check if there already is a block at this position

                    const blockAtPos = this.world.getBlockAtWorldPosition(
                        worldX,
                        worldY
                    );

                    if (blockAtPos)
                        if (!getBlock(blockAtPos.blockType)?.air) {
                            continue;
                        }
                }

                this.setBlockTypeAtPosition(worldX, worldY, block);
            }
        }
    }

    setBlockTypeAtPosition(
        worldX,
        worldY,
        blockType,
        metaData = null,
        wall = false
    ) {
        const chunkWidthPixels = CHUNK_WIDTH * BLOCK_SIZE;
        const targetChunkX =
            Math.floor(worldX / chunkWidthPixels) * chunkWidthPixels;
        const targetChunk = getDimension(this.dimension).chunks.get(
            targetChunkX
        );

        if (targetChunk && worldY < targetChunk.height * BLOCK_SIZE) {
            const localX = Math.floor((worldX - targetChunk.x) / BLOCK_SIZE);
            const localY = Math.floor(worldY / BLOCK_SIZE);
            targetChunk.setBlockTypeLocal(
                localX,
                localY,
                blockType,
                wall,
                metaData
            );
        } else {
            // Buffer the block with dimension index`
            this.world.bufferBlock(
                worldX,
                worldY,
                blockType,
                this.dimension,
                metaData,
                wall,
                false
            );
        }
    }

    getChunkForBlock(worldX) {
        const chunkX =
            Math.floor(worldX / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH *
            BLOCK_SIZE;
        return getDimensionChunks(this.dimension).get(chunkX); // Use the Map to get the chunk by its x-coordinate
    }

    getLocalX(worldX, targetChunk = this) {
        return (worldX - targetChunk.x) / BLOCK_SIZE; // Scale the position to the block grid using BLOCK_SIZE
    }

    userYToLocalY(y) {
        return this.height - 1 - y;
    }

    localYToUserY(y) {
        return this.height - 1 - y;
    }

    getBlockTypeLocal(x, localY) {
        if (!this.blocks[localY]) return null;
        if (!this.blocks[localY][x]) return null;
        return this.blocks[localY][x].blockType;
    }

    getBlockType(x, y) {
        return this.getBlockTypeLocal(x, this.userYToLocalY(y));
    }

    getBlockLocal(x, localY, wall = false) {
        // Handle x out of bounds by getting from correct chunk
        if (x < 0 || x >= this.width) {
            const worldX = this.x + x * BLOCK_SIZE;
            const targetChunk = this.getChunkForBlock(worldX);
            if (!targetChunk) return null;

            const localX = this.getLocalX(worldX, targetChunk);
            return targetChunk.getBlockLocal(localX, localY, wall);
        }

        if (!wall) {
            if (!this.blocks[localY]) return null;
            if (!this.blocks[localY][x]) return null;
            return this.blocks[localY][x];
        }

        if (!this.walls[localY]) return null;
        if (!this.walls[localY][x]) return null;
        return this.walls[localY][x];
    }

    getBlock(x, y, wall = false) {
        return this.getBlockLocal(x, this.userYToLocalY(y), wall);
    }

    getBlockTypeDataLocal(x, localY, wall = false) {
        if (!wall) {
            if (!this.blocks[localY]) return null;
            if (!this.blocks[localY][x]) return null;
            return getBlock(this.blocks[localY][x].blockType);
        }

        if (!this.walls[localY]) return null;
        if (!this.walls[localY][x]) return null;
        return getBlock(this.walls[localY][x].blockType);
    }

    getBlockTypeData(x, y, wall = false) {
        return this.getBlockTypeDataLocal(x, this.userYToLocalY(y), wall);
    }

    setBlockTypeLocal(
        x,
        y,
        blockType,
        wall = false,
        metaData = null,
        updateBlocks = false,
        makeLinks = true
    ) {
        // Check if blockType is a valid int
        if (typeof blockType !== "number") blockType = Blocks.Air;

        const array = wall ? this.walls : this.blocks;

        if (!array[y] || !array[y][x]) return false; // Out of bounds check

        const block = array[y][x];
        if (block.blockType === blockType) return false;

        const blockDef = getBlock(blockType);
        let linkedBlocks = [];

        // Handle extended blocks
        if (blockDef.extendedBlock && makeLinks) {
            // First pass: Validate all extended block positions
            for (let i = 0; i < blockDef.extendedBlock.length; i++) {
                const extendedBlock = blockDef.extendedBlock[i];
                const xOff = extendedBlock.offset.x;
                const yOff = extendedBlock.offset.y;

                const xIndex = x + xOff;
                const yIndex = y - yOff;

                const worldX = this.x + xIndex * BLOCK_SIZE;
                const worldY = yIndex * BLOCK_SIZE; // Bottom-up world Y

                if (worldY < 0 || worldY >= CHUNK_HEIGHT * BLOCK_SIZE) {
                    return false;
                }

                const targetChunk = this.getChunkForBlock(worldX);
                if (!targetChunk) {
                    this.setBlockTypeAtPosition(
                        worldX,
                        worldY,
                        extendedBlock.blockId,
                        metaData,
                        wall
                    );
                    continue;
                }

                const localX = Math.floor(
                    (worldX - targetChunk.x) / BLOCK_SIZE
                );
                const localY = Math.floor(worldY / BLOCK_SIZE);

                if (
                    localX < 0 ||
                    localX >= targetChunk.width ||
                    localY < 0 ||
                    localY >= targetChunk.height
                ) {
                    this.setBlockTypeAtPosition(
                        worldX,
                        worldY,
                        extendedBlock.blockId,
                        metaData,
                        wall
                    );
                    continue;
                }

                const blockAtPos = targetChunk.getBlockLocal(
                    localX,
                    localY,
                    wall
                );
                const blockAtPosDef = blockAtPos
                    ? getBlock(blockAtPos.blockType)
                    : null;

                if (
                    !blockAtPosDef ||
                    (!blockAtPosDef.air && !blockAtPosDef.replaceable)
                ) {
                    return false; // Abort if any extended block can’t be placed
                }
            }

            // Second pass: Place extended blocks and collect references
            const extendedBlockRefs = [];
            for (let i = 0; i < blockDef.extendedBlock.length; i++) {
                const extendedBlock = blockDef.extendedBlock[i];
                const xOff = extendedBlock.offset.x;
                const yOff = extendedBlock.offset.y;

                const xIndex = x + xOff;
                const yIndex = y - yOff;

                const worldX = this.x + xIndex * BLOCK_SIZE;
                const worldY = yIndex * BLOCK_SIZE;

                const targetChunk = this.getChunkForBlock(worldX);
                if (!targetChunk) {
                    this.setBlockTypeAtPosition(
                        worldX,
                        worldY,
                        extendedBlock.blockId,
                        metaData,
                        wall
                    );
                    linkedBlocks.push({
                        x: worldX,
                        y: worldY,
                        blockType: extendedBlock.blockId,
                    });
                    continue;
                }

                const localX = Math.floor(
                    (worldX - targetChunk.x) / BLOCK_SIZE
                );
                const localY = Math.floor(worldY / BLOCK_SIZE);

                const blockAtPos = targetChunk.getBlockLocal(
                    localX,
                    localY,
                    wall
                );

                // Skip placing if the block is already the correct type
                if (blockAtPos.blockType === extendedBlock.blockId) {
                    extendedBlockRefs.push(blockAtPos);
                    linkedBlocks.push({
                        x: worldX,
                        y: worldY,
                        blockType: extendedBlock.blockId,
                    });
                    continue;
                }

                // Place the block and get its reference
                targetChunk.setBlockTypeLocal(
                    localX,
                    localY,
                    extendedBlock.blockId,
                    wall,
                    metaData
                );
                const extendedBlockRef = targetChunk.getBlockLocal(
                    localX,
                    localY,
                    wall
                );
                extendedBlockRefs.push(extendedBlockRef);
                linkedBlocks.push({
                    x: worldX,
                    y: worldY,
                    blockType: extendedBlock.blockId,
                });
            }

            // Set the main block
            block.setBlockType(blockType);
            linkedBlocks.push({
                ...this.localToWorldInternal(x, y),
                blockType,
            });

            // Assign linkedBlocks to all affected blocks
            const allBlocks = [block, ...extendedBlockRefs];
            for (let linkedBlock of allBlocks) {
                if (linkedBlock) {
                    linkedBlock.linkedBlocks = linkedBlocks;
                }
            }
        } else {
            let brokenPortalChunks = null;
            if (block.blockType === Blocks.Obsidian && blockType !== Blocks.Obsidian) {
                brokenPortalChunks = this.checkForPortalBreak(x, y);
            }

            // Regular block placement without extended blocks
            block.setBlockType(blockType);
            if (brokenPortalChunks?.size) {
                brokenPortalChunks.add(this.x);
                for (const chunkX of brokenPortalChunks) {
                    this.world.uploadChunkToServer(chunkX, this.dimension);
                }
            }

            linkedBlocks.push({
                ...this.localToWorldInternal(x, y),
                blockType,
            });
            block.linkedBlocks = linkedBlocks;
        }

        if (!wall && blockDef.chunkUpdate) {
            if (!this.update.includes(block)) {
                this.update.push(block);
            }
        } else {
            const index = this.update.indexOf(block);
            if (index !== -1) {
                this.update.splice(index, 1);
            }
        }
        if (updateBlocks) {
            block.blockUpdate();
            this.updateAdjacentBlocksLocal(x, y, wall);
        }

        block.dark = wall;
        block.wall = wall;

        if (!wall && blockDef.blockId === Blocks.Fire) {
            this.checkForPortal(x, y);
        }

        if (metaData !== null) block.setBlockMetaData(metaData);

        return block;
    }

    setBlockType(
        x,
        y,
        blockType,
        wall = false,
        metaData = null,
        updateBlocks = false,
        makeLinks = true
    ) {
        return this.setBlockTypeLocal(
            x,
            this.userYToLocalY(y),
            blockType,
            wall,
            metaData,
            updateBlocks,
            makeLinks
        );
    }

    checkForPortalBreak(x, y) {
        // Convert local chunk coordinates to world coordinates
        const worldX = this.x + x * BLOCK_SIZE;
        const worldY = y * BLOCK_SIZE;

        // Restrict to Overworld and Nether
        if (
            this.dimension !== Dimensions.Overworld &&
            this.dimension !== Dimensions.Nether
        ) {
            return;
        }

        // Check the four adjacent blocks (up, down, left, right) for NetherPortal
        const directions = [
            { dx: BLOCK_SIZE, dy: 0 }, // Right
            { dx: -BLOCK_SIZE, dy: 0 }, // Left
            { dx: 0, dy: BLOCK_SIZE }, // Up
            { dx: 0, dy: -BLOCK_SIZE }, // Down
        ];

        let hasAdjacentPortal = false;
        const queue = [];
        const visited = new Set();

        for (const { dx, dy } of directions) {
            const adjX = worldX + dx;
            const adjY = worldY + dy;
            const key = `${adjX},${adjY}`;
            const block = this.world.getBlockAtWorldPosition(adjX, adjY, false, this.dimension);
            if (block && block.blockType === Blocks.NetherPortal) {
                hasAdjacentPortal = true;
                queue.push({ x: adjX, y: adjY });
                visited.add(key);
            }
        }

        if (!hasAdjacentPortal) return null;

        const changedChunks = new Set();

        // Process queue to break all connected NetherPortal blocks
        while (queue.length > 0) {
            const { x: currX, y: currY } = queue.shift();

            // Break the current portal block
            this.world.setBlockTypeAtPosition(
                currX, currY, Blocks.Air, false, this.dimension, null, false
            );
            changedChunks.add(this.world.getChunkXForWorldX(currX));

            // Check adjacent blocks for more NetherPortal blocks
            for (const { dx, dy } of directions) {
                const nextX = currX + dx;
                const nextY = currY + dy;
                const key = `${nextX},${nextY}`;
                if (visited.has(key)) continue;

                const block = this.world.getBlockAtWorldPosition(nextX, nextY, false, this.dimension);
                if (block && block.blockType === Blocks.NetherPortal) {
                    queue.push({ x: nextX, y: nextY });
                    visited.add(key);
                }
            }
        }
        return changedChunks;
    }

    checkForPortal(x, y) {
        const worldX = this.x + x * BLOCK_SIZE;
        const worldY = y * BLOCK_SIZE;
        if (
            this.dimension !== Dimensions.Overworld &&
            this.dimension !== Dimensions.Nether
        ) {
            return;
        }
        const frame = findNetherPortalFrame(
            worldX / BLOCK_SIZE,
            worldY / BLOCK_SIZE,
            (column, row) => this.world.getBlockAtWorldPosition(
                column * BLOCK_SIZE, row * BLOCK_SIZE, false, this.dimension
            )?.blockType,
            { air: [Blocks.Air, Blocks.StructureAir], fire: Blocks.Fire, obsidian: Blocks.Obsidian }
        );
        if (!frame) return;

        const changedChunks = new Set();
        for (let row = frame.top + 1; row < frame.bottom; row++) {
            for (let column = frame.left + 1; column < frame.right; column++) {
                const x = column * BLOCK_SIZE;
                this.world.setBlockTypeAtPosition(
                    x, row * BLOCK_SIZE, Blocks.NetherPortal,
                    false, this.dimension, null, false
                );
                changedChunks.add(this.world.getChunkXForWorldX(x));
            }
        }
        for (const chunkX of changedChunks) {
            this.world.uploadChunkToServer(chunkX, this.dimension);
        }
        playPositionalSound(new Vector2(worldX, worldY), "portal/trigger.ogg");
    }

    localToWorldInternal(x, y) {
        return { x: x * BLOCK_SIZE + this.x, y: y * BLOCK_SIZE };
    }

    localToWorldUser(x, y) {
        return this.localToWorldInternal(x, this.userYToLocalY(y));
    }

    localToWorld(x, y) {
        return this.localToWorldUser(x, y);
    }

    updateAdjacentBlocksLocal(x, y, wall) {
        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 0, dy: 1 }, // Down
            { dx: -1, dy: 0 }, // Left
            { dx: 1, dy: 0 }, // Right
        ];

        for (const { dx, dy } of directions) {
            const adjX = x + dx;
            const adjY = y + dy;
            const adjBlock = this.getBlockLocal(adjX, adjY, wall);
            if (adjBlock) {
                adjBlock.blockUpdate();
            }
        }
    }

    updateAdjacentBlocks(x, y, wall) {
        this.updateAdjacentBlocksLocal(x, this.userYToLocalY(y), wall);
    }

    //#region Lighting

    updateSkyLight() {
        if (this.world.generator.specialWorldProps.void) return;

        // Maximum skylight: 15 during day, 1 at night
        const maxSkyLight = !getDimension(this.dimension).alwaysDay
            ? Math.floor(1 + 14 * daylightFactor(runtime.time))
            : 15;

        if (getDimension(this.dimension).baseLightLevel) {
            // Set every block to the base light level
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const block = this.blocks[y][x];
                    block.lightLevel = getDimension(
                        this.dimension
                    ).baseLightLevel;
                    block.skyExposure = 0;
                    block.sunLight = false;
                }
            }

            return;
        }

        // Loop over every column in the chunk
        for (let x = 0; x < this.width; x++) {
            let skyLight = maxSkyLight;
            let stopped = false;
            let cover = 0;

            for (let y = 0; y < this.height; y++) {
                const block = this.blocks[y][x];
                block.lightLevel = skyLight;
                block.sunLight = false;
                block.skyExposure = Math.max(0, 1 - cover / 10);

                const def = getBlock(block.blockType);

                if (
                    (!def.air && !def.transparent && def.collision) ||
                    y > CHUNK_HEIGHT - (TERRAIN_HEIGHT + this.biome.waterLevel)
                ) {
                    skyLight = Math.max(skyLight - 1, 1);
                    stopped = true;
                    cover = Math.min(10, cover + 1);
                } else {
                    if (!stopped) {
                        skyLight = maxSkyLight;
                        block.sunLight = true;
                    } else {
                        skyLight = Math.max(skyLight - 1, 1);
                        cover = Math.min(10, cover + 1);
                    }
                }
            }
        }
    }

    //#endregion

    countAirBlockArea(startX, startY) {
        if (!getBlock(this.getBlockType(startX, startY)).air) {
            return 0;
        }

        const queue = [];
        const visited = new Set();
        let areaSize = 0;

        const tryAddToQueue = (x, y) => {
            const key = `${x},${y}`;
            if (
                x >= 0 &&
                x < this.width &&
                y >= 0 &&
                y < this.height &&
                !visited.has(key) &&
                getBlock(this.getBlockType(x, y)).air
            ) {
                queue.push([x, y]);
                visited.add(key);
            }
        };

        queue.push([startX, startY]);
        visited.add(`${startX},${startY}`);

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            areaSize++;

            tryAddToQueue(x + 1, y);
            tryAddToQueue(x - 1, y);
            tryAddToQueue(x, y + 1);
            tryAddToQueue(x, y - 1);
        }

        return areaSize;
    }

    //#region Drawing

    draw(ctx, camera) {
        this.drawBlocks(ctx, this.walls, camera);
        this.drawBlocks(ctx, this.blocks, camera);
    }

    drawBlocks(ctx, blocks, camera) {
        for (let i = 0; i < blocks.length; i++) {
            for (let j = 0; j < blocks[i].length; j++) {
                const block = blocks[i][j];

                const worldX = j * BLOCK_SIZE; // Use j for x (horizontal)
                const worldY = i * BLOCK_SIZE; // Use i for y (vertical)

                // block.transform.position.x = worldX + this.x;
                // block.transform.position.y = worldY;

                if (
                    !camera.isInScreen(
                        new Vector2(worldX + this.x, worldY),
                        new Vector2(BLOCK_SIZE, BLOCK_SIZE)
                    )
                )
                    continue;

                this.drawBlockAtPosition(ctx, block, worldX, worldY, camera);
            }
        }
    }

    drawBlockAtPosition(ctx, block, x, y, camera) {
        block.draw(ctx, camera);
    }

    //#endregion
}
