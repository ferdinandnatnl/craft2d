import { savedWorldgenVersion } from "@2dcraft.com/shared/overworldGeneration.js";
import { itemMap } from "@2dcraft.com/shared/items.js";
import { runtime } from "../utils/runtime.js";
import { Drop } from "../entities/drop.js";
import { Entities } from "../entities/entities.js";
import { InventoryItem } from "../game/inventoryItem.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, multiplayer } from "../utils/globals.js";
import { getDimensionChunks, gotoDimension } from "../world/dimension.js";
import { loadChunk } from "../world/saving.js";
import { Minion, normalizeMinionSaveData } from "../entities/mobs/minion.js";
import { EntityTypes } from "../game/entity.js";
import { applyWorldSnapshot } from "./worldSync.js";

// This object will store callbacks keyed by requestId
export const callbacks = {};
export const pendingPlayerDataFromFile = new Map();

export function applyInventoryFromSave(targetPlayer, inventoryData) {
    if (!targetPlayer?.inventory?.items) return;
    if (!Array.isArray(inventoryData)) return;

    for (let y = 0; y < targetPlayer.inventory.items.length; y++) {
        const row = targetPlayer.inventory.items[y];
        const savedRow = Array.isArray(inventoryData[y])
            ? inventoryData[y]
            : [];

        for (let x = 0; x < row.length; x++) {
            const slot = row[x];
            const savedItem = savedRow[x] || {};

            const item = new InventoryItem({
                blockId: savedItem.blockId || null,
                itemId: savedItem.itemId || null,
                count:
                    typeof savedItem.count === "number" ? savedItem.count : 0,
                props:
                    savedItem.props && typeof savedItem.props === "object"
                        ? savedItem.props
                        : {},
            });

            if (slot && typeof slot === "object" && "item" in slot) {
                slot.item = item;
            }
        }
    }

    if (
        typeof targetPlayer.inventory.serializeInventoryForMultiplayer ===
        "function"
    ) {
        targetPlayer.inventory.lastSyncedInventoryPayload = JSON.stringify(
            targetPlayer.inventory.serializeInventoryForMultiplayer(),
        );
    }
}

export function applyPlayerDataFromFile(message) {
    const playerFromFile = runtime.world.getEntityByUUID(message.UUID);
    if (!playerFromFile) {
        return false;
    }

    playerFromFile.setGamemode(
        typeof message.gamemode === "number" &&
            message.gamemode <= 3 &&
            message.gamemode >= 0
            ? message.gamemode
            : 0,
    );

    playerFromFile.dimension =
        typeof message.dimension === "number" ? message.dimension : 0;

    playerFromFile.position = new Vector2(
        typeof message.position?.x === "number" ? message.position.x : 0,
        typeof message.position?.y === "number" ? message.position.y : 0,
    );

    playerFromFile.health =
        typeof message.health === "number" ? message.health : 20;
    playerFromFile.foodLevel =
        typeof message.food === "number" ? message.food : 20;
    playerFromFile.food = typeof message.food === "number" ? message.food : 20;
    playerFromFile.xpLevel = Number.isFinite(message.xpLevel)
        ? Math.max(0, Math.min(9999, Math.floor(message.xpLevel)))
        : 0;
    if (message.minionProgress && typeof message.minionProgress === "object") {
        playerFromFile.minionProgress = {
            evilDeeds: Number.isFinite(message.minionProgress.evilDeeds)
                ? Math.max(0, Math.min(4, Math.floor(message.minionProgress.evilDeeds)))
                : 0,
            unlocked: message.minionProgress.unlocked === true,
        };
    }

    applyInventoryFromSave(playerFromFile, message.inventory);

    gotoDimension(
        typeof message.dimension === "number" ? message.dimension : 0,
    );
    restoreMinionsForOwner(playerFromFile, message.minions);

    return true;
}

export async function restoreMinionsForOwner(owner, savedMinions) {
    if (!owner || !Array.isArray(savedMinions)) return;
    for (const saved of savedMinions.slice(0, 4)) {
        const data = normalizeMinionSaveData(saved, owner.UUID);
        if (!data) continue;
        if (runtime.world.getEntityByUUID(data.UUID)) continue;
        const chunkX = Math.floor(data.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        let chunk = getDimensionChunks(data.dimension)?.get(chunkX);
        if (!chunk && runtime.world.getChunkFromServer) {
            const chunkData = await runtime.world.getChunkFromServer(chunkX, data.dimension);
            if (chunkData) {
                await loadChunk(chunkX, chunkData, data.dimension);
                chunk = getDimensionChunks(data.dimension)?.get(chunkX);
            }
        }
        if (!chunk) continue;
        const props = {
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
        };
        const localOwner = owner === runtime.world.player;
        const minion = runtime.world.summonEntity(
            Minion,
            data.position,
            props,
            false,
            data.UUID,
        );
        minion.dimension = data.dimension;
        minion.myChunkX = chunkX;
        if (!chunk.entities.includes(minion)) chunk.entities.push(minion);
        if (multiplayer && localOwner) {
            runtime.server.send({
                type: "summonEntity",
                sender: owner.UUID,
                message: {
                    entity: "Minion",
                    UUID: minion.UUID,
                    position: minion.position,
                    props: {
                        ownerUUID: owner.UUID,
                        myChunkX: chunkX,
                        dimension: data.dimension,
                        direction: data.direction,
                    },
                },
            });
            minion.broadcastState();
        }
    }
}

export function processMessage(data) {
    const message = data.message;
    const type = data.type;

    switch (type) {
        case "serverFull":
            alert("Server is full. Please try again later.");
            break;

        case "youJoined":
            console.log(data);
            iJoined(message.player, message.existingPlayers, message.gamemode);
            break;
        case "playerJoined":
            console.log(data);
            const newPlayer = runtime.world.spawnPlayer(
                new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE),
                false,
                message.player.UUID,
                message.player.name,
                false,
            );
            newPlayer.setGamemode(message.player.gamemode ?? 0);
            newPlayer.setSkin(
                message.player.skin || "player/steve",
                message.player.model,
            );
            restoreMinionsForOwner(newPlayer, message.player.minions);
            break;
        case "playerLeft":
            runtime.world.removeEntity(runtime.world.getEntityByUUID(message));
            break;

        case "chat":
            runtime.game.chat.message(message, data.sender);
            break;
        case "playerUpdate":
            updatePlayerState(data);
            break;
        case "entityRPC":
            handleEntityRPC(data);
            break;
        case "uploadChunk":
            console.log("Received chunk:", message);
            loadChunk(message.x, message.chunk,
                typeof message.dimensionIndex === "number"
                    ? message.dimensionIndex : 0);
            break;
        case "worldgenVersion":
            runtime.world.worldgenVersion = savedWorldgenVersion(message);
            runtime.world.generator.worldgenVersion = runtime.world.worldgenVersion;
            break;
        case "seed":
            console.log("Received seed:", message);
            runtime.world.generator.loadCustomSeed(message);
            runtime.world.generator.multiplayerSeedLoaded = true;
            break;
        case "weatherState":
            runtime.world?.weather?.loadState(message, runtime.world.seed);
            break;
        case "worldAuthority":
            runtime.world?.setMultiplayerAuthority(message?.UUID);
            break;
        case "worldTime":
            if (Number.isFinite(message?.time)) {
                runtime.time = Math.max(0, Math.min(8, message.time));
            }
            break;
        case "worldSnapshot":
            if (data.sender === runtime.world?.multiplayerAuthorityUUID) {
                applyWorldSnapshot(message);
            }
            break;
        case "playerHit": {
            const player = runtime.world?.player;
            const attacker =
                runtime.world?.getEntityByUUID(message?.sourceMobUUID) ||
                runtime.world?.getEntityByUUID(data.sender);
            if (
                player && message?.targetUUID === player.UUID && attacker &&
                attacker.UUID !== player.UUID && Number.isFinite(message.damage) &&
                Number.isFinite(message.hitfromX) && Number.isFinite(message.knockback) &&
                attacker.dimension === player.dimension
            ) {
                player.hit(
                    message.damage,
                    message.hitfromX,
                    message.knockback,
                    typeof message.cause === "string" ? message.cause : null,
                    attacker,
                );
            }
            break;
        }
        case "mobHit": {
            const world = runtime.world;
            const mob = world?.getEntityByUUID(message?.targetUUID);
            const attacker = world?.getEntityByUUID(data.sender);
            const weaponItem = Number.isInteger(message?.weaponItemId)
                ? itemMap.get(message.weaponItemId)
                : null;
            const spearHit = weaponItem?.projectile === "SpearProjectile";
            const maxRange = spearHit
                ? weaponItem.projectileRange * BLOCK_SIZE
                : 5 * BLOCK_SIZE;
            if (
                !world?.isWorldAuthority || !mob || mob.type !== EntityTypes.Mob ||
                mob.isMinion || mob.health <= 0 || !attacker ||
                attacker.type !== EntityTypes.Player || attacker.dimension !== mob.dimension ||
                !Number.isFinite(message.damage) || message.damage <= 0 ||
                (message.weaponItemId != null && !spearHit) ||
                (spearHit && message.damage !== weaponItem.projectileDamage) ||
                !Number.isFinite(message.hitfromX) || !Number.isFinite(message.knockback)
            ) break;
            const distance = Math.hypot(
                attacker.position.x + attacker.hitbox.x / 2 -
                    (mob.position.x + mob.hitbox.x / 2),
                attacker.position.y + attacker.hitbox.y / 2 -
                    (mob.position.y + mob.hitbox.y / 2),
            );
            if (distance > maxRange) break;

            const previousHealth = mob.health;
            mob.hit(message.damage, message.hitfromX, message.knockback, "Player attack", attacker);
            runtime.server?.send({
                type: "mobHitResult",
                sender: runtime.world.player?.UUID,
                message: {
                    attackerUUID: data.sender,
                    targetUUID: mob.UUID,
                    killed: previousHealth > 0 && mob.health <= 0,
                },
            });
            break;
        }
        case "mobHitResult":
            if (
                message?.attackerUUID === runtime.world?.player?.UUID &&
                message.killed === true
            ) {
                runtime.world.player.gainExperienceLevel(1);
            }
            break;
        case "removeEntity":
            console.log("Removing entity:", message);
            const entity = runtime.world.getEntityByUUID(message.UUID);
            if (entity) {
                runtime.world.removeEntity(entity);
            }
            break;
        case "summonEntity":
            console.log("Summoning entity:", message);
            const entityType = Entities[message.entity];
            if (!entityType || runtime.world.getEntityByUUID(message.UUID)) break;
            const summonedEntity = runtime.world.summonEntity(
                entityType,
                message.position,
                message.props,
                false,
                message.UUID,
            );
            if (Number.isInteger(message.props?.dimension)) {
                summonedEntity.dimension = message.props.dimension;
            }
            if (summonedEntity.myChunkX !== null) {
                const chunk = runtime.world
                    .getDimensionChunks(summonedEntity.dimension)
                    .get(summonedEntity.myChunkX);
                if (chunk && !chunk.entities.includes(summonedEntity)) {
                    chunk.entities.push(summonedEntity);
                }
            }
            return;

        case "response":
            if (callbacks[data.message.requestId]) {
                callbacks[data.message.requestId](message); // Call the stored callback
                delete callbacks[data.message.requestId]; // Remove callback once executed
            }
            break;
        case "playerData":
            console.log("Received player data:", message);
            const player = runtime.world.getEntityByUUID(message.UUID);
            if (player) {
                player.setSkin(message.skin, message.model);
                player.name = message.name;
            }
            break;

        case "playerDataFromFile":
            console.log("Received player data from file:", message);

            if (!applyPlayerDataFromFile(message)) {
                pendingPlayerDataFromFile.set(message.UUID, message);
            }

            break;

        case "placeBlock": {
            if (
                !getDimensionChunks(message.dimensionIndex)?.has(message.chunkX)
            ) {
                console.log(
                    "Chunk not loaded:",
                    message.chunkX,
                    message.dimensionIndex,
                );
                return;
            }

            const placementMetaData = message.isWall === true
                ? { placedWallpaper: true }
                : null;
            getDimensionChunks(message.dimensionIndex)
                .get(message.chunkX)
                .setBlockTypeLocal(
                    message.x,
                    message.y,
                    message.blockType,
                    message.isWall,
                    placementMetaData,
                    true,
                );
            break;
        }
        case "breakBlock":
            if (
                !getDimensionChunks(message.dimensionIndex)?.has(message.chunkX)
            ) {
                console.log(
                    "Chunk not loaded:",
                    message.chunkX,
                    message.dimensionIndex,
                );
                return;
            }

            // get the block at the given coordinates
            const block = getDimensionChunks(message.dimensionIndex)
                .get(message.chunkX)
                .getBlockLocal(message.x, message.y, message.isWall);

            if (!block) console.log("Block not found:", message.x, message.y);

            block.breakBlock(message.shouldDrop, message.isWall, true);
            break;
        case "minionState": {
            const minion = runtime.world.getEntityByUUID(message?.UUID);
            if (!minion?.isMinion || minion.ownerUUID !== data.sender ||
                !Number.isFinite(message.position?.x) ||
                !Number.isFinite(message.position?.y) ||
                !Number.isInteger(message.dimension) ||
                (typeof message.carriedEntityUUID === "string" &&
                    message.carriedEntityUUID.length > 64)) break;
            minion.position = new Vector2(message.position.x, message.position.y);
            minion.direction = message.direction < 0 ? -1 : 1;
            minion.state = message.state;
            minion.dimension = message.dimension;
            for (const entity of runtime.world.entities) {
                if (entity.carriedByMinionUUID === minion.UUID &&
                    entity.UUID !== message.carriedEntityUUID) {
                    entity.carriedByMinionUUID = null;
                }
            }
            minion.carriedEntityUUID = typeof message.carriedEntityUUID === "string"
                ? message.carriedEntityUUID
                : null;
            const carriedEntity = minion.carriedEntityUUID
                ? runtime.world.getEntityByUUID(minion.carriedEntityUUID)
                : null;
            if (carriedEntity && carriedEntity !== minion &&
                carriedEntity.dimension === minion.dimension) {
                carriedEntity.carriedByMinionUUID = minion.UUID;
            }
            break;
        }
        case "playerDimension":
            const otherPlayer = runtime.world.getEntityByUUID(message.player);
            if (otherPlayer) otherPlayer.dimension = message.dimension;
            break;

        case "syncMetaData":
            const chunk = getDimensionChunks(message.dimensionIndex)?.get(
                message.chunkX,
            );

            if (!chunk) break;

            const blockToChange = chunk.getBlockLocal(message.x, message.y);

            if (!blockToChange) break;

            blockToChange.recieveSyncMetaData(message.metaData);

            break;

        case "summonDrop":
            const drop = runtime.world.summonEntity(
                Drop,
                message.position,
                message.props,
                false,
                message.UUID,
            );
            if (typeof message.dimension === "number") {
                drop.dimension = message.dimension;
            }
            break;

        default:
            console.log("Unknown message type:", type);
            break;
    }
}

// Store callback for async get request
export async function getChunk(x) {
    try {
        const chunk = await runtime.server.get({
            type: "getChunk",
            message: { x: x },
            sender: runtime.world.player.UUID,
        });

        console.log("Received chunk:", chunk);
    } catch (error) {
        console.error("Error getting chunk:", error);
    }
}

export function updatePlayerState(data) {
    const player = runtime.world.getEntityByUUID(data.sender);
    if (player) {
        player.multiplayerReceivePlayerState(data.message);
    }
}

export async function iJoined(player, existingPlayers, gamemode = 0) {
    // Wait until loadingWorld is false
    while (runtime.world.generator.loadingWorld) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const myPlayer = runtime.world.spawnPlayer(
        new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE),
        false,
        player.UUID,
        runtime.game.settings.username,
    );

    if (pendingPlayerDataFromFile.has(player.UUID)) {
        applyPlayerDataFromFile(pendingPlayerDataFromFile.get(player.UUID));
        pendingPlayerDataFromFile.delete(player.UUID);
    }

    // Set on ground AFTER save data is applied so it isn't overridden by a stale saved position
    const trySetOnGround = () => {
        if (myPlayer.getCurrentChunk()) {
            return myPlayer.setOnGround() === true;
        }
        return false;
    };
    if (!trySetOnGround()) {
        const intervalId = setInterval(() => {
            if (trySetOnGround()) clearInterval(intervalId);
        }, 100);
        setTimeout(() => clearInterval(intervalId), 10000);
    }

    myPlayer.setGamemode(gamemode);

    // Upload skin to server
    runtime.server.send({
        type: "playerData",
        sender: player.UUID,
        message: {
            UUID: player.UUID,
            skin: myPlayer.body.sprite ?? "player/steve",
            model: myPlayer.skinModel || "steve",
            name: runtime.game.settings.username,
        },
    });

    console.log("Uploaded skin to server", myPlayer.body.sprite);

    // Spawn all existing players for the new player
    if (existingPlayers && existingPlayers.length > 0) {
        existingPlayers.forEach((p) => {
            const newPlayer = runtime.world.spawnPlayer(
                new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE),
                false,
                p.UUID,
                p.name,
                false,
            );

            newPlayer.setGamemode(p.gamemode ?? 0);

            newPlayer.dimension = p.dimension;

            newPlayer.setSkin(p.skin || "player/steve", p.model);
            restoreMinionsForOwner(newPlayer, p.minions);
        });
    }
}

export function handleEntityRPC(data) {
    const entity = runtime.world?.getEntityByUUID(data.sender);
    if (entity && typeof entity[data.message.method] === "function") {
        entity[data.message.method](...data.message.args);
    } else {
        console.warn(
            `Entity ${data.UUID} does not have method ${data.message.method}`,
        );
    }
}
