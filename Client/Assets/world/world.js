import { runtime } from "../utils/runtime.js";
import { Drop } from "../entities/drop.js";
import { Player } from "../entities/player.js";
import { EntityTypes } from "../game/entity.js";
import { Hotbar } from "../game/hotbar.js";
import { Sounds, playRandomSoundFromArray, updatePositionalAudioVolumes } from "../game/sounds.js";
import { Vector2, uuidv4 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, ENTITY_UPDATE_DISTANCE, TICK_SPEED, dayNightSpeed, multiplayer, updatingBlocks } from "../utils/globals.js";
import { camera } from "../utils/renderer.js";
import { SpecialType, getBlock } from "./block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Dimensions, activeDimension, dimensions } from "./dimension.js";
import { WorldGenerator } from "./generator.js";
import { removeParticleEmitter } from "./particleEmitter.js";
import { loadChunk, saveChunk } from "./saving.js";

export class World {
    constructor() {
        this.name = "New World";
        this.seed = 0;
        this.entities = [];
        this.damageIndicators = [];
        this.particleEmitters = [];
        this.chunks_in_render_distance = new Map();
        this.player = null;
        this.blocksToUpdate = [];
        this.worldTickInterval = null;

        this.generator = new WorldGenerator(this);

        this.difficulty = "easy";

        this.startTickLoop();
    }

    addDamageIndicator(entity, amount) {
        if (!entity || !Number.isFinite(amount) || amount <= 0) return;

        this.damageIndicators.push({
            amount,
            x: entity.position.x + entity.hitbox.x / 2,
            y: entity.position.y - 8,
            dimension: entity.dimension,
            createdAt: runtime.passedTime,
        });
    }

    setDifficulty(value) {
        this.difficulty = value;
    }

    cycleDifficulty() {
        const next = this.difficulty === "peaceful" ? "easy" : "peaceful";
        this.setDifficulty(next);
        return this.difficulty;
    }

    startTickLoop() {
        if (this.worldTickInterval) return;
        this.worldTickInterval = setInterval(() => {
            this.tick();
        }, 1000 / TICK_SPEED);
    }

    tick() {
        if(runtime.world.generator.loadingWorld) return;

        this.updateBlocks();
        runtime.game.animateFrame();
        updatePositionalAudioVolumes();
        this.updateEntities(true);
        this.chunks_in_render_distance.forEach((chunk) => {
            chunk.updateChunk();
        });
        if (runtime.game.settings.lighting) {
            this.globalUpdateSkyLight();
            this.globalRecalculateLight();
        }
        this.globalRecalculateRedstone();
        this.dayNightCycle();
    }

    dayNightCycle() {
        if (runtime.time > 7.5) {
            runtime.time = 1;
        }
        if (runtime.time > 3.5 && runtime.time < 6.5) runtime.day = false;
        else runtime.day = true;
        if (!runtime.GAMERULES.doDaylightCycle) return;
        runtime.time += runtime.day ? dayNightSpeed / 2 : dayNightSpeed;
    }

    updateEntities(tick = false) {
        const cameraFarX =
            camera.getWorldX(camera.x) - ENTITY_UPDATE_DISTANCE * BLOCK_SIZE;
        const cameraNearX =
            camera.getWorldX(camera.x) + ENTITY_UPDATE_DISTANCE * BLOCK_SIZE;
        this.entities.forEach((entity) => {
            if (entity === runtime.world.player) {
                camera.update(runtime.world.player);
                if (tick) entity.tickUpdate();
                else entity.update();
                return;
            }
            if (entity.dimension !== activeDimension) return;
            if (
                entity.position.x >= cameraFarX &&
                entity.position.x <= cameraNearX
            ) {
                if (typeof entity.tickUpdate === "function" && tick)
                    entity.tickUpdate();
                else entity.update();
            }
        });
    }

    spawnPlayer(
        position = new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE),
        setOnGround = true,
        UUID = null,
        name = null,
        local = true,
    ) {
        const newPlayer = new Player(runtime.world, {
            position: position,
            entities: runtime.world.entities,
            UUID: UUID ? UUID : uuidv4(),
            name: name ? name : "Player",
        });
        if (local) {
            runtime.world.player = newPlayer;
        }
        if (setOnGround) {
            const trySetOnGround = () => {
                if (newPlayer.getCurrentChunk()) {
                    return newPlayer.setOnGround() === true;
                }
                return false;
            };
            if (!trySetOnGround()) {
                const intervalId = setInterval(() => {
                    if (trySetOnGround()) clearInterval(intervalId);
                }, 100);
                setTimeout(() => clearInterval(intervalId), 10000);
            }
        }
        runtime.world.entities.push(newPlayer);
        if (local) runtime.hotbar = new Hotbar(newPlayer.inventory);
        return newPlayer;
    }

    async startGenerator(dimensionIndex = activeDimension) {
        return this.generator.generateWorld(dimensionIndex);
    }

    async prepareEndDimension() {
        const newChunks = [];
        const chunkSize = CHUNK_WIDTH * BLOCK_SIZE;
        for (let index = -1; index <= 1; index++) {
            const x = index * chunkSize;
            if (this.getChunkForX(x, Dimensions.End)) continue;
            const serverChunk = multiplayer
                ? await this.getChunkFromServer(x, Dimensions.End)
                : null;
            if (serverChunk) {
                await loadChunk(x, serverChunk, Dimensions.End);
            } else {
                const neighbor = this.generator.getNeighborBiomeData(
                    index, 0, Dimensions.End);
                this.generator.generateChunk(index, x, neighbor, Dimensions.End);
                newChunks.push(x);
            }
        }
        return newChunks;
    }

    getDimension(index = activeDimension) {
        return dimensions[index];
    }

    getDimensionChunks(index = activeDimension) {
        return dimensions[index].chunks;
    }

    setBlockType(block, type, updateAdjacent = true) {
        const chunk = this.getDimensionChunks(activeDimension).get(
            block.chunkX,
        );
        if (!chunk) return;
        return chunk.setBlockTypeLocal(
            block.x,
            block.y,
            type,
            block.wall,
            null,
            updateAdjacent,
        );
    }

    setBlockTypeAtPosition(
        worldX,
        worldY,
        blockType,
        wall = false,
        dimensionIndex = activeDimension,
        metaData = null,
        inputIsUserBlockY = true,
        updateAdjacent = false,
    ) {
        if (inputIsUserBlockY)
            worldY = this.userBlockYToWorld(worldY / BLOCK_SIZE);

        const chunk = this.getChunkForX(worldX, dimensionIndex);
        if (!chunk) {
            this.bufferBlock(
                worldX,
                worldY,
                blockType,
                dimensionIndex,
                metaData,
                wall,
                false,
            );
            return false;
        }

        const localX = Math.floor((worldX - chunk.x) / BLOCK_SIZE);
        const localY = Math.floor(worldY / BLOCK_SIZE);

        return chunk.setBlockTypeLocal(
            localX,
            localY,
            blockType,
            wall,
            metaData,
            updateAdjacent,
        );
    }

    getBlockAtWorldPosition(
        worldX,
        worldY,
        wall = false,
        dimensionIndex = activeDimension,
    ) {
        const targetChunk = this.getChunkForX(worldX, dimensionIndex);
        if (!targetChunk || worldY >= CHUNK_HEIGHT * BLOCK_SIZE) return null;

        const localX = Math.floor((worldX - targetChunk.x) / BLOCK_SIZE);
        const localY = Math.floor(worldY / BLOCK_SIZE);

        return targetChunk.getBlockLocal(localX, localY, wall);
    }

    getChunkForX(worldX, dimensionIndex = activeDimension) {
        const dimension = dimensions[dimensionIndex];
        const chunkX =
            Math.floor(worldX / (CHUNK_WIDTH * BLOCK_SIZE)) *
            (CHUNK_WIDTH * BLOCK_SIZE);
        return dimension.chunks.get(chunkX);
    }

    getChunkXForWorldX(worldX) {
        const chunkSize = CHUNK_WIDTH * BLOCK_SIZE;
        return Math.floor(worldX / chunkSize) * chunkSize;
    }

    bufferBlock(
        worldX,
        worldY,
        blockType,
        dimensionIndex = activeDimension,
        metaData = null,
        wall = false,
        inputIsUserBlockY = true,
    ) {
        if (inputIsUserBlockY)
            worldY = this.userBlockYToWorld(worldY / BLOCK_SIZE);

        const targetChunkX = this.getChunkXForWorldX(worldX);

        if (!dimensions[dimensionIndex].pendingBlocks.has(targetChunkX)) {
            dimensions[dimensionIndex].pendingBlocks.set(targetChunkX, {
                dimensionIndex: dimensionIndex,
                blocks: [],
            });
        }
        dimensions[dimensionIndex].pendingBlocks.get(targetChunkX).blocks.push({
            x: worldX,
            y: worldY,
            blockType,
            metaData,
            wall,
        });
    }

    worldToBlocks(position) {
        const blockX = Math.floor(position.x / BLOCK_SIZE);
        const blockY = this.worldToUserBlockY(position.y);
        return new Vector2(blockX, blockY);
    }

    worldToUserBlockY(worldY) {
        return CHUNK_HEIGHT - Math.floor(worldY / BLOCK_SIZE);
    }

    userBlockYToWorld(blockY) {
        return (CHUNK_HEIGHT - blockY) * BLOCK_SIZE;
    }

    userBlocksToWorldPosition(blockX, blockY) {
        return new Vector2(blockX * BLOCK_SIZE, this.userBlockYToWorld(blockY));
    }

    getBlockAtUserBlockPosition(
        blockX,
        blockY,
        wall = false,
        dimensionIndex = activeDimension,
    ) {
        const worldPos = this.userBlocksToWorldPosition(blockX, blockY);
        return this.getBlockAtWorldPosition(
            worldPos.x,
            worldPos.y,
            wall,
            dimensionIndex,
        );
    }

    setBlockTypeAtUserBlockPosition(
        blockX,
        blockY,
        blockType,
        wall = false,
        dimensionIndex = activeDimension,
        metaData = null,
        updateAdjacent = true,
    ) {
        const worldPos = this.userBlocksToWorldPosition(blockX, blockY);
        return this.setBlockTypeAtPosition(
            worldPos.x,
            worldPos.y,
            blockType,
            wall,
            dimensionIndex,
            metaData,
            false,
            updateAdjacent,
        );
    }

    worldToLocal(x, y) {
        const chunkX = this.getChunkXForWorldX(x);
        const localX = Math.floor((x - chunkX) / BLOCK_SIZE);
        const localY = Math.floor(y / BLOCK_SIZE);
        return new Vector2(localX, localY);
    }

    getChunkByIndex(index) {
        const chunkX = index * CHUNK_WIDTH * BLOCK_SIZE;
        return this.getDimensionChunks().get(chunkX);
    }

    getBlockWorldPosition(block) {
        return new Vector2(
            block.transform.position.x,
            block.transform.position.y,
        );
    }

    checkAdjacentBlocks(position, wall = false) {
        const directions = [
            { x: 0, y: -BLOCK_SIZE },
            { x: 0, y: BLOCK_SIZE },
            { x: -BLOCK_SIZE, y: 0 },
            { x: BLOCK_SIZE, y: 0 },
        ];

        for (const dir of directions) {
            const adjacentPos = new Vector2(
                position.x + dir.x,
                position.y + dir.y,
            );
            const block = this.getBlockAtWorldPosition(
                adjacentPos.x,
                adjacentPos.y,
                wall,
            );
            if (!block) continue;

            const type = getBlock(block.blockType);
            if (block && !type.fluid && !type.air) {
                return true;
            }
        }

        return false;
    }

    async placePortalInDimension(dimension, position) {
        const range = 8;
        const chunkSize = CHUNK_WIDTH * BLOCK_SIZE;
        const minChunk = this.getChunkXForWorldX(position.x - range * BLOCK_SIZE);
        const maxChunk = this.getChunkXForWorldX(position.x + range * BLOCK_SIZE);
        const createdChunks = [];

        // Destination chunks must exist before the player moves. Otherwise the
        // frame is only buffered and the player can arrive inside solid terrain.
        for (let chunkX = minChunk; chunkX <= maxChunk; chunkX += chunkSize) {
            if (this.getChunkForX(chunkX, dimension)) continue;
            const serverChunk = multiplayer
                ? await this.getChunkFromServer(chunkX, dimension)
                : null;
            if (serverChunk) {
                await loadChunk(chunkX, serverChunk, dimension);
            } else {
                const index = chunkX / chunkSize;
                const neighbor = this.generator.getNeighborBiomeData(index, Math.floor(position.x / chunkSize), dimension);
                this.generator.generateChunk(index, chunkX, neighbor, dimension);
                createdChunks.push(chunkX);
            }
        }
        if (createdChunks.length) this.generator.generateStructures(dimension);
        for (const chunkX of createdChunks) {
            this.generator.postProcessChunk(this.getChunkForX(chunkX, dimension));
        }

        let nearestPortal = null;
        let nearestDistance = Infinity;

        for (let x = -range; x <= range; x++) {
            const chunk = this.getChunkForX(
                position.x + x * BLOCK_SIZE,
                dimension,
            );

            if (chunk) {
                const portals = chunk.getAllBlocks(Blocks.NetherPortal);
                for (const portal of portals) {
                    const below = this.getBlockAtWorldPosition(
                        portal.transform.position.x,
                        portal.transform.position.y + BLOCK_SIZE,
                        false,
                        dimension,
                    );
                    if (below?.blockType !== Blocks.Obsidian) continue;
                    const dx = portal.transform.position.x - position.x;
                    const dy = portal.transform.position.y - position.y;
                    if (Math.abs(dx) > range * BLOCK_SIZE) continue;
                    const distance = dx * dx + dy * dy;
                    if (distance < nearestDistance) {
                        nearestPortal = portal;
                        nearestDistance = distance;
                    }
                }
            }
        }
        if (nearestPortal) {
            if (multiplayer) {
                for (const chunkX of createdChunks) await this.uploadChunkToServer(chunkX, dimension);
            }
            const portal = nearestPortal.transform.position;
            return new Vector2(portal.x + BLOCK_SIZE / 2, portal.y + BLOCK_SIZE - this.player.hitbox.y);
        }

        // Keep the frame away from the bedrock roof and the world floor.
        position = new Vector2(
            Math.floor(position.x / BLOCK_SIZE) * BLOCK_SIZE,
            Math.max(BLOCK_SIZE * 4, Math.min(position.y, (CHUNK_HEIGHT - 7) * BLOCK_SIZE)),
        );

        // Carve a small exit on both sides of the frame and give it a solid
        // floor. Nether terrain can otherwise seal the new portal in rock.
        for (let x = -2; x <= 5; x++) {
            for (let y = -2; y <= 3; y++) {
                this.setBlockTypeAtPosition(
                    position.x + x * BLOCK_SIZE,
                    position.y + y * BLOCK_SIZE,
                    Blocks.Air, false, dimension, null, false,
                );
            }
            this.setBlockTypeAtPosition(
                position.x + x * BLOCK_SIZE,
                position.y + BLOCK_SIZE * 4,
                Blocks.Cobblestone, false, dimension, null, false,
            );
        }

        for (let i = 0; i < 4; i++) {
            this.setBlockTypeAtPosition(
                position.x + i * BLOCK_SIZE,
                position.y,
                Blocks.Obsidian,
                false,
                dimension,
                null,
                false,
            );
            this.setBlockTypeAtPosition(
                position.x + i * BLOCK_SIZE,
                position.y + BLOCK_SIZE * 4,
                Blocks.Obsidian,
                false,
                dimension,
                null,
                false,
            );
            this.setBlockTypeAtPosition(
                position.x,
                position.y + i * BLOCK_SIZE,
                Blocks.Obsidian,
                false,
                dimension,
                null,
                false,
            );
            this.setBlockTypeAtPosition(
                position.x + BLOCK_SIZE * 3,
                position.y + i * BLOCK_SIZE,
                Blocks.Obsidian,
                false,
                dimension,
                null,
                false,
            );
        }

        for (let y = 1; y < 4; y++) {
            for (let x = 1; x < 3; x++) {
                this.setBlockTypeAtPosition(
                    position.x + x * BLOCK_SIZE,
                    position.y + y * BLOCK_SIZE,
                    Blocks.NetherPortal,
                    false,
                    dimension,
                    null,
                    false,
                );
            }
        }

        const chunksToUpload = new Set(createdChunks);
        for (let x = -2; x <= 5; x++) {
            const chunkX = this.getChunkXForWorldX(position.x + x * BLOCK_SIZE);
            chunksToUpload.add(chunkX);
        }
        if (multiplayer) {
            for (const chunkX of chunksToUpload) await this.uploadChunkToServer(chunkX, dimension);
        }

        return new Vector2(position.x + BLOCK_SIZE * 1.5, position.y + BLOCK_SIZE * 4 - this.player.hitbox.y);
    }

    /**
     * Creates an explosion at the given position.
     * @param {Vector2} position - World position (x, y) of the explosion center
     * @param {Object} options - Explosion parameters (default is TNT-size)
     * @param {number} [options.radius=4*BLOCK_SIZE] - Explosion radius
     * @param {number} [options.damage=15] - Max entity damage
     * @param {number} [options.power=20] - Block destruction power (propagation)
     * @param {Entity} [options.excludeEntity=null] - Entity to exclude from damage
     */
    createExplosion(
        position,
        {
            radius = 4 * BLOCK_SIZE,
            damage = 15,
            power = 20,
            excludeEntity = null,
            destroyTerrain = true,
        } = {},
    ) {
        playRandomSoundFromArray({
            array: Sounds.Explosion,
            positional: true,
            origin: position,
        });

        // Damage and knockback entities in range
        for (const entity of runtime.world.entities) {
            if (entity === excludeEntity || entity.invulnerable) continue;

            const distance = Vector2.Distance(position, entity.position);
            if (distance > radius) continue;

            const damageFactor = 1 - distance / radius;
            const appliedDamage = Math.max(
                0,
                Math.round(damage * damageFactor),
            );
            if (typeof entity.hit === "function") entity.hit(appliedDamage);

            if (entity.type === EntityTypes.Drop) {
                this.removeEntity(entity);
                continue;
            }

            const knockbackFactor = (1 - distance / radius) / 5;
            const knockbackForce = Math.max(
                0,
                power * BLOCK_SIZE * knockbackFactor,
            );
            entity.knockBack(position.x, knockbackForce);
        }

        if (!destroyTerrain) return;

        // Destroy blocks in radius (flood-fill with power decay)
        const startX = Math.floor(position.x / BLOCK_SIZE);
        const startY = Math.floor(position.y / BLOCK_SIZE);
        const visited = new Set();
        const queue = [[startX, startY, power]];

        while (queue.length > 0) {
            const [x, y, remainingPower] = queue.shift();

            const worldX = x * BLOCK_SIZE;
            const worldY = y * BLOCK_SIZE;
            const distance = Math.sqrt(
                Math.pow(worldX - position.x, 2) +
                    Math.pow(worldY - position.y, 2),
            );

            if (distance > radius || remainingPower <= 0) continue;

            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const block = this.getBlockAtWorldPosition(worldX, worldY);
            if (!block) continue;

            const blockDef = getBlock(block.blockType);
            if (!blockDef) continue;

            const resistance = blockDef.hardness || 0;
            const powerThreshold = resistance + 1;

            if (remainingPower >= powerThreshold) {
                if (blockDef.hardness >= 0) {
                    if (blockDef.specialType === SpecialType.TNT) {
                        block.explode(true);
                    } else {
                        block.breakBlock(blockDef.dropWithoutTool);
                        this.setBlockType(block, Blocks.Air);
                    }
                }

                const reducedPower = remainingPower - 1 - resistance * 0.3;
                if (reducedPower > 0) {
                    queue.push([x, y - 1, reducedPower]);
                    queue.push([x, y + 1, reducedPower]);
                    queue.push([x - 1, y, reducedPower]);
                    queue.push([x + 1, y, reducedPower]);
                }
            }
        }
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

    serverPlaceBlock(
        chunkX,
        x,
        y,
        blockType,
        isWall = false,
        dimensionIndex = activeDimension,
        uploadChunk = true,
    ) {
        if (!multiplayer) return;
        runtime.server.send({
            type: "placeBlock",
            sender: this.player.UUID,
            message: {
                x: x,
                y: y,
                blockType: blockType,
                isWall: isWall,
                chunkX: chunkX,
                dimensionIndex: dimensionIndex,
            },
        });

        if (uploadChunk) this.uploadChunkToServer(chunkX, dimensionIndex);
    }

    serverBreakBlock(
        chunkX,
        x,
        y,
        blockType,
        isWall = false,
        shouldDrop = false,
        dimensionIndex = activeDimension,
    ) {
        if (!multiplayer) return;
        runtime.server.send({
            type: "breakBlock",
            sender: this.player.UUID,
            message: {
                x: x,
                y: y,
                blockType: blockType,
                isWall: isWall,
                chunkX: chunkX,
                shouldDrop: shouldDrop,
                dimensionIndex: dimensionIndex,
            },
        });

        this.uploadChunkToServer(chunkX, dimensionIndex);
    }

    async uploadChunkToServer(chunkX, dimensionIndex = activeDimension) {
        if (!this.player) return;
        if (!multiplayer) return;
        const chunk = this.getChunkForX(chunkX, dimensionIndex);
        await runtime.server.send({
            type: "uploadChunk",
            message: {
                x: chunkX,
                chunk: saveChunk(chunk),
                dimensionIndex: dimensionIndex,
            },
            sender: this.player.UUID,
        });
        console.log(`Uploaded chunk ${chunkX} to server`);
    }

    spawnDrop(position, props) {
        const uuid = uuidv4();
        const drop = this.summonEntity(Drop, position, props, false, uuid);
        if (multiplayer) {
            runtime.server.send({
                type: "summonDrop",
                message: {
                    UUID: uuid,
                    position: position,
                    props: props,
                    dimension: drop.dimension,
                },
                sender: this.player?.UUID,
            });
        }
        return drop;
    }

    summonEntity(entity, position, props, sync = false, uuid = null) {
        const UUID = uuid ? uuid : uuidv4();

        const newEntity = new entity(this, {
            UUID: UUID,
            position: position,
            ...props,
        });
        newEntity.dimension = activeDimension;

        this.entities.push(newEntity);

        if (sync) {
            runtime.server.send({
                type: "summonEntity",
                message: {
                    entity: newEntity.entityTypeName ?? newEntity.name,
                    props: props,
                    position: position,
                    UUID: UUID,
                },
                sender: this.player?.UUID,
            });
        }

        return newEntity;
    }

    removeEntity(entity, sync = false) {
        if (!entity) return;
        if (entity.myChunkX !== null) {
            if (
                this.getDimensionChunks(entity.dimension).has(entity.myChunkX)
            ) {
                this.getDimensionChunks(entity.dimension)
                    .get(entity.myChunkX)
                    .removeEntityFromChunk(entity);
            }
        }
        const index = this.entities.findIndex((e) => e.UUID === entity.UUID);
        if (index !== -1) {
            removeParticleEmitter(entity.footstepEmitter);
            this.entities.splice(index, 1);
        }
        if (sync) {
            runtime.server.send({
                type: "removeEntity",
                message: { UUID: entity.UUID },
            });
        }
    }

    updateParticleEmitters() {
        for (const emitter of this.particleEmitters) {
            emitter.update();
        }
    }
    globalRecalculateRedstone() {
        // 1. Reset power on all redstone dust blocks.
        for (const chunk of this.chunks_in_render_distance.values()) {
            for (let row of chunk.blocks) {
                for (let block of row) {
                    const def = getBlock(block.blockType);
                    if (def.specialType === SpecialType.RedstoneDust) {
                        block.redstoneOutput = 0;
                        block.powered = false;
                    }
                }
            }
        }
        let queue = [];
        const offsets = [
            { dx: -BLOCK_SIZE, dy: 0 },
            { dx: BLOCK_SIZE, dy: 0 },
            { dx: 0, dy: -BLOCK_SIZE },
            { dx: 0, dy: BLOCK_SIZE },
            { dx: -BLOCK_SIZE, dy: -BLOCK_SIZE },
            { dx: BLOCK_SIZE, dy: -BLOCK_SIZE },
            { dx: -BLOCK_SIZE, dy: BLOCK_SIZE },
            { dx: BLOCK_SIZE, dy: BLOCK_SIZE },
        ];
        for (const chunk of this.chunks_in_render_distance.values()) {
            for (let row of chunk.blocks) {
                for (let block of row) {
                    const def = getBlock(block.blockType);
                    if (block.redstoneOutput && block.redstoneOutput > 0) {
                        queue.push({
                            globalX: block.transform.position.x,
                            globalY: block.transform.position.y,
                        });
                    } else if (
                        def.specialType === SpecialType.RedstoneDust &&
                        block.redstoneOutput > 0
                    ) {
                        queue.push({
                            globalX: block.transform.position.x,
                            globalY: block.transform.position.y,
                        });
                    }
                }
            }
        }
        while (queue.length > 0) {
            const { globalX, globalY } = queue.shift();
            const block = this.getBlockAtWorldPosition(globalX, globalY, false);
            if (!block) continue;
            const currentPower = block.redstoneOutput;
            if (currentPower <= 1) continue;
            for (const offset of offsets) {
                const nx = globalX + offset.dx;
                const ny = globalY + offset.dy;
                const neighbor = this.getBlockAtWorldPosition(nx, ny, false);
                if (!neighbor) continue;
                const nDef = getBlock(neighbor.blockType);
                if (nDef.specialType !== SpecialType.RedstoneDust) continue;
                const candidatePower = currentPower - 1;
                if (candidatePower > neighbor.redstoneOutput) {
                    neighbor.redstoneOutput = candidatePower;
                    queue.push({
                        globalX: neighbor.transform.position.x,
                        globalY: neighbor.transform.position.y,
                    });
                }
            }
        }
        const neighborOffsets = [
            { dx: 0, dy: 0 },
            { dx: -BLOCK_SIZE, dy: 0 },
            { dx: BLOCK_SIZE, dy: 0 },
            { dx: 0, dy: -BLOCK_SIZE },
            { dx: 0, dy: BLOCK_SIZE },
        ];
        for (const chunk of this.chunks_in_render_distance.values()) {
            for (let row of chunk.blocks) {
                for (let block of row) {
                    let powered = false;
                    if (block.redstoneOutput > 0) {
                        powered = true;
                    }
                    const globalX = block.transform.position.x;
                    const globalY = block.transform.position.y;
                    for (const off of neighborOffsets) {
                        const nb = this.getBlockAtWorldPosition(
                            globalX + off.dx,
                            globalY + off.dy,
                            false,
                        );
                        if (nb && nb.redstoneOutput > 0) {
                            powered = true;
                        }
                    }
                    if (powered) {
                        block.power();
                    } else {
                        block.unpower();
                    }
                    block.redstoneDustUpdateState();
                }
            }
        }
    }
    updateBlockAfterTick(block, amount = 1) {
        this.blocksToUpdate.push({ block: block, after: amount });
    }
    globalRecalculateLight() {
        const queue = [];
        for (let chunk of this.chunks_in_render_distance.values()) {
            for (let row of chunk.blocks) {
                for (let block of row) {
                    const inherent = block.lightSourceLevel || 0;
                    if (inherent > 0) {
                        if (block.lightLevel < inherent) {
                            block.lightLevel = inherent;
                            block.sunLight = false;
                        }
                        queue.push(block);
                    }
                }
            }
        }
        const offsets = [
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
        ];
        while (queue.length > 0) {
            const current = queue.shift();
            const currentLevel = current.lightLevel;
            if (currentLevel <= 1) continue;
            const currentPosX = current.transform.position.x;
            const currentPosY = current.transform.position.y;
            for (const offset of offsets) {
                const nx = currentPosX + offset.dx * BLOCK_SIZE;
                const ny = currentPosY + offset.dy * BLOCK_SIZE;
                const neighbor = this.getBlockAtWorldPosition(nx, ny, false);
                if (!neighbor) continue;
                const decayFactor = 0.8;
                const newLight = Math.max(
                    1,
                    Math.floor(currentLevel * decayFactor),
                );
                if (neighbor.lightLevel < newLight) {
                    neighbor.lightLevel = newLight;
                    neighbor.sunLight = false;
                    queue.push(neighbor);
                }
            }
        }
    }
    globalUpdateSkyLight() {
        for (let chunk of this.chunks_in_render_distance.values()) {
            chunk.updateSkyLight();
        }
    }

    updateBlocks() {
        for (let i = updatingBlocks.length - 1; i >= 0; i--) {
            let block = updatingBlocks[i];
            let speed = getBlock(block.blockType).updateSpeed;
            if (block._updateAccumulator === undefined) {
                block._updateAccumulator = 0;
            }
            block._updateAccumulator += speed;
            if (block._updateAccumulator >= 1) {
                block.update();
                block._updateAccumulator -= 1;
            }
        }
    }

    getEntityByUUID(uuid) {
        return this.entities.find((entity) => entity.UUID == uuid);
    }
}
