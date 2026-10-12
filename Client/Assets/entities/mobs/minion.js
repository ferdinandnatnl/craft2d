import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { BlockCategory, SpecialType } from "@2dcraft.com/shared/blockType.js";
import { InventoryItem } from "@2dcraft.com/shared/inventoryItem.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, multiplayer } from "../../utils/globals.js";
import { ToolType } from "@2dcraft.com/shared/constants.js";
import { Vector2, uuidv4 } from "../../utils/classes.js";
import { runtime } from "../../utils/runtime.js";
import { EntityTypes } from "../../game/entity.js";
import { Body, BodyPart } from "../../game/body.js";
import { playRandomSoundFromArray } from "../../game/sounds.js";
import { getBlock, hasBlockCollision } from "../../world/block.js";
import { findMinionPath, getMinionStandability } from "../minions/pathfinding.js";
import { insertInventoryItem, transferInventoryToStorage } from "../minions/inventory.js";
import { getMinionConfig } from "../minions/config.js";
import { Villager } from "./villager.js";

export const MinionState = Object.freeze({
    Idle: "idle",
    FollowingOwner: "following-owner",
    MovingToTarget: "moving-to-target",
    SearchingResources: "searching-resources",
    Mining: "mining",
    Woodcutting: "woodcutting",
    Excavating: "excavating",
    CollectingItems: "collecting-items",
    CarryingEntity: "carrying-entity",
    DeliveringResources: "delivering-resources",
    ReturningToOwner: "returning-to-owner",
    Unreachable: "unreachable",
});

export const MINION_INVENTORY_SLOTS = 24;
const MAX_VEIN_BLOCKS = 512;
const MAX_TREE_BLOCKS = 256;
const TREE_SCAN_RADIUS = 32;
const MAX_TREES_PER_SEARCH = 16;
const MAX_EXCAVATION_SIDE = 64;
const AI_INTERVAL = 0.18;
const PATH_REFRESH_INTERVAL = 0.7;
const DEFAULT_WORTHLESS_BLOCKS = new Set([
    "air",
    "dirt",
    "grass",
    "grass block",
    "stone",
    "cobblestone",
    "gravel",
    "sand",
    "obsidian",
    "bedrock",
    "stone brick stairs",
    "netherrack",
    "soul sand",
    "snow",
    "snow block",
    "torch",
    "chest",
]);

const tileKey = ({ x, y }) => `${x},${y}`;
const reservationKey = (dimension, { x, y }) => `${dimension}:${x},${y}`;
const cloneData = (value) => value == null ? null : JSON.parse(JSON.stringify(value));

function copyInventoryItem(item = {}) {
    return new InventoryItem({
        blockId: Number.isInteger(item.blockId) ? item.blockId : null,
        itemId: Number.isInteger(item.itemId) ? item.itemId : null,
        count: Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0,
        props: item.props && typeof item.props === "object" && !Array.isArray(item.props)
            ? structuredClone(item.props)
            : {},
    });
}

function itemStackLimit(item) {
    if (item.blockId !== null) return getBlock(item.blockId)?.stackSize || 64;
    return getItem(item.itemId)?.stackSize || 64;
}

function blockName(block) {
    return (getBlock(block?.blockType)?.name || "").toLowerCase();
}

function isWoodBlock(block) {
    const def = getBlock(block?.blockType);
    if (!def || def.air || /planks|pressure plate|door/.test(def.name.toLowerCase())) {
        return false;
    }
    const config = getMinionConfig();
    return def.category === BlockCategory.Logs ||
        config.treeBlockIds.includes(block.blockType) ||
        config.treeBlockNames.some((name) => def.name.toLowerCase().includes(name.toLowerCase())) ||
        /\b(log|wood|stem)\b/i.test(def.name);
}

function isLeavesBlock(block) {
    return /leaves|leaf|foliage/i.test(blockName(block));
}

function isMineable(block) {
    if (!block) return false;
    const def = getBlock(block.blockType);
    return Boolean(def && !def.air && !def.chunkProtection &&
        def.hardness >= 0 && block.blockType !== Blocks.Bedrock &&
        !block.metaData?.storage &&
        ![SpecialType.SingleChest, SpecialType.Furnace].includes(def.specialType));
}

function createMinionBody() {
    return new Body({
        sprite: "minion/as_entityminion",
        renderScale: 4,
        parts: {
            leftLeg: new BodyPart({
                spriteCrop: { x: 3, y: 13, width: 2, height: 5 },
                offset: { x: 2, y: 21 },
                zIndex: -1,
                flip: true,
                sways: true,
                swayPhase: Math.PI,
                maxSwayAngle: 25,
            }),
            rightLeg: new BodyPart({
                spriteCrop: { x: 3, y: 13, width: 2, height: 5 },
                offset: { x: -2, y: 21 },
                zIndex: -1,
                flip: true,
                sways: true,
                maxSwayAngle: 25,
            }),
            backpack: new BodyPart({
                spriteCrop: { x: 16, y: 18, width: 6, height: 7 },
                offset: { x: 0, y: 4 },
                zIndex: -2,
                spriteRotation: 45,
                flip: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 26, y: 4, width: 8, height: 8 },
                offset: { x: 0, y: 4 },
                flip: true,
            }),
            leftArm: new BodyPart({
                spriteCrop: { x: 3, y: 22, width: 2, height: 7 },
                offset: { x: 6, y: 6 },
                zIndex: -1,
                flip: true,
                sways: true,
                maxSwayAngle: 25,
            }),
            rightArm: new BodyPart({
                spriteCrop: { x: 3, y: 22, width: 2, height: 7 },
                offset: { x: -6, y: 6 },
                zIndex: 2,
                flip: true,
                sways: true,
                maxSwayAngle: 25,
                mainArm: true,
                holdOrigin: { x: 0, y: 3 },
            }),
            head: new BodyPart({
                spriteCrop: { x: 4, y: 4, width: 6, height: 5 },
                offset: { x: 0, y: -2 },
                zIndex: 3,
                flip: true,
            }),
        },
    });
}

function validTask(task) {
    if (!task || typeof task !== "object" || Array.isArray(task)) return null;
    const tile = (value) => value && Number.isInteger(value.x) &&
        Number.isInteger(value.y) && Math.abs(value.x) <= 1_000_000 &&
        value.y >= 0 && value.y < CHUNK_HEIGHT
        ? { x: value.x, y: value.y }
        : null;
    if (["follow", "return"].includes(task.type)) return { type: task.type };
    if (task.type === "move" || task.type === "woodcut") {
        const target = tile(task.target);
        if (!target) return null;
        const result = { type: task.type, target };
        if (task.type === "woodcut" && Array.isArray(task.targets)) {
            result.targets = task.targets.slice(0, MAX_TREE_BLOCKS)
                .map((entry) => {
                    const point = tile(entry);
                    return point && Number.isInteger(entry.blockType)
                        ? { ...point, blockType: entry.blockType }
                        : null;
                })
                .filter(Boolean);
        }
        return result;
    }
    if (task.type === "mine-vein") {
        const target = tile(task.target);
        if (!target || !Number.isInteger(task.blockType) || task.blockType < 0) return null;
        const result = { type: task.type, target, blockType: task.blockType };
        if (Array.isArray(task.targets)) {
            result.targets = task.targets.slice(0, MAX_VEIN_BLOCKS)
                .map((entry) => {
                    const point = tile(entry);
                    return point && Number.isInteger(entry.blockType)
                        ? { ...point, blockType: entry.blockType }
                        : null;
                })
                .filter(Boolean);
        }
        return result;
    }
    if (task.type === "excavate") {
        const bounds = task.bounds;
        if (!bounds || ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]
            .every(Number.isInteger)) return null;
        if (Math.abs(bounds.minX) > 1_000_000 || Math.abs(bounds.maxX) > 1_000_000 ||
            bounds.minY < 0 || bounds.maxY >= CHUNK_HEIGHT ||
            bounds.maxX < bounds.minX || bounds.maxY < bounds.minY ||
            bounds.maxX - bounds.minX >= MAX_EXCAVATION_SIDE ||
            bounds.maxY - bounds.minY >= MAX_EXCAVATION_SIDE) return null;
        return { type: task.type, bounds: { ...bounds } };
    }
    if (task.type === "mineshaft" || task.type === "stripmine") {
        const target = tile(task.target);
        if (!target) return null;
        const result = { type: task.type, target, direction: task.direction < 0 ? -1 : 1 };
        if (task.started === true) {
            if (!Number.isInteger(task.currentX) || !Number.isInteger(task.currentY) ||
                task.currentY < 0 || task.currentY >= CHUNK_HEIGHT) return null;
            result.started = true;
            result.currentX = task.currentX;
            result.currentY = task.currentY;
            result.steps = Number.isInteger(task.steps)
                ? Math.max(0, Math.min(CHUNK_HEIGHT, task.steps)) : 0;
            result.phase = task.type === "stripmine" ? "tunnel" : "shaft";
            if (task.type === "mineshaft") {
                result.targetY = Number.isInteger(task.targetY)
                    ? Math.max(task.currentY, Math.min(CHUNK_HEIGHT - 1, task.targetY))
                    : CHUNK_HEIGHT - 8;
            }
        }
        return result;
    }
    if (task.type === "carry" && typeof task.targetUUID === "string" &&
        task.targetUUID.length <= 64) {
        return {
            type: "carry",
            targetUUID: task.targetUUID,
            ...(task.destination === "owner" ? { destination: "owner" } : {}),
        };
    }
    return null;
}

export class Minion extends Villager {
    constructor(world, {
        position = new Vector2(),
        ownerUUID = null,
        myChunkX = Math.floor(position.x / (CHUNK_WIDTH * BLOCK_SIZE)) * CHUNK_WIDTH * BLOCK_SIZE,
        UUID = uuidv4(),
        health = 20,
        dimension = Dimensions.Overworld,
        direction = 1,
        job = null,
        inventory = [],
        deliveryDestination = null,
        carriedEntityUUID = null,
        deliveryActive = false,
    } = {}) {
        super(world, {
            health,
            noAi: true,
            position,
            myChunkX,
            homeX: position.x,
            UUID,
            body: createMinionBody(),
        });
        this.name = "Minion";
        this.entityTypeName = "Minion";
        this.isMinion = true;
        this.ownerUUID = typeof ownerUUID === "string" ? ownerUUID : null;
        this.dimension = dimension;
        this.direction = direction < 0 ? -1 : 1;
        this.hitbox.x = 0.52 * BLOCK_SIZE;
        this.hitbox.y = 1.35 * BLOCK_SIZE;
        this.speed = 1.5;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.workSpeedBonusUntil = 0;
        this.ownerMissingTimer = 0;
        this.noAi = true;
        this.inventory = Array.from({ length: MINION_INVENTORY_SLOTS }, (_, index) =>
            copyInventoryItem(inventory[index]),
        );
        this.job = validTask(job);
        this.state = deliveryActive
            ? MinionState.DeliveringResources
            : this.job?.type === "follow"
                ? MinionState.FollowingOwner
                : MinionState.Idle;
        this.deliveryDestination = this.normalizeDestination(deliveryDestination);
        this.carriedEntityUUID = typeof carriedEntityUUID === "string"
            ? carriedEntityUUID
            : null;
        this.deliveryActive = deliveryActive === true;
        this.resumeTaskAfterDelivery = this.deliveryActive ? cloneData(this.job) : null;
        this.currentTarget = null;
        this.currentTargetKey = null;
        this.path = null;
        this.pathGoalKey = null;
        this.pathTimer = 0;
        this.pathFindingFails = 0;
        this.aiTimer = 0;
        this.searchTimer = 0;
        this.stuckTimer = 0;
        this.lastX = position.x;
        this.miningTimer = 0;
        this.miningKey = null;
        this.miningBlockPosition = null;
        this.miningProgress = 0;
        this.miningStage = 0;
        this.miningSoundTimer = 0;
        this.workSwingProgress = 0;
        this.retryTimer = 0;
        this.collectTimer = 0;
        this.syncTimer = 0;
        this.lastSyncedX = position.x;
        this.lastSyncedY = position.y;
        this.walkAnimationPhase = 0;
        this.walkAnimationAmount = 0;
        this.treeTaskAnchor = null;
        this._activeVein = null;
        this._activeVeinReturnState = null;
        this._navigationResumeState = MinionState.MovingToTarget;
        this._chunkMembershipX = myChunkX;
        this.addToCurrentChunk();
    }

    normalizeDestination(destination) {
        if (!destination || !Number.isInteger(destination.x) ||
            !Number.isInteger(destination.y)) return null;
        return {
            x: destination.x,
            y: destination.y,
            dimension: Number.isInteger(destination.dimension)
                ? destination.dimension
                : this.dimension,
        };
    }

    addToCurrentChunk() {
        const chunk = this.world.getChunkForX(this.position.x, this.dimension);
        if (!chunk) return;
        this.myChunkX = chunk.x;
        this._chunkMembershipX = chunk.x;
        if (!chunk.entities.includes(this)) chunk.entities.push(this);
    }

    syncChunkMembership() {
        const chunkX = Math.floor(this.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
            CHUNK_WIDTH * BLOCK_SIZE;
        if (chunkX === this._chunkMembershipX) return;
        const oldChunk = this.world.getDimensionChunks(this.dimension).get(this._chunkMembershipX);
        if (oldChunk) oldChunk.removeEntityFromChunk(this);
        const newChunk = this.world.getDimensionChunks(this.dimension).get(chunkX);
        this.myChunkX = newChunk ? chunkX : null;
        this._chunkMembershipX = newChunk ? chunkX : null;
        if (newChunk && !newChunk.entities.includes(this)) newChunk.entities.push(this);
    }

    setJob(task, { sync = true } = {}) {
        if (this.job?.type === "carry" && task?.type !== "carry") {
            this.releaseCarriedEntity();
        }
        this.releaseCurrentTarget();
        this.job = validTask(task);
        this.currentTarget = null;
        this.path = null;
        this.clearMiningProgress();
        this.resumeTaskAfterDelivery = null;
        this.deliveryActive = false;
        this._activeVein = null;
        this.state = this.stateForJob(this.job);
        if (sync) this.broadcastState();
    }

    setDeliveryDestination(destination) {
        this.deliveryDestination = this.normalizeDestination(destination);
        this.broadcastState();
    }

    createSaveData() {
        return {
            UUID: this.UUID,
            ownerUUID: this.ownerUUID,
            position: { x: this.position.x, y: this.position.y },
            health: this.health,
            dimension: this.dimension,
            direction: this.direction,
            job: cloneData(this.job),
            inventory: this.inventory.map((item) => ({
                blockId: item.blockId,
                itemId: item.itemId,
                count: item.count,
                props: structuredClone(item.props || {}),
            })),
            deliveryDestination: cloneData(this.deliveryDestination),
            carriedEntityUUID: this.carriedEntityUUID,
            deliveryActive: this.deliveryActive,
        };
    }

    update() {
        if (multiplayer && this.ownerUUID !== runtime.world?.player?.UUID) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.targetVelocity.x = 0;
            this.targetVelocity.y = 0;
            return;
        }
        const dt = Math.min(runtime.deltaTime || 0, 0.1);
        const ownerExists = this.world.entities.some((entity) =>
            entity.UUID === this.ownerUUID && entity.type === EntityTypes.Player &&
            entity.health > 0,
        );
        if (ownerExists) {
            this.ownerMissingTimer = 0;
        } else {
            this.ownerMissingTimer += dt;
            if (this.ownerMissingTimer >= getMinionConfig().automaticDespawnDelay) {
                this.releaseCarriedEntity();
                this.dropInventory();
                this.releaseCurrentTarget();
                this.world.removeEntity(this, multiplayer);
                this.persistOwnerMinions();
                return;
            }
        }
        this.aiTimer += dt;
        if (this.aiTimer >= AI_INTERVAL) {
            const aiDelta = this.aiTimer;
            this.aiTimer = 0;
            this.updateWorkerAI(aiDelta);
        }
        const movementTargetX = this.targetVelocity.x;
        const previousX = this.position.x;
        this.updateEntity();
        const walked = Math.abs(this.position.x - previousX);
        const walkSpeed = dt > 0 ? walked / dt : 0;
        const targetWalkAmount = this.grounded && walked < BLOCK_SIZE
            ? Math.min(1, walkSpeed / BLOCK_SIZE * 0.2)
            : 0;
        this.walkAnimationAmount += (targetWalkAmount - this.walkAnimationAmount) *
            (1 - Math.pow(0.6, dt * 20));
        this.walkAnimationPhase += this.walkAnimationAmount * dt * 20;
        if (this.miningKey && this.miningTimer > 0) {
            const workSpeed = runtime.passedTime < this.workSpeedBonusUntil ? 2 : 1;
            this.workSwingProgress = (this.workSwingProgress + dt * 1.7 * workSpeed) % 1;
        } else {
            this.workSwingProgress = 0;
        }
        if (movementTargetX !== 0 && !this.carriedByMinionUUID &&
            !this.crocodileGrabbedByUUID && [
                MinionState.FollowingOwner,
                MinionState.MovingToTarget,
                MinionState.Excavating,
                MinionState.CarryingEntity,
                MinionState.DeliveringResources,
                MinionState.ReturningToOwner,
            ].includes(this.state)) {
            // Entity physics consumes targetVelocity each frame. Keep the AI's
            // movement command active until its next update chooses a new one.
            this.targetVelocity.x = movementTargetX;
        }
        this.syncChunkMembership();
        this.updateNetworkState(dt);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    updateWorkerAI(dt) {
        this.pickUpNearbyDrops();
        if (this.hasInventory() && this.inventoryFull() &&
            this.state !== MinionState.DeliveringResources) {
            this.beginDelivery();
        }

        switch (this.state) {
            case MinionState.Idle:
                if (this.job?.type) this.state = this.stateForJob(this.job);
                break;
            case MinionState.FollowingOwner:
                this.followOwner();
                break;
            case MinionState.MovingToTarget:
                this.moveForCurrentTask();
                break;
            case MinionState.SearchingResources:
                this.searchAndWork(dt);
                break;
            case MinionState.Mining:
            case MinionState.Woodcutting:
            case MinionState.Excavating:
                this.workOnCurrentTarget(dt);
                break;
            case MinionState.CollectingItems:
                this.collectTimer -= dt;
                this.pickUpNearbyDrops();
                if (this.collectTimer <= 0) {
                    this.currentTarget = null;
                    this.state = this.stateForJob(this.job);
                }
                break;
            case MinionState.CarryingEntity:
                this.carryEntity();
                break;
            case MinionState.DeliveringResources:
                this.deliverInventory(dt);
                break;
            case MinionState.ReturningToOwner:
                this.returnToOwner();
                break;
            case MinionState.Unreachable:
                this.retryTimer -= dt;
                this.targetVelocity.x = 0;
                if (this.retryTimer <= 0) {
                    this.path = null;
                    this.state = this.deliveryActive
                        ? MinionState.DeliveringResources
                        : this.job?.type === "return"
                            ? MinionState.ReturningToOwner
                            : this.stateForJob(this.job);
                }
                break;
        }
        this.collectNearbyDrops();
        if (Math.abs(this.position.x - this.lastX) < 1 &&
            Math.abs(this.targetVelocity.x) > 0 && this.grounded) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.lastX = this.position.x;
        }
        if (this.stuckTimer > 1.5) {
            this.path = null;
            this.pathTimer = PATH_REFRESH_INTERVAL;
            this.stuckTimer = 0;
        }
    }

    stateForJob(job) {
        if (!job) return MinionState.Idle;
        switch (job.type) {
            case "follow": return MinionState.FollowingOwner;
            case "move": return MinionState.MovingToTarget;
            case "mine-vein": return MinionState.SearchingResources;
            case "woodcut": return MinionState.SearchingResources;
            case "excavate": return MinionState.SearchingResources;
            case "mineshaft":
            case "stripmine":
                if (this._activeVein) return MinionState.SearchingResources;
                return job.started ? MinionState.Excavating : MinionState.MovingToTarget;
            case "carry": return MinionState.CarryingEntity;
            case "return": return MinionState.ReturningToOwner;
            default: return MinionState.Idle;
        }
    }

    getOwner() {
        if (!this.ownerUUID) return null;
        return this.world.entities.find((entity) =>
            entity.UUID === this.ownerUUID && entity.type === EntityTypes.Player &&
            entity.health > 0 && entity.dimension === this.dimension,
        ) || null;
    }

    followOwner() {
        const owner = this.getOwner();
        if (!owner) return this.setUnreachable();
        const spacing = 1.25 + (this.followerIndex() % 3) * 0.55;
        const targetX = Math.floor((owner.position.x - owner.direction * spacing * BLOCK_SIZE) / BLOCK_SIZE);
        const targetY = Math.round((owner.position.y + owner.hitbox.y) / BLOCK_SIZE);
        const candidates = this.stanceCandidatesNear({ x: targetX, y: targetY }, 2, 2);
        const distance = Math.abs(this.position.x - owner.position.x);
        if (distance <= spacing * BLOCK_SIZE &&
            Math.abs(this.position.y - owner.position.y) < BLOCK_SIZE) {
            this.targetVelocity.x = 0;
            this.path = null;
            return;
        }
        if (!this.navigateTo(candidates, `follow:${targetX}:${targetY}`)) {
            this.targetVelocity.x = 0;
        }
    }

    followerIndex() {
        return this.world.entities.filter((entity) =>
            entity.isMinion && entity.ownerUUID === this.ownerUUID,
        ).findIndex((entity) => entity.UUID === this.UUID);
    }

    moveForCurrentTask() {
        if (!this.job) return this.finishJob();
        if (this.currentTarget) return this.moveForWorkTarget();
        if (this.job.type === "mineshaft" || this.job.type === "stripmine") {
            if (!this.job.started) {
                const target = this.job.target;
                if (!target) return this.finishJob();
                const candidates = this.stanceCandidatesNear(target, 2, 3);
                if (!this.navigateTo(candidates, `start:${target.x}:${target.y}`)) return;
                this.job.started = true;
                this.job.currentX = this.currentFootNode().x;
                this.job.currentY = this.currentFootNode().y;
                this.job.steps = 0;
                this.job.phase = this.job.type === "stripmine" ? "tunnel" : "shaft";
                if (this.job.type === "mineshaft") this.job.targetY = CHUNK_HEIGHT - 8;
            }
            this.state = this._activeVein
                ? MinionState.SearchingResources
                : MinionState.Excavating;
            return;
        }
        if (this.job.type === "move") {
            const candidates = this.stanceCandidatesNear(this.job.target, 2, 3);
            if (this.navigateTo(candidates, `move:${this.job.target.x}:${this.job.target.y}`)) {
                this.job = null;
                this.state = MinionState.Idle;
            }
        }
    }

    searchAndWork(dt) {
        this.searchTimer -= dt;
        if (this.searchTimer > 0) return;
        this.searchTimer = 0.45;
        if (!this.job) return this.finishJob();

        if (this._activeVein) {
            const target = this._activeVein
                .filter((entry) => {
                    const block = this.blockAt(entry.x, entry.y);
                    return block && block.blockType === entry.blockType && isMineable(block);
                })
                .filter((entry) => !this.isReserved(entry))
                .sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b))[0];
            if (target) {
                this.selectWorkTarget(target, MinionState.Mining);
                return;
            }
            this._activeVein = null;
            this.state = MinionState.Excavating;
            return;
        }

        if (this.job.type === "mine-vein") {
            const target = this.findOreTarget();
            if (!target) return this.finishOrWaitForReservations();
            this.selectWorkTarget(target, MinionState.Mining);
            return;
        }
        if (this.job.type === "woodcut") {
            const target = this.findTreeTarget();
            if (!target) return this.finishOrWaitForReservations();
            this.selectWorkTarget(target, MinionState.Woodcutting);
            return;
        }
        if (this.job.type === "excavate") {
            const target = this.findExcavationTarget();
            if (!target) return this.finishOrWaitForReservations();
            this.selectWorkTarget(target, MinionState.Excavating);
            return;
        }
        if (this.job.type === "mineshaft" || this.job.type === "stripmine") {
            this.state = MinionState.Excavating;
            return;
        }
        if (this.job.type === "carry") {
            this.state = MinionState.CarryingEntity;
            return;
        }
        this.finishJob();
    }

    selectWorkTarget(target, workState) {
        this.releaseCurrentTarget();
        this.currentTarget = { x: target.x, y: target.y, blockType: target.blockType };
        this.currentTargetKey = reservationKey(this.dimension, this.currentTarget);
        this.reserveCurrentTarget();
        this._navigationResumeState = workState;
        this.state = MinionState.MovingToTarget;
        if (this.canReachBlock(this.currentTarget)) {
            this.targetVelocity.x = 0;
            this.state = workState;
            return;
        }
        const candidates = this.stanceCandidatesForBlock(this.currentTarget);
        if (this.navigateTo(candidates, `block:${tileKey(target)}`)) {
            this.state = workState;
        }
    }

    moveForWorkTarget() {
        if (!this.currentTarget) return false;
        if (this.canReachBlock(this.currentTarget)) {
            this.targetVelocity.x = 0;
            this.state = this._navigationResumeState;
            return true;
        }
        const candidates = this.stanceCandidatesForBlock(this.currentTarget);
        const arrived = this.navigateTo(candidates, `block:${tileKey(this.currentTarget)}`);
        if (arrived) this.state = this._navigationResumeState;
        return arrived;
    }

    workOnCurrentTarget(dt) {
        if (!this.currentTarget &&
            (this.job?.type === "mineshaft" || this.job?.type === "stripmine")) {
            this.workOnShaftOrTunnel(dt);
            return;
        }
        if (!this.currentTarget) {
            this.state = MinionState.SearchingResources;
            return;
        }
        const block = this.blockAt(this.currentTarget.x, this.currentTarget.y);
        if (!block || !isMineable(block) ||
            (this.currentTarget.blockType !== undefined &&
                block.blockType !== this.currentTarget.blockType)) {
            this.completeWorkTarget();
            return;
        }
        if (!this.canReachBlock(this.currentTarget)) {
            this.state = MinionState.MovingToTarget;
            this._navigationResumeState = this.job.type === "woodcut"
                ? MinionState.Woodcutting
                : this.job.type === "excavate"
                    ? MinionState.Excavating
                    : MinionState.Mining;
            this.moveForWorkTarget();
            return;
        }
        this.setHeldToolForBlock(block);
        this.targetVelocity.x = 0;
        this.direction = this.currentTarget.x * BLOCK_SIZE < this.position.x ? -1 : 1;
        const miningKey = tileKey(this.currentTarget);
        const hardness = getBlock(block.blockType).hardness;
        const workTime = Math.max(0.16, Math.min(4, (hardness || 0.5) * 0.35)) /
            (runtime.passedTime < this.workSpeedBonusUntil ? 2 : 1);
        this.beginMiningBlock(block, miningKey);
        this.advanceMiningProgress(block, workTime, dt);
        if (this.miningTimer < workTime) return;
        if (!this.breakWorkerBlock(block)) {
            this.setUnreachable();
            return;
        }
        this.clearMiningProgress();
        this.releaseCurrentTarget();
        this.state = MinionState.CollectingItems;
        this.collectTimer = 0.42;
    }

    completeWorkTarget() {
        this.releaseCurrentTarget();
        this.currentTarget = null;
        this.clearMiningProgress();
        this.state = this.stateForJob(this.job);
    }

    beginMiningBlock(block, key) {
        if (this.miningKey !== key) {
            this.miningKey = key;
            this.miningTimer = 0;
            this.miningProgress = 0;
            this.miningSoundTimer = 0;
            this.workSwingProgress = 0;
            this.playMiningSound(block);
        }
        const position = block.transform?.position;
        this.miningBlockPosition = {
            x: Number.isFinite(position?.x)
                ? Math.floor(position.x / BLOCK_SIZE)
                : this.currentTarget?.x ?? block.x ?? null,
            y: Number.isFinite(position?.y)
                ? Math.floor(position.y / BLOCK_SIZE)
                : this.currentTarget?.y ?? block.y ?? null,
            wall: Boolean(block.wall),
        };
    }

    advanceMiningProgress(block, workTime, dt) {
        const step = Math.max(0, dt);
        this.miningTimer += step;
        this.miningProgress = Math.min(1, this.miningTimer / workTime);
        this.miningStage = Math.floor(Math.min(10, this.miningProgress * 10));
        this.miningSoundTimer += step;
        if (this.miningSoundTimer < 0.2 ||
            !getBlock(block.blockType)?.breakingSound?.length) return;
        this.miningSoundTimer %= 0.2;
        this.playMiningSound(block);
    }

    playMiningSound(block) {
        const sound = getBlock(block?.blockType)?.breakingSound;
        if (!sound?.length || !runtime.game || !runtime.world) return;
        playRandomSoundFromArray({
            array: sound,
            volume: 0.2,
            positional: true,
            origin: this.world.getBlockWorldPosition(block),
        });
    }

    clearMiningProgress() {
        this.miningTimer = 0;
        this.miningKey = null;
        this.miningBlockPosition = null;
        this.miningProgress = 0;
        this.miningStage = 0;
        this.miningSoundTimer = 0;
        this.workSwingProgress = 0;
    }

    breakWorkerBlock(block) {
        if (!isMineable(block)) return false;
        if (runtime.GAMERULES?.doMobGriefing === false) return false;
        const def = getBlock(block.blockType);
        const fellTreeWood = isWoodBlock(block) && !isLeavesBlock(block);
        const tile = {
            x: Math.floor(block.transform.position.x / BLOCK_SIZE),
            y: Math.floor(block.transform.position.y / BLOCK_SIZE),
        };
        const heldTool = getItem(this.holdItem?.itemId);
        const heldToolType = heldTool?.toolType === ToolType.Axe &&
            def.toolType === ToolType.Shears
            ? ToolType.Shears
            : heldTool?.toolType;
        const shouldDrop = def.dropWithoutTool ||
            (heldToolType === def.toolType &&
                def.requiredToolLevel <= (heldTool?.toolLevel ?? -1));
        const x = block.transform.position.x;
        const y = block.transform.position.y;
        const type = block.blockType;
        block.breakBlock(shouldDrop, false);
        if (multiplayer) {
            this.world.serverBreakBlock(
                block.chunkX,
                block.x,
                block.y,
                Blocks.Air,
                false,
                shouldDrop,
                this.dimension,
                this.UUID,
            );
        }
        if (fellTreeWood) this.decayUnsupportedLeaves(tile);
        this.lastMinedBlock = { x: Math.floor(x / BLOCK_SIZE), y: Math.floor(y / BLOCK_SIZE), blockType: type };
        return true;
    }

    decayUnsupportedLeaves(origin) {
        const leaves = [];
        const radius = 8;
        for (let y = Math.max(0, origin.y - radius);
            y <= Math.min(CHUNK_HEIGHT - 1, origin.y + radius); y++) {
            for (let x = origin.x - radius; x <= origin.x + radius; x++) {
                const block = this.blockAt(x, y);
                if (isLeavesBlock(block)) leaves.push(block);
            }
        }
        const chunksToUpload = new Set();
        for (const leaf of leaves) {
            const leafX = Math.floor(leaf.transform.position.x / BLOCK_SIZE);
            const leafY = Math.floor(leaf.transform.position.y / BLOCK_SIZE);
            let supported = false;
            for (let dy = -6; dy <= 6 && !supported; dy++) {
                for (let dx = -6; dx <= 6; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) > 6) continue;
                    if (isWoodBlock(this.blockAt(leafX + dx, leafY + dy))) {
                        supported = true;
                        break;
                    }
                }
            }
            if (supported || !isMineable(leaf)) continue;
            const chunkX = leaf.chunkX;
            leaf.breakBlock(false, false);
            if (multiplayer) {
                this.world.serverBreakBlock(
                    chunkX,
                    leaf.x,
                    leaf.y,
                    Blocks.Air,
                    false,
                    false,
                    this.dimension,
                    this.UUID,
                    false,
                );
                chunksToUpload.add(chunkX);
            }
        }
        for (const chunkX of chunksToUpload) {
            this.world.uploadChunkToServer(chunkX, this.dimension, this.UUID);
        }
    }

    canReachBlock(target) {
        const centerX = this.position.x + this.hitbox.x / 2;
        const blockX = target.x * BLOCK_SIZE + BLOCK_SIZE / 2;
        const blockY = target.y * BLOCK_SIZE + BLOCK_SIZE / 2;
        const bodyTop = this.position.y;
        const bodyBottom = this.position.y + this.hitbox.y;
        const horizontalReach = Math.abs(centerX - blockX) <= BLOCK_SIZE * 1.35;
        if (!horizontalReach) return false;

        // The licensed mod assigns one task to a whole connected tree and
        // chops its trunk from the base. Keep that behavior in this 2D world:
        // upper logs in the same tree do not require the worker to stand on
        // every block of the trunk.
        const partOfAssignedTree = this.job?.type === "woodcut" &&
            this.job.targets?.some((entry) => entry.x === target.x &&
                entry.y === target.y &&
                (target.blockType === undefined || entry.blockType === target.blockType));
        if (partOfAssignedTree) return true;

        return blockY >= bodyTop - BLOCK_SIZE * 0.1 &&
            blockY <= bodyBottom + BLOCK_SIZE * 0.1;
    }

    findOreTarget() {
        const anchor = this.job?.target;
        const type = this.job?.blockType ?? anchor?.blockType;
        if (!anchor || !Number.isInteger(type)) return null;
        if (!this.job.targets) {
            const candidates = [];
            const radius = 4;
            for (let y = anchor.y - radius; y <= anchor.y + radius; y++) {
                for (let x = anchor.x - radius; x <= anchor.x + radius; x++) {
                    const block = this.blockAt(x, y);
                    if (block?.blockType === type && isMineable(block)) {
                        candidates.push({ x, y, blockType: type });
                    }
                }
            }
            candidates.sort((a, b) =>
                Math.abs(a.x - anchor.x) + Math.abs(a.y - anchor.y) -
                Math.abs(b.x - anchor.x) - Math.abs(b.y - anchor.y),
            );
            if (!candidates.length) return null;
            this.job.targets = this.connectedBlocks(candidates[0], (block) =>
                block.blockType === type,
                MAX_VEIN_BLOCKS,
                false,
            );
        }
        return this.job.targets
            .filter((entry) => this.blockAt(entry.x, entry.y)?.blockType === entry.blockType)
            .filter((entry) => !this.isReserved(entry))
            .sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b))[0] || null;
    }

    findTreeTarget() {
        const anchor = this.job?.target;
        if (!anchor) return null;
        if (Array.isArray(this.job.targets)) {
            const live = this.job.targets.filter((entry) => {
                const block = this.blockAt(entry.x, entry.y);
                return block && block.blockType === entry.blockType && isMineable(block);
            });
            const free = live.filter((entry) => !this.isReserved(entry));
            const logsAvailable = free.filter((entry) => isWoodBlock(this.blockAt(entry.x, entry.y)));
            const leavesAvailable = free.filter((entry) => isLeavesBlock(this.blockAt(entry.x, entry.y)));
            const target = (logsAvailable.length ? logsAvailable : leavesAvailable)
                .sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b))[0];
            if (target) return target;
            if (live.length) return null;
            this.job.targets = null;
        }
        const logs = [];
        for (let y = Math.max(2, anchor.y - TREE_SCAN_RADIUS);
            y <= Math.min(CHUNK_HEIGHT - 1, anchor.y + TREE_SCAN_RADIUS); y++) {
            for (let x = anchor.x - TREE_SCAN_RADIUS; x <= anchor.x + TREE_SCAN_RADIUS; x++) {
                const block = this.blockAt(x, y);
                if (isWoodBlock(block)) logs.push({ x, y, blockType: block.blockType });
            }
        }
        logs.sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b));
        let examined = 0;
        const seenLogs = new Set();
        for (const log of logs) {
            if (examined >= MAX_TREES_PER_SEARCH) break;
            if (seenLogs.has(tileKey(log))) continue;
            examined++;
            const cluster = this.connectedBlocks(log,
                (block) => isWoodBlock(block) || isLeavesBlock(block),
                MAX_TREE_BLOCKS,
            );
            for (const entry of cluster) {
                if (isWoodBlock(this.blockAt(entry.x, entry.y))) seenLogs.add(tileKey(entry));
            }
            this.job.targets = cluster;
            return this.findTreeTarget();
        }
        return null;
    }

    findExcavationTarget() {
        const bounds = this.job?.bounds;
        if (!bounds) return null;
        const width = bounds.maxX - bounds.minX + 1;
        const height = bounds.maxY - bounds.minY + 1;
        if (width > MAX_EXCAVATION_SIDE || height > MAX_EXCAVATION_SIDE) {
            this.setUnreachable();
            return null;
        }
        const candidates = [];
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const block = this.blockAt(x, y);
                if (!isMineable(block)) continue;
                const entry = { x, y, blockType: block.blockType };
                if (this.isReserved(entry) || !this.isExposedExcavationBlock(entry, bounds)) continue;
                candidates.push(entry);
            }
        }
        candidates.sort((a, b) => a.y - b.y ||
            this.distanceToTile(a) - this.distanceToTile(b));
        return candidates[0] || null;
    }

    isExposedExcavationBlock(target, bounds) {
        const neighborOffsets = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
        ];
        return neighborOffsets.some(([dx, dy]) => {
            const x = target.x + dx;
            const y = target.y + dy;
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
                return true;
            }
            const neighbor = this.blockAt(x, y);
            return !neighbor || getBlock(neighbor.blockType).air;
        });
    }

    connectedBlocks(start, predicate, limit, diagonal = true) {
        const startBlock = this.blockAt(start.x, start.y);
        if (!startBlock || !predicate(startBlock)) return [];
        const queue = [start];
        const seen = new Set([tileKey(start)]);
        const output = [];
        const offsets = diagonal
            ? [
                [-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [1, -1], [-1, 1], [1, 1],
            ]
            : [[-1, 0], [1, 0], [0, -1], [0, 1]];
        while (queue.length && output.length < limit) {
            const current = queue.shift();
            const block = this.blockAt(current.x, current.y);
            if (!block || !predicate(block)) continue;
            output.push({ x: current.x, y: current.y, blockType: block.blockType });
            for (const [dx, dy] of offsets) {
                const next = { x: current.x + dx, y: current.y + dy };
                const key = tileKey(next);
                if (seen.has(key)) continue;
                seen.add(key);
                const neighbor = this.blockAt(next.x, next.y);
                if (neighbor && predicate(neighbor)) queue.push(next);
            }
        }
        return output;
    }

    blockAt(x, y) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= CHUNK_HEIGHT) {
            return null;
        }
        return this.world.getBlockAtWorldPosition(
            x * BLOCK_SIZE,
            y * BLOCK_SIZE,
            false,
            this.dimension,
        );
    }

    distanceToTile(tile) {
        const x = Math.floor((this.position.x + this.hitbox.x / 2) / BLOCK_SIZE);
        const y = Math.floor((this.position.y + this.hitbox.y) / BLOCK_SIZE);
        return Math.abs(tile.x - x) + Math.abs(tile.y - y);
    }

    currentFootNode() {
        return {
            x: Math.floor((this.position.x + this.hitbox.x / 2) / BLOCK_SIZE),
            y: Math.round((this.position.y + this.hitbox.y) / BLOCK_SIZE),
        };
    }

    stanceCandidatesForBlock(target) {
        const candidates = [];
        for (const dy of [0, 1, 2, 3]) {
            for (const dx of [-1, 1, 0]) {
                const node = { x: target.x + dx, y: target.y + dy };
                if (getMinionStandability(this.world, this.dimension, node) !== false) {
                    candidates.push(node);
                }
            }
        }
        return candidates.sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b));
    }

    stanceCandidatesNear(point, xRadius = 2, yRadius = 3) {
        const candidates = [];
        for (let y = Math.max(2, point.y - yRadius);
            y <= Math.min(CHUNK_HEIGHT - 1, point.y + yRadius); y++) {
            for (let x = point.x - xRadius; x <= point.x + xRadius; x++) {
                const node = { x, y };
                if (getMinionStandability(this.world, this.dimension, node) !== false) {
                    candidates.push(node);
                }
            }
        }
        return candidates.sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b));
    }

    navigateTo(candidates, goalKey) {
        if (!candidates?.length) {
            this.pathFindingFails++;
            this.setUnreachable();
            return false;
        }
        this.pathTimer += runtime.deltaTime || 0;
        if (this.pathGoalKey !== goalKey || !this.path || this.pathTimer >= PATH_REFRESH_INTERVAL) {
            const start = this.currentFootNode();
            let bestPath = null;
            let bestCost = Infinity;
            const followRange = getMinionConfig().minionFollowRange;
            const maxVisited = this.job?.type === "follow"
                ? Math.max(256, Math.min(10_000, Math.floor(followRange ** 2)))
                : 2500;
            for (const goal of candidates.slice(0, 5)) {
                const path = findMinionPath(
                    this.world,
                    this.dimension,
                    start,
                    goal,
                    maxVisited,
                );
                if (!path) continue;
                const score = path.length;
                if (score < bestCost) bestPath = path;
                bestCost = score;
                break;
            }
            this.path = bestPath;
            this.pathGoalKey = goalKey;
            this.pathTimer = 0;
            if (!bestPath) {
                this.targetVelocity.x = 0;
                this.pathFindingFails++;
                if (this.pathFindingFails >= 3 && this.job) {
                    this.teleportToNode(candidates[0]);
                    this.pathFindingFails = 0;
                    return true;
                }
                this.setUnreachable();
                return false;
            }
            this.pathFindingFails = 0;
        }
        return this.followPath();
    }

    teleportToNode(node) {
        this.position.x = node.x * BLOCK_SIZE +
            (BLOCK_SIZE - this.hitbox.x) / 2;
        this.position.y = node.y * BLOCK_SIZE - this.hitbox.y;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.targetVelocity.x = 0;
        this.targetVelocity.y = 0;
        this.grounded = true;
        this.path = null;
        this.pathGoalKey = null;
        this.syncChunkMembership();
        this.broadcastState();
    }

    followPath() {
        if (!this.path?.length) return false;
        const current = this.currentFootNode();
        while (this.path.length > 1) {
            const next = this.path[1];
            if (current.x === next.x && Math.abs(current.y - next.y) <= 1) {
                this.path.shift();
            } else break;
        }
        const next = this.path[1];
        if (!next) {
            this.targetVelocity.x = 0;
            return true;
        }
        const direction = next.x > current.x ? 1 : -1;
        this.direction = direction;
        const destinationX = next.x * BLOCK_SIZE + BLOCK_SIZE / 2 - this.hitbox.x / 2;
        if (Math.abs(this.position.x - destinationX) <= 3 && current.x === next.x) {
            this.targetVelocity.x = 0;
            if (next.y < current.y && this.grounded) this.jump();
            return false;
        }

        if (next.y < current.y && this.grounded && current.x !== next.x) this.jump();
        const obstacleX = direction > 0
            ? this.position.x + this.hitbox.x + 2
            : this.position.x - 2;
        const obstacleTileX = Math.floor(obstacleX / BLOCK_SIZE);
        const obstacleRows = [next.y - 1, next.y - 2];
        for (const obstacleY of obstacleRows) {
            const block = this.blockAt(obstacleTileX, obstacleY);
            if (block && hasBlockCollision(block)) {
                if (!isMineable(block)) {
                    this.targetVelocity.x = 0;
                    this.setUnreachable();
                    return false;
                }
                this.targetVelocity.x = 0;
                this._navigationResumeState = this.state;
                this.workOnNavigationBlock(block, runtime.deltaTime || 0);
                return false;
            }
        }
        this.targetVelocity.x = direction * this.currentSpeed() * BLOCK_SIZE;
        return false;
    }

    workOnNavigationBlock(block, dt) {
        this.setHeldToolForBlock(block);
        const key = `${block.chunkX}:${block.x},${block.y}`;
        const workTime = Math.max(0.16, Math.min(2, getBlock(block.blockType).hardness * 0.25)) /
            (runtime.passedTime < this.workSpeedBonusUntil ? 2 : 1);
        this.beginMiningBlock(block, key);
        this.advanceMiningProgress(block, workTime, Math.min(dt, 0.1));
        if (this.miningTimer >= workTime) {
            if (!this.breakWorkerBlock(block)) {
                this.setUnreachable();
                return;
            }
            this.clearMiningProgress();
            this.state = this._navigationResumeState;
            this.path = null;
        }
    }

    setHeldToolForBlock(block) {
        const def = getBlock(block?.blockType);
        if (!def) return;
        const itemId = isWoodBlock(block) ||
            [ToolType.Axe, ToolType.Shears].includes(def.toolType)
            ? Items.IronAxe
            : def.toolType === ToolType.Shovel
                ? Items.IronShovel
                : Items.IronPickaxe;
        if (this.holdItem?.itemId === itemId) return;
        this.holdItem = new InventoryItem({ itemId, count: 1 });
    }

    findBestPathToPoint(point, radiusX = 3, radiusY = 4) {
        const candidates = this.stanceCandidatesNear(point, radiusX, radiusY);
        if (!candidates.length) return null;
        return candidates;
    }

    reserveCurrentTarget() {
        if (!this.currentTargetKey) return;
        if (!(this.world.minionReservations instanceof Map)) {
            this.world.minionReservations = new Map();
        }
        this.world.minionReservations.set(this.currentTargetKey, this.UUID);
    }

    releaseCurrentTarget() {
        if (this.currentTargetKey && this.world.minionReservations?.get(this.currentTargetKey) === this.UUID) {
            this.world.minionReservations.delete(this.currentTargetKey);
        }
        this.currentTargetKey = null;
    }

    isReserved(target) {
        const key = reservationKey(this.dimension, target);
        const ownerUUID = this.world.minionReservations?.get(key);
        return Boolean(ownerUUID && ownerUUID !== this.UUID &&
            this.world.entities.some((entity) => entity.UUID === ownerUUID && entity.isMinion));
    }

    finishOrWaitForReservations() {
        if (this.hasActiveJobReservations()) {
            this.targetVelocity.x = 0;
            return;
        }
        this.finishJob();
    }

    hasActiveJobReservations() {
        const reservations = this.world.minionReservations;
        if (!(reservations instanceof Map)) return false;
        const taskKey = (job) => job ? JSON.stringify({
            type: job.type,
            target: job.target,
            blockType: job.blockType,
            bounds: job.bounds,
            direction: job.direction,
        }) : null;
        for (const [key, ownerUUID] of reservations) {
            if (!key.startsWith(`${this.dimension}:`)) continue;
            const worker = this.world.entities.find((entity) => entity.UUID === ownerUUID);
            if (worker?.isMinion && worker.UUID !== this.UUID &&
                taskKey(worker.job) === taskKey(this.job)) return true;
        }
        return false;
    }

    finishJob() {
        this.releaseCurrentTarget();
        const hadItems = this.hasInventory();
        this.job = null;
        this.currentTarget = null;
        this.path = null;
        if (hadItems) this.beginDelivery();
        else this.state = MinionState.Idle;
    }

    setUnreachable() {
        this.releaseCurrentTarget();
        this.currentTarget = null;
        this.clearMiningProgress();
        this.state = MinionState.Unreachable;
        this.targetVelocity.x = 0;
        this.retryTimer = 2;
        this.path = null;
    }

    inventoryFull() {
        return this.inventory.every((item) => item.count > 0 && item.count >= itemStackLimit(item));
    }

    hasInventory() {
        return this.inventory.some((item) => item.count > 0 &&
            (item.blockId !== null || item.itemId !== null));
    }

    addToInventory(newItem) {
        return insertInventoryItem(this.inventory, newItem, itemStackLimit);
    }

    pickUpNearbyDrops() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        const drops = this.world.entities.filter((entity) =>
            entity.type === EntityTypes.Drop && entity.dimension === this.dimension &&
            entity.isReady !== false &&
            Math.abs(entity.position.x + entity.hitbox.x / 2 - centerX) <= BLOCK_SIZE * 1.2 &&
            Math.abs(entity.position.y + entity.hitbox.y / 2 - centerY) <= BLOCK_SIZE * 1.6,
        );
        for (const drop of drops) {
            const incoming = new InventoryItem({
                blockId: drop.blockId,
                itemId: drop.itemId,
                count: drop.count,
                props: structuredClone(drop.props || {}),
            });
            const left = this.addToInventory(incoming);
            const added = drop.count - left;
            if (added <= 0) {
                if (this.hasInventory()) this.beginDelivery();
                return;
            }
            drop.count = left;
            if (drop.count <= 0) this.world.removeEntity(drop, multiplayer);
            if (left > 0 || this.inventoryFull()) {
                this.beginDelivery();
                return;
            }
        }
    }

    collectNearbyDrops() {
        this.pickUpNearbyDrops();
    }

    beginDelivery() {
        if (!this.hasInventory()) return false;
        if (this.state !== MinionState.DeliveringResources) {
            this.resumeTaskAfterDelivery = cloneData(this.job);
        }
        this.state = MinionState.DeliveringResources;
        this.deliveryActive = true;
        this.path = null;
        this.pathGoalKey = null;
        return true;
    }

    deliverInventory(dt) {
        if (!this.hasInventory()) {
            this.deliveryActive = false;
            this.job = this.resumeTaskAfterDelivery;
            this.resumeTaskAfterDelivery = null;
            this.state = this.stateForJob(this.job);
            if (this.job?.type === "return") this.state = MinionState.ReturningToOwner;
            return;
        }
        if (this.deliveryDestination) {
            this.deliverToContainer(dt);
            return;
        }
        const owner = this.getOwner();
        if (!owner) return this.setUnreachable();
        const point = {
            x: Math.floor((owner.position.x + owner.hitbox.x / 2) / BLOCK_SIZE),
            y: Math.round((owner.position.y + owner.hitbox.y) / BLOCK_SIZE),
        };
        const candidates = this.stanceCandidatesNear(point, 3, 4);
        if (!this.navigateTo(candidates, `owner:${owner.UUID}`)) return;
        if (Math.abs(this.position.x - owner.position.x) > BLOCK_SIZE * 2.2) return;
        this.transferToOwner(owner);
    }

    transferToOwner(owner) {
        for (const slot of this.inventory) {
            if (slot.count <= 0) continue;
            const offered = slot.count;
            const remainder = owner.inventory.addItem(copyInventoryItem(slot));
            const accepted = offered - remainder;
            slot.count = remainder;
            if (slot.count > 0) {
                this.world.spawnDrop(
                    new Vector2(owner.position.x + owner.hitbox.x, owner.position.y),
                    {
                        blockId: slot.blockId,
                        itemId: slot.itemId,
                        count: slot.count,
                        props: structuredClone(slot.props || {}),
                    },
                );
                slot.count = 0;
            }
            if (accepted > 0 && multiplayer) owner.inventory.syncInventoryMultiplayer();
            slot.blockId = null;
            slot.itemId = null;
            slot.props = {};
        }
        this.job = this.resumeTaskAfterDelivery;
        this.resumeTaskAfterDelivery = null;
        this.deliveryActive = false;
        this.state = this.stateForJob(this.job);
        if (this.job?.type === "return") this.state = MinionState.FollowingOwner;
    }

    deliverToContainer(dt) {
        const destination = this.deliveryDestination;
        if (!destination || destination.dimension !== this.dimension) return this.setUnreachable();
        const block = this.blockAt(destination.x, destination.y);
        const storage = block?.metaData?.storage;
        if (!storage || !Array.isArray(storage) || storage.flat().length <= 23) {
            this.deliveryDestination = null;
            return this.setUnreachable();
        }
        const candidates = this.stanceCandidatesForBlock(destination);
        if (!this.navigateTo(candidates, `chest:${destination.x}:${destination.y}`)) return;
        const remaining = this.transferToStorage(storage);
        block.syncMetaData();
        if (multiplayer) this.world.uploadChunkToServer(block.chunkX, this.dimension);
        if (remaining) {
            this.state = MinionState.Unreachable;
            this.retryTimer = 5;
            this.targetVelocity.x = 0;
            return;
        }
        this.job = this.resumeTaskAfterDelivery;
        this.resumeTaskAfterDelivery = null;
        this.deliveryActive = false;
        this.state = this.stateForJob(this.job);
        if (this.job?.type === "return") this.state = MinionState.FollowingOwner;
    }

    transferToStorage(storage) {
        return transferInventoryToStorage(this.inventory, storage, itemStackLimit);
    }

    returnToOwner() {
        if (this.hasInventory()) return this.beginDelivery();
        const owner = this.getOwner();
        if (!owner) return this.setUnreachable();
        const point = {
            x: Math.floor((owner.position.x + owner.hitbox.x / 2) / BLOCK_SIZE),
            y: Math.round((owner.position.y + owner.hitbox.y) / BLOCK_SIZE),
        };
        if (this.navigateTo(this.stanceCandidatesNear(point, 3, 4), `owner:${owner.UUID}`)) {
            this.job = { type: "follow" };
            this.state = MinionState.FollowingOwner;
        }
    }

    dropInventory() {
        for (const item of this.inventory) {
            if (item.count <= 0) continue;
            this.world.spawnDrop(
                new Vector2(this.position.x, this.position.y),
                {
                    blockId: item.blockId,
                    itemId: item.itemId,
                    count: item.count,
                    props: structuredClone(item.props || {}),
                },
            );
            item.blockId = null;
            item.itemId = null;
            item.count = 0;
            item.props = {};
        }
    }

    carryEntity() {
        const targetUUID = this.job?.targetUUID;
        const target = this.world.entities.find((entity) =>
            entity.UUID === targetUUID && entity !== this && entity.dimension === this.dimension,
        );
        if (!target) return this.finishJob();
        if (target.carriedByMinionUUID === this.UUID) {
            this.carriedEntityUUID = target.UUID;
            if (target === this.world.player) {
                this.targetVelocity.x = target.targetVelocity.x;
                if (target.velocity.y < -BLOCK_SIZE && this.grounded) this.jump();
                target.velocity.y = 0;
                return;
            }
            if (this.job?.destination === "owner") {
                const owner = this.getOwner();
                if (owner && Math.abs(this.position.x - owner.position.x) <= BLOCK_SIZE * 2) {
                    target.carriedByMinionUUID = null;
                    target.targetVelocity.x = 0;
                    this.carriedEntityUUID = null;
                    return this.finishJob();
                }
                if (owner) {
                    const point = {
                        x: Math.floor((owner.position.x + owner.hitbox.x / 2) / BLOCK_SIZE),
                        y: Math.round((owner.position.y + owner.hitbox.y) / BLOCK_SIZE),
                    };
                    this.navigateTo(this.stanceCandidatesNear(point, 3, 4), `owner:${owner.UUID}`);
                }
            }
            return;
        }
        const targetTile = {
            x: Math.floor((target.position.x + target.hitbox.x / 2) / BLOCK_SIZE),
            y: Math.round((target.position.y + target.hitbox.y) / BLOCK_SIZE),
        };
        if (Math.abs(this.position.x - target.position.x) > BLOCK_SIZE * 1.2 ||
            Math.abs(this.position.y - target.position.y) > BLOCK_SIZE) {
            this.navigateTo(this.stanceCandidatesNear(targetTile, 2, 3), `entity:${target.UUID}`);
            return;
        }
        target.carriedByMinionUUID = this.UUID;
        target.targetVelocity.x = 0;
        target.velocity.x = 0;
        this.carriedEntityUUID = target.UUID;
        this.job.destination = "owner";
    }

    getCarryPosition(entity) {
        return new Vector2(
            this.position.x + (this.hitbox.x - entity.hitbox.x) / 2,
            this.position.y - entity.hitbox.y,
        );
    }

    encourage() {
        this.workSpeedBonusUntil = runtime.passedTime + 30;
    }

    currentSpeed() {
        return this.speed * (runtime.passedTime < this.workSpeedBonusUntil ? 2 : 1);
    }

    releaseCarriedEntity() {
        const target = this.carriedEntityUUID
            ? this.world.entities.find((entity) => entity.UUID === this.carriedEntityUUID)
            : null;
        if (target?.carriedByMinionUUID === this.UUID) {
            target.carriedByMinionUUID = null;
            target.targetVelocity.x = 0;
            target.velocity.x = 0;
        }
        this.carriedEntityUUID = null;
    }

    workOnShaftOrTunnel(dt) {
        if (!this.job?.started) {
            this.state = MinionState.MovingToTarget;
            return this.moveForCurrentTask();
        }
        if (this.job.type === "mineshaft") {
            if (this.job.currentY >= this.job.targetY) {
                return this.finishJob();
            }
            this.digNextShaftStep(dt);
            return;
        }
        if (this.job.type === "stripmine") {
            this.digNextTunnelStep(dt);
        }
    }

    digNextShaftStep(dt) {
        const direction = this.job.direction < 0 ? -1 : 1;
        const targetX = this.job.currentX + direction;
        const targetFootY = this.job.currentY + 1;
        for (const y of [this.job.currentY, this.job.currentY - 1]) {
            const block = this.blockAt(targetX, y);
            if (block && !getBlock(block.blockType).air) {
                if (!isMineable(block)) return this.setUnreachable();
                this.state = MinionState.Excavating;
                this.workOnNavigationBlock(block, dt);
                return;
            }
        }
        const floor = this.blockAt(targetX, targetFootY);
        if (!floor || !hasBlockCollision(floor)) return this.setUnreachable();
        this.targetVelocity.x = direction * this.currentSpeed() * BLOCK_SIZE;
        const feet = this.currentFootNode();
        if (feet.x === targetX && feet.y >= targetFootY - 1) {
            this.job.currentX = targetX;
            this.job.currentY = targetFootY;
            this.job.steps++;
            this.path = null;
        }
    }

    digNextTunnelStep(dt) {
        if (this.job.steps >= 80) return this.finishJob();
        const direction = this.job.direction < 0 ? -1 : 1;
        const targetX = this.job.currentX + direction;
        const targetBlocks = [
            this.blockAt(targetX, this.job.currentY - 1),
            this.blockAt(targetX, this.job.currentY - 2),
        ].filter(Boolean);
        for (const block of targetBlocks) {
            if (getBlock(block.blockType).air) continue;
            if (this.isValuableBlock(block)) {
                this.startVeinInterruption(block);
                return;
            }
            if (!isMineable(block)) return this.setUnreachable();
            this.state = MinionState.Excavating;
            this.workOnNavigationBlock(block, dt);
            return;
        }
        const roof = this.blockAt(targetX, this.job.currentY - 3);
        if (roof && this.isValuableBlock(roof) && isMineable(roof)) {
            this.startVeinInterruption(roof);
            return;
        }
        this.targetVelocity.x = direction * this.currentSpeed() * BLOCK_SIZE;
        const feet = this.currentFootNode();
        if (feet.x === targetX) {
            this.job.currentX = targetX;
            this.job.steps++;
        }
    }

    isValuableBlock(block) {
        const name = blockName(block);
        if (getBlock(block.blockType).air) return false;
        const normalizedName = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
        const config = getMinionConfig();
        if (config.worthlessBlockIds.includes(block.blockType) ||
            config.worthlessBlockNames.some((entry) => name.includes(entry.toLowerCase()))) {
            return false;
        }
        return !DEFAULT_WORTHLESS_BLOCKS.has(normalizedName) &&
            !/(?:^|\s)leaves?$/.test(normalizedName);
    }

    startVeinInterruption(block) {
        this._activeVein = this.connectedBlocks({
            x: Math.floor(block.transform.position.x / BLOCK_SIZE),
            y: Math.floor(block.transform.position.y / BLOCK_SIZE),
        }, (candidate) => candidate.blockType === block.blockType, MAX_VEIN_BLOCKS, false);
        const target = this._activeVein
            .filter((entry) => !this.isReserved(entry))
            .sort((a, b) => this.distanceToTile(a) - this.distanceToTile(b))[0];
        if (!target) return;
        this.selectWorkTarget(target, MinionState.Mining);
        this.job.type = "stripmine";
        this._activeVeinReturnState = MinionState.Excavating;
    }

    updateNetworkState(dt) {
        if (!multiplayer || this.ownerUUID !== runtime.world?.player?.UUID) return;
        this.syncTimer += dt;
        const owner = runtime.world.player;
        if (!Number.isFinite(owner.minionPersistAt)) {
            owner.minionPersistAt = runtime.passedTime + 5;
        }
        if (runtime.passedTime >= owner.minionPersistAt) {
            owner.minionPersistAt = runtime.passedTime + 5;
            this.persistOwnerMinions();
        }
        if (this.syncTimer < 0.2) return;
        this.syncTimer = 0;
        if (Math.abs(this.position.x - this.lastSyncedX) < 2 &&
            Math.abs(this.position.y - this.lastSyncedY) < 2) return;
        this.lastSyncedX = this.position.x;
        this.lastSyncedY = this.position.y;
        runtime.server.send({
            type: "minionState",
            sender: this.ownerUUID,
            message: {
                UUID: this.UUID,
                position: { x: this.position.x, y: this.position.y },
                direction: this.direction,
                state: this.state,
                dimension: this.dimension,
                carriedEntityUUID: this.carriedEntityUUID,
            },
        });
    }

    broadcastState() {
        if (!multiplayer || this.ownerUUID !== runtime.world?.player?.UUID) return;
        runtime.server.send({
            type: "minionState",
            sender: this.ownerUUID,
            message: {
                UUID: this.UUID,
                position: { x: this.position.x, y: this.position.y },
                direction: this.direction,
                state: this.state,
                dimension: this.dimension,
                carriedEntityUUID: this.carriedEntityUUID,
            },
        });
        this.persistOwnerMinions();
    }

    persistOwnerMinions() {
        const owner = runtime.world?.player;
        if (!multiplayer || !owner || this.ownerUUID !== owner.UUID) return;
        runtime.server.send({
            type: "minionPersist",
            sender: owner.UUID,
            message: {
                minions: this.world.entities
                    .filter((entity) => entity.isMinion &&
                        entity.ownerUUID === owner.UUID && entity.health > 0)
                    .map((entity) => entity.createSaveData()),
                xpLevel: owner.xpLevel,
                minionProgress: owner.minionProgress,
            },
        });
    }

    dieEvent() {
        this.releaseCarriedEntity();
        this.dropInventory();
        this.releaseCurrentTarget();
        this.world.removeEntity(this, multiplayer);
        this.persistOwnerMinions();
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
    }

    interact() {}
}

export function normalizeMinionSaveData(data, ownerUUID) {
    if (!data || typeof data.UUID !== "string" ||
        typeof data.ownerUUID !== "string" || data.ownerUUID !== ownerUUID ||
        !Number.isFinite(data.position?.x) || !Number.isFinite(data.position?.y) ||
        !Number.isFinite(data.health) || data.health <= 0) return null;
    const dimension = Number.isInteger(data.dimension) ? data.dimension : Dimensions.Overworld;
    if (![Dimensions.Overworld, Dimensions.Nether, Dimensions.End].includes(dimension)) return null;
    const inventory = Array.isArray(data.inventory)
        ? data.inventory.slice(0, MINION_INVENTORY_SLOTS).map(copyInventoryItem)
        : [];
    return {
        UUID: data.UUID,
        ownerUUID,
        position: new Vector2(data.position.x, data.position.y),
        health: Math.min(20, data.health),
        dimension,
        direction: data.direction < 0 ? -1 : 1,
        job: validTask(data.job),
        inventory,
        deliveryDestination: data.deliveryDestination,
        carriedEntityUUID: typeof data.carriedEntityUUID === "string" &&
            data.carriedEntityUUID.length <= 64
            ? data.carriedEntityUUID
            : null,
        deliveryActive: data.deliveryActive === true,
    };
}
