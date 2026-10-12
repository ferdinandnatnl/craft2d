import { runtime } from "../utils/runtime.js";
import { Colors } from "../game/chat.js";
import { InventoryItem } from "../game/inventoryItem.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, SPAWN_PLAYER, multiplayer } from "../utils/globals.js";
import { resolveBiome } from "@2dcraft.com/shared/biome.js";
import { getBlock } from "./block.js";
import { Chunk } from "./chunk.js";
import { Dimensions, activeDimension, dimensions, getDimension, gotoDimension } from "./dimension.js";
import { downloadWorldSave } from "../../buttonUtils.js";
import { Villager } from "../entities/mobs/villager.js";
import { IronGolem, SnowGolem } from "../entities/mobs/golem.js";
import { Boat } from "../entities/boat.js";
import { Warden } from "../entities/mobs/warden.js";
import { Minecart } from "../entities/minecart.js";
import { CreeperMinion, CreeperMinionEgg } from "../entities/mobs/creeperMinion.js";
import { Catfish } from "../entities/mobs/catfish.js";
import { Centipede } from "../entities/mobs/centipede.js";
import { Minion, normalizeMinionSaveData } from "../entities/mobs/minion.js";

export const AUTOSAVE_INTERVAL = 60000;

setInterval(() => {
    autoSave();
}, AUTOSAVE_INTERVAL);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autoSave();
});
window.addEventListener("pagehide", autoSave);

export function autoSave() {
    if (multiplayer || !runtime.world?.player || !runtime.hotbar ||
        runtime.world.generator.loadingWorld) return;
    saveWorld(false);
}

export let currentSave = {
    playerPosition: new Vector2(),
    gamemode: 0,
    time: 0,
    inventoryItems: [[]],
    seed: 0,
    pendingBlocks: new Map(),
    dimensions: [], // Array of { index, chunks: [{ x, biome, previousChunk, blocks, walls }] }
    boats: [],
    golems: [],
    catfish: [],
    centipedes: [],
    minions: [],
    xpLevel: 0,
    minionProgress: { evilDeeds: 0, unlocked: false },
    playerBoatUUID: null,
    playerStatusEffects: null,
};

export function saveWorld(message = true, toFile = false) {
    let savedDimensions = [];

    // Save chunks and pendingBlocks for each dimension
    dimensions.forEach((dimension, index) => {
        let savedChunks = [];
        dimension.chunks.forEach((chunk) => {
            ``;
            const newSaveChunk = saveChunk(chunk);
            savedChunks.push({
                x: chunk.x,
                biome: {
                    name: chunk.biome.name,
                    dimension: index,
                },
                previousChunk: chunk.previousChunk
                    ? chunk.previousChunk.x
                    : null,
                blocks: newSaveChunk.blocks,
                walls: newSaveChunk.walls,
            });
        });

        // Save dimension-specific pendingBlocks
        const savedPendingBlocks = Array.from(
            dimension.pendingBlocks.entries(),
        ).map(([chunkX, entry]) => ({
            chunkX,
            dimensionIndex: index,
            blocks: entry.blocks,
        }));

        savedDimensions.push({
            index: index,
            chunks: savedChunks,
            pendingBlocks: savedPendingBlocks, // Store pendingBlocks per dimension
        });
    });

    let playerInventory = [[]];
    for (let i = 0; i < runtime.world.player.inventory.items.length; i++) {
        playerInventory[i] = [];
        for (let j = 0; j < runtime.world.player.inventory.items[i].length; j++) {
            playerInventory[i][j] = runtime.world.player.inventory.items[i][j].item;
        }
    }

    currentSave.time = runtime.time;
    currentSave.gameRules = runtime.GAMERULES;
    currentSave.difficulty = runtime.world.difficulty;

    if (runtime.world.player) {
        currentSave.playerPosition = JSON.stringify(runtime.world.player.position);
        currentSave.inventoryItems = JSON.stringify(playerInventory);
        currentSave.gamemode = runtime.world.player.gamemode;
        currentSave.health = runtime.world.player.health;
        currentSave.foodLevel = runtime.world.player.foodLevel;
        currentSave.foodSaturationLevel = runtime.world.player.foodSaturationLevel;
        currentSave.foodExhaustionLevel = runtime.world.player.foodExhaustionLevel;
        currentSave.foodTickTimer = runtime.world.player.foodTickTimer;
        currentSave.currentSlot = runtime.hotbar.currentSlot;
        currentSave.activeDimension = activeDimension;
        currentSave.flying = runtime.world.player.abilities.flying;
        currentSave.playerBoatUUID = runtime.world.player.boat?.UUID ?? null;
        currentSave.playerStatusEffects = runtime.world.player.getStatusEffectSaveData();
        currentSave.xpLevel = runtime.world.player.xpLevel;
        currentSave.minionProgress = structuredClone(
            runtime.world.player.minionProgress || { evilDeeds: 0, unlocked: false },
        );
        if (runtime.world.player.spawnPoint) {
            currentSave.spawnPoint = JSON.stringify(runtime.world.player.spawnPoint);
        }
    }

    currentSave.seed = runtime.world.seed;
    currentSave.dimensions = savedDimensions;
    currentSave.villagers = runtime.world.entities
        .filter(entity => entity.name === "Villager" && entity.health > 0)
        .map(entity => ({
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            health: entity.health,
            homeX: entity.homeX,
            dimension: entity.dimension,
            statusEffects: entity.getStatusEffectSaveData(),
        }));
    currentSave.boats = runtime.world.entities
        .filter(entity => entity.isBoat)
        .map(entity => ({
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            surfaceY: entity.surfaceY,
            dimension: entity.dimension,
        }));
    currentSave.golems = runtime.world.entities
        .filter(entity =>
            ["IronGolem", "SnowGolem"].includes(entity.entityTypeName) &&
            entity.health > 0,
        )
        .map(entity => ({
            type: entity.entityTypeName,
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            health: entity.health,
            dimension: entity.dimension,
        }));
    currentSave.wardens = runtime.world.entities
        .filter(entity => entity.name === "Warden" && entity.health > 0)
        .map(entity => ({
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            health: entity.health,
            dimension: entity.dimension,
        }));
    currentSave.catfish = runtime.world.entities
        .filter(entity => entity.isCatfish && entity.health > 0)
        .map(entity => entity.createSaveData());
    currentSave.centipedes = runtime.world.entities
        .filter(entity => entity.isCentipede && entity.health > 0)
        .map(entity => entity.createSaveData());
    currentSave.minions = runtime.world.entities
        .filter(entity => entity.isMinion &&
            entity.ownerUUID === runtime.world.player?.UUID && entity.health > 0)
        .map(entity => entity.createSaveData());
    currentSave.minecarts = runtime.world.entities
        .filter(entity => entity.name === "Minecart")
        .map(entity => ({
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            variant: entity.variant,
            dimension: entity.dimension,
        }));
    currentSave.creeperCompanions = runtime.world.entities
        .filter(entity => entity.isCreeperEgg ||
            (entity.entityTypeName === "CreeperMinion" && entity.tamed && entity.health > 0))
        .map(entity => ({
            type: entity.entityTypeName,
            UUID: entity.UUID,
            position: { x: entity.position.x, y: entity.position.y },
            dimension: entity.dimension,
            ownerUUID: entity.ownerUUID,
            carriedByUUID: entity.carriedByUUID,
            sitting: entity.sitting,
            powered: entity.powered,
            hatchAge: entity.hatchAge,
            health: entity.health,
        }));

    // Determine world name and id before serializing so the name is included in the save
    let worldName = runtime.world.name || "New World";
    let id = Date.now();

    let worlds = localStorage.getItem("worlds");
    let selectedWorldRaw = localStorage.getItem("selectedWorld");
    let selectedWorld = null;

    if (selectedWorldRaw) {
        try {
            selectedWorld = JSON.parse(selectedWorldRaw);
            if (selectedWorld && selectedWorld.name)
                worldName = selectedWorld.name;
            if (selectedWorld && selectedWorld.id) id = selectedWorld.id;
        } catch (e) {
            selectedWorld = null;
        }
    }

    // If there's no previously selected world, prompt for a name (even when exporting to file)
    if (!selectedWorld) {
        const prompted = prompt("Enter world name: ", worldName);
        if (prompted !== null && prompted !== "") worldName = prompted;
    }

    // Store name into the save object
    currentSave.name = worldName;

    const saveData = JSON.stringify(currentSave);

    // If exporting to file, include the name inside saveData and download
    if (toFile) {
        downloadWorldSave(saveData, worldName ? worldName : "world");
        return;
    }

    const worldData = {
        id: id,
        name: worldName,
        lastPlayed: new Date().toISOString(),
    };

    if (worlds) {
        worlds = JSON.parse(worlds);
        if (worlds.find((w) => w.id === id)) {
            worlds = worlds.filter((w) => w.id !== id);
        }
        worlds.push(worldData);
    } else {
        worlds = [worldData];
    }

    try {
        localStorage.setItem(id, saveData);
        localStorage.setItem("worlds", JSON.stringify(worlds));
    } catch (error) {
        console.error("Failed to save world: ", error);
        runtime.game.chat.message(
            "Failed to save world! Your browser may be out of storage space.",
            "",
            Colors.Red,
        );
        return;
    }

    if (message)
        runtime.game.chat.message("World saved successfully!", "", Colors.Green);
}

export function saveChunk(chunk) {
    let blocks = [];
    let walls = [];

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
        blocks[y] = [];
        walls[y] = [];
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            const block = chunk.blocks[y][x];
            const wall = chunk.walls[y][x];

            // Keep block metadata and multi-block links together in saved cells.
            const blockState = { t: block.blockType };
            if (block.metaData) blockState.m = block.metaData;
            if (block.linkedBlocks?.length > 1) blockState.l = block.linkedBlocks;
            blocks[y][x] = Object.keys(blockState).length > 1
                ? blockState
                : block.blockType;

            const wallState = { t: wall.blockType };
            if (wall.metaData) wallState.m = wall.metaData;
            if (wall.linkedBlocks?.length > 1) wallState.l = wall.linkedBlocks;
            walls[y][x] = Object.keys(wallState).length > 1
                ? wallState
                : wall.blockType;
        }
    }

    return {
        blocks,
        walls,
    };
}

export function loadWorldFromLocalStorage() {
    let selectedWorld = localStorage.getItem("selectedWorld");

    if (selectedWorld) {
        console.log("Loading world from local storage");
        selectedWorld = JSON.parse(selectedWorld);
    } else {
        selectedWorld = {
            id: Date.now(),
            name: "New World",
            seed: Math.floor(Math.random() * 100000000),
            gameMode: 0,
            difficulty: "easy",
        };
        localStorage.setItem("selectedWorld", JSON.stringify(selectedWorld));
    }

    if (selectedWorld.difficulty && runtime.world) {
        runtime.world.setDifficulty(selectedWorld.difficulty);
    }

    const selectedWorldData = localStorage.getItem(selectedWorld.id);

    if (!selectedWorldData) {
        console.log("World not found in local storage", selectedWorld);
        runtime.game.chat.welcomeMessage();
        if (selectedWorld.seed)
            runtime.world.generator.loadCustomSeed(selectedWorld.seed);
        if (SPAWN_PLAYER) {
            setTimeout(() => {
                runtime.world.spawnPlayer();
                runtime.world.player.setGamemode(selectedWorld.gameMode);
                setTimeout(() => {
                    saveWorld(false);
                }, 1500);
            }, 100);
        }
        return;
    }

    loadWorld(selectedWorldData);
}

export async function loadWorld(save) {
    if (!runtime.isTexturePackLoaded) {
        await runtime.game.waitForTexturePack();
    }

    try {
        currentSave = JSON.parse(save);
    } catch (error) {
        console.error("Failed to load world: ", error);
        return;
    }

    runtime.world.name = currentSave.name || "New World";

    runtime.world.generator.loadingWorld = true;

    runtime.world.generator.loadCustomSeed(currentSave.seed);

    // Clear chunks and pendingBlocks for all dimensions
    dimensions.forEach((dimension) => {
        dimension.chunks = new Map();
        dimension.pendingBlocks = new Map(); // Initialize per-dimension pendingBlocks
    });

    runtime.world.entities = [];

    // Load chunks and pendingBlocks for each dimension
    if (currentSave.dimensions) {
        currentSave.dimensions.forEach((dimData) => {
            const dimension = getDimension(dimData.index);
            console.log("Loading dimension:", dimData);

            // Load chunks
            dimData.chunks.forEach((chunk) => {
                loadChunk(
                    chunk.x,
                    chunk,
                    dimData.index,
                    dimension.pendingBlocks,
                );
            });

            // Load dimension-specific pendingBlocks
            if (dimData.pendingBlocks && dimData.pendingBlocks.length > 0) {
                dimData.pendingBlocks.forEach(
                    ({ chunkX, dimensionIndex, blocks }) => {
                        dimension.pendingBlocks.set(chunkX, {
                            dimensionIndex,
                            blocks,
                        });
                        console.log(
                            `Loaded pendingBlocks for chunkX: ${chunkX} in dimension ${dimensionIndex}`,
                        );
                    },
                );
            }
        });
    } else {
        // Fallback for older saves with global pendingBlocks
        const dimension = getDimension(Dimensions.Overworld);
        currentSave.chunks.forEach((chunk) => {
            loadChunk(
                chunk.x,
                chunk,
                Dimensions.Overworld,
                dimension.pendingBlocks,
            );
        });

        if (currentSave.pendingBlocks && currentSave.pendingBlocks.length > 0) {
            currentSave.pendingBlocks.forEach(
                ({ chunkX, dimensionIndex, blocks }) => {
                    const targetDimension = getDimension(
                        dimensionIndex || Dimensions.Overworld,
                    );
                    targetDimension.pendingBlocks.set(chunkX, {
                        dimensionIndex,
                        blocks,
                    });
                    console.log(
                        `Loaded legacy pendingBlocks for chunkX: ${chunkX} in dimension ${
                            dimensionIndex || Dimensions.Overworld
                        }`,
                    );
                },
            );
        }
    }

    const savedVillagers = Array.isArray(currentSave.villagers)
        ? currentSave.villagers : [];
    for (const saved of savedVillagers) {
        if (!saved || !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            !Number.isFinite(saved.health) || saved.health <= 0 ||
            typeof saved.UUID !== "string") continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) {
            continue;
        }
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const villager = runtime.world.summonEntity(
            Villager,
            new Vector2(saved.position.x, saved.position.y),
            {
                health: Math.min(saved.health, 20),
                myChunkX: chunkX,
                homeX: Number.isFinite(saved.homeX)
                    ? saved.homeX : saved.position.x,
            },
            false,
            saved.UUID,
        );
        villager.dimension = dimensionIndex;
        villager.loadStatusEffectSaveData(saved.statusEffects);
        chunk.entities.push(villager);
    }

    const savedGolems = Array.isArray(currentSave.golems)
        ? currentSave.golems : [];
    const golemTypes = { IronGolem, SnowGolem };
    for (const saved of savedGolems) {
        const golemType = golemTypes[saved?.type];
        if (!golemType || typeof saved.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            !Number.isFinite(saved.health) || saved.health <= 0) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) {
            continue;
        }
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const maxHealth = saved.type === "IronGolem" ? 100 : 4;
        const golem = runtime.world.summonEntity(
            golemType,
            new Vector2(saved.position.x, saved.position.y),
            {
                health: Math.min(saved.health, maxHealth),
                myChunkX: chunkX,
            },
            false,
            saved.UUID,
        );
        golem.dimension = dimensionIndex;
        chunk.entities.push(golem);
    }

    for (const saved of Array.isArray(currentSave.creeperCompanions)
        ? currentSave.creeperCompanions : []) {
        const Companion = saved?.type === "CreeperMinionEgg"
            ? CreeperMinionEgg : saved?.type === "CreeperMinion" ? CreeperMinion : null;
        if (!Companion || typeof saved.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            (saved.hatchAge !== undefined && !Number.isFinite(saved.hatchAge)) ||
            (Companion === CreeperMinion &&
                (!Number.isFinite(saved.health) || saved.health <= 0))) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) continue;
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const companion = runtime.world.summonEntity(Companion,
            new Vector2(saved.position.x, saved.position.y), {
                ownerUUID: typeof saved.ownerUUID === "string" ? saved.ownerUUID : null,
                carriedByUUID: typeof saved.carriedByUUID === "string"
                    ? saved.carriedByUUID : null,
                sitting: saved.sitting === true,
                powered: saved.powered === true,
                hatchAge: Math.max(0, saved.hatchAge || 0),
                health: Companion === CreeperMinion ? Math.min(saved.health, 8) : undefined,
                tamed: Companion === CreeperMinion,
                myChunkX: chunkX,
            }, false, saved.UUID);
        companion.dimension = dimensionIndex;
        chunk.entities.push(companion);
    }

    const savedWardens = Array.isArray(currentSave.wardens)
        ? currentSave.wardens : [];
    for (const saved of savedWardens) {
        if (typeof saved?.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            !Number.isFinite(saved.health) || saved.health <= 0) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) {
            continue;
        }
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const warden = runtime.world.summonEntity(
            Warden,
            new Vector2(saved.position.x, saved.position.y),
            {
                health: Math.min(saved.health, 250),
                myChunkX: chunkX,
            },
            false,
            saved.UUID,
        );
        warden.dimension = dimensionIndex;
        chunk.entities.push(warden);
    }

    const savedCatfish = Array.isArray(currentSave.catfish)
        ? currentSave.catfish : [];
    for (const saved of savedCatfish) {
        if (!saved || typeof saved.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            !Number.isFinite(saved.health) || saved.health <= 0) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) continue;
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const catfishSize = Number.isInteger(saved.catfishSize)
            ? Math.max(0, Math.min(2, saved.catfishSize)) : 0;
        const catfish = runtime.world.summonEntity(
            Catfish,
            new Vector2(saved.position.x, saved.position.y),
            {
                catfishSize,
                health: Math.min(saved.health, 10 + catfishSize * 10),
                fromBucket: saved.fromBucket === true,
                stomachItems: Array.isArray(saved.stomachItems)
                    ? saved.stomachItems : [],
                swallowedEntity: saved.swallowedEntity ?? null,
                spitTime: Number.isFinite(saved.spitTime)
                    ? Math.max(0, Math.min(10, saved.spitTime)) : 0,
                eatCooldown: Number.isFinite(saved.eatCooldown)
                    ? Math.max(0, Math.min(120, saved.eatCooldown)) : 0,
                myChunkX: chunkX,
            },
            false,
            saved.UUID,
        );
        catfish.dimension = dimensionIndex;
        if (!chunk.entities.includes(catfish)) chunk.entities.push(catfish);
    }

    const savedCentipedes = Array.isArray(currentSave.centipedes)
        ? currentSave.centipedes : [];
    for (const saved of savedCentipedes) {
        if (!saved || typeof saved.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y) ||
            !Number.isFinite(saved.health) || saved.health <= 0) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) continue;
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        const chunk = getDimension(dimensionIndex).chunks.get(chunkX);
        if (!chunk) continue;
        const centipede = runtime.world.summonEntity(
            Centipede,
            new Vector2(saved.position.x, saved.position.y),
            {
                health: Math.min(saved.health, 35),
                segmentCount: Number.isFinite(saved.segmentCount)
                    ? Math.max(5, Math.min(8, Math.floor(saved.segmentCount))) : 5,
                segmentTrail: saved.segmentTrail,
                myChunkX: chunkX,
            },
            false,
            saved.UUID,
        );
        centipede.dimension = dimensionIndex;
        if (!chunk.entities.includes(centipede)) chunk.entities.push(centipede);
    }

    const savedMinecarts = Array.isArray(currentSave.minecarts)
        ? currentSave.minecarts : [];
    for (const saved of savedMinecarts) {
        if (typeof saved?.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y)) continue;
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) {
            continue;
        }
        const chunkX = Math.floor(saved.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        if (!getDimension(dimensionIndex).chunks.has(chunkX)) continue;
        const minecart = runtime.world.summonEntity(
            Minecart,
            new Vector2(saved.position.x, saved.position.y),
            { variant: saved.variant === "chest" ? "chest" : "normal" },
            false,
            saved.UUID,
        );
        minecart.dimension = dimensionIndex;
    }

    const savedBoats = Array.isArray(currentSave.boats) ? currentSave.boats : [];
    for (const saved of savedBoats) {
        if (
            !saved ||
            typeof saved.UUID !== "string" ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y)
        ) {
            continue;
        }
        const dimensionIndex = saved.dimension ?? Dimensions.Overworld;
        if (!Number.isInteger(dimensionIndex) || !dimensions[dimensionIndex]) {
            continue;
        }
        const boat = runtime.world.summonEntity(
            Boat,
            new Vector2(saved.position.x, saved.position.y),
            {
                surfaceY: Number.isFinite(saved.surfaceY)
                    ? saved.surfaceY
                    : saved.position.y + BLOCK_SIZE * 0.25,
                dimension: dimensionIndex,
            },
            false,
            saved.UUID,
        );
        boat.dimension = dimensionIndex;
    }

    runtime.time = currentSave.time;

    if (currentSave.gameRules) {
        runtime.GAMERULES = currentSave.gameRules;
    }

    if (currentSave.difficulty) {
        runtime.world.setDifficulty(currentSave.difficulty);
    }

    if (SPAWN_PLAYER) {
        runtime.world.removeEntity(runtime.world.player);
        runtime.world.player = null;

        setTimeout(() => {
            const position = JSON.parse(currentSave.playerPosition);
            runtime.world.spawnPlayer(new Vector2(position.x, position.y), false);

            const playerInventory = JSON.parse(currentSave.inventoryItems);
            for (let i = 0; i < playerInventory.length; i++) {
                for (let j = 0; j < playerInventory[i].length; j++) {
                    runtime.world.player.inventory.items[i][j].item = new InventoryItem(
                        {
                            blockId: playerInventory[i][j].blockId,
                            itemId: playerInventory[i][j].itemId,
                            count: playerInventory[i][j].count,
                            props: playerInventory[i][j].props,
                        },
                    );
                }
            }

            if (currentSave.currentSlot !== undefined)
                runtime.hotbar.currentSlot = currentSave.currentSlot;

            runtime.world.player.setGamemode(currentSave.gamemode);
            runtime.world.player.loadStatusEffectSaveData(currentSave.playerStatusEffects);

            if (Number.isFinite(currentSave.xpLevel)) {
                runtime.world.player.xpLevel = Math.max(0,
                    Math.min(9999, Math.floor(currentSave.xpLevel)));
            }
            const savedMinionProgress = currentSave.minionProgress;
            if (savedMinionProgress && typeof savedMinionProgress === "object") {
                runtime.world.player.minionProgress = {
                    evilDeeds: Number.isFinite(savedMinionProgress.evilDeeds)
                        ? Math.max(0, Math.min(4, Math.floor(savedMinionProgress.evilDeeds)))
                        : 0,
                    unlocked: savedMinionProgress.unlocked === true,
                };
            }
            if (currentSave.health !== undefined)
                runtime.world.player.health = currentSave.health;

            if (currentSave.foodLevel !== undefined)
                runtime.world.player.foodLevel = currentSave.foodLevel;

            if (currentSave.foodSaturationLevel !== undefined)
                runtime.world.player.foodSaturationLevel =
                    currentSave.foodSaturationLevel;

            if (currentSave.foodExhaustionLevel !== undefined)
                runtime.world.player.foodExhaustionLevel =
                    currentSave.foodExhaustionLevel;

            if (currentSave.foodTickTimer !== undefined)
                runtime.world.player.foodTickTimer = currentSave.foodTickTimer;

            runtime.world.player.clampFoodStats();

            if (currentSave.flying) runtime.world.player.abilities.flying = true;

            if (currentSave.spawnPoint) {
                const spawnPoint = JSON.parse(currentSave.spawnPoint);
                if (spawnPoint)
                    runtime.world.player.spawnPoint = new Vector2(
                        spawnPoint.x,
                        spawnPoint.y,
                    );
            }

            if (currentSave.activeDimension !== undefined)
                gotoDimension(currentSave.activeDimension);


            for (const saved of Array.isArray(currentSave.minions)
                ? currentSave.minions : []) {
                const data = normalizeMinionSaveData(saved, runtime.world.player.UUID);
                if (!data || runtime.world.getEntityByUUID(data.UUID)) continue;
                const chunkX = Math.floor(data.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
                    CHUNK_WIDTH * BLOCK_SIZE;
                const chunk = getDimension(data.dimension).chunks.get(chunkX);
                if (!chunk) continue;
                const minion = runtime.world.summonEntity(Minion, data.position, {
                    ownerUUID: data.ownerUUID,
                    health: data.health,
                    dimension: data.dimension,
                    direction: data.direction,
                    job: data.job,
                    inventory: data.inventory,
                    deliveryDestination: data.deliveryDestination,
                    carriedEntityUUID: data.carriedEntityUUID,
                    deliveryActive: data.deliveryActive,
                    myChunkX: chunkX,
                }, false, data.UUID);
                minion.dimension = data.dimension;
                minion.myChunkX = chunkX;
                if (!chunk.entities.includes(minion)) chunk.entities.push(minion);
            }
            const savedBoat = currentSave.playerBoatUUID
                ? runtime.world.getEntityByUUID(currentSave.playerBoatUUID)
                : null;
            if (savedBoat?.isBoat) savedBoat.mount(runtime.world.player);

            saveWorld(false);
        }, 100);
    }

    setTimeout(() => {
        runtime.world.generator.loadingWorld = false;
    }, 500);
}

export function loadChunk(
    x,
    chunk,
    dimensionIndex = Dimensions.Overworld,
    pendingBlocks,
) {
    console.log("Loading chunk:", x, chunk, dimensionIndex);

    const dimension = getDimension(dimensionIndex);
    const previousChunk = chunk.previousChunk
        ? dimension.chunks.get(chunk.previousChunk)
        : null;

    // Server chunks only contain blocks and walls. Their biome comes from the
    // shared seed, while local saves include the biome name.
    const biome = chunk.biome == null
        ? runtime.world.generator.calculateChunkBiome(
            x / (CHUNK_WIDTH * BLOCK_SIZE), dimensionIndex)
        : resolveBiome(dimension.biomeSet, chunk.biome);
    if (!biome) {
        throw new Error(`Unknown biome in dimension ${dimensionIndex}: ${chunk.biome?.name ?? chunk.biome}`);
    }

    const constructedChunk = new Chunk(
        runtime.world,
        x,
        CHUNK_WIDTH,
        biome,
        previousChunk,
        true,
        dimensionIndex,
    );

    constructedChunk.generateArray();

    constructedChunk.dimension = dimensionIndex;

    for (let by = 0; by < CHUNK_HEIGHT; by++) {
        for (let bx = 0; bx < CHUNK_WIDTH; bx++) {
            constructedChunk.blocks[by][bx].dimensionIndex = dimensionIndex;
            constructedChunk.walls[by][bx].dimensionIndex = dimensionIndex;
        }
    }

    // First pass: Set block types without handling extended blocks
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            // Blocks
            const blockData = chunk.blocks[y][x];
            const blockType = blockData.t ? blockData.t : blockData;
            const metaData = blockData.m ? blockData.m : null;

            constructedChunk.setBlockTypeLocal(
                x,
                y,
                blockType,
                false,
                metaData,
                false, // Skip updateBlocks to do it in a second pass
                false,
            );

            // Walls
            const wallData = chunk.walls[y][x];
            const wallType = wallData.t ? wallData.t : wallData;
            const wallMetaData = wallData.m
                ? typeof wallData.m === "string"
                    ? JSON.parse(wallData.m)
                    : wallData.m
                : null;

            constructedChunk.setBlockTypeLocal(
                x,
                y,
                wallType,
                true,
                wallMetaData,
                false,
                false,
            );
        }
    }

    // Second pass: Restore linkedBlocks
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            // Blocks
            const blockData = chunk.blocks[y][x];
            const block = constructedChunk.blocks[y][x];
            if (blockData.l) {
                block.linkedBlocks = blockData.l;
            }

            // Walls
            const wallData = chunk.walls[y][x];
            const wall = constructedChunk.walls[y][x];
            if (wallData.l) {
                wall.linkedBlocks = typeof wallData.l === "string"
                    ? JSON.parse(wallData.l)
                    : wallData.l;
            }
        }
    }

    // After loading, ensure all fluid blocks have correct cutoff
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x2 = 0; x2 < CHUNK_WIDTH; x2++) {
            const block = constructedChunk.blocks[y][x2];
            const blockDef = getBlock(block.blockType);
            if (
                blockDef.fluid &&
                block.metaData &&
                typeof block.metaData.waterLevel === "number"
            ) {
                block.cutoff = block.metaData.waterLevel;
            }
        }
    }
    dimension.chunks.set(x, constructedChunk);
}
