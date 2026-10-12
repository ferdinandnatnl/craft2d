import { Body, BodyPart } from "../../game/body.js";
import { InventoryItem } from "../../game/inventoryItem.js";
import { AquaticMob, isAquaticWaterBlock } from "./aquatic.js";
import { EntityTypes } from "../../game/entity.js";
import { entityRegistry } from "../entityRegistry.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { playPositionalSound, playRandomSoundFromArray } from "../../game/sounds.js";
import { Sounds } from "@2dcraft.com/shared/sounds.js";

const CATFISH_BUCKETS = Object.freeze([
    Items.SmallCatfishBucket,
    Items.MediumCatfishBucket,
    Items.LargeCatfishBucket,
]);
const CATFISH_DIMENSIONS = Object.freeze([
    { width: 0.9, height: 0.6, health: 10, slots: 3, atlas: 64, body: { x: 22, y: 14, width: 14, height: 6 } },
    { width: 1.25, height: 0.9, health: 20, slots: 9, atlas: 128, body: { x: 32, y: 29, width: 18, height: 11 } },
    { width: 1.9, height: 0.9, health: 30, slots: 1, atlas: 128, body: { x: 46, y: 33, width: 26, height: 15 } },
]);
const SWALLOWED_STATE_KEYS = Object.freeze([
    "UUID", "tamed", "ownerUUID", "sitting", "command", "desert", "variant",
    "babyAgeTicks", "stunTicks", "hasEgg",
]);

export class Catfish extends AquaticMob {
    static spawnInWater = true;
    static spawnSize = Object.freeze({ width: 0.9, height: 0.6 });

    static spawnSizeFor(size) {
        const definition = CATFISH_DIMENSIONS[clampSize(size)];
        return { width: definition.width, height: definition.height };
    }

    static randomSpawnSize(biomeName) {
        return catfishSpawnSize(biomeName);
    }

    constructor(world, {
        catfishSize,
        catfishSpawnReason = "natural",
        health,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        UUID,
        fromBucket = false,
        stomachItems = [],
        swallowedEntity = null,
        spitTime = 0,
        eatCooldown = 0,
    } = {}) {
        const size = Number.isInteger(catfishSize)
            ? clampSize(catfishSize)
            : chooseSpawnSize(world, position, catfishSpawnReason);
        const definition = CATFISH_DIMENSIONS[size];
        const maxHealth = definition.health;
        super(world, {
            species: "Catfish",
            health: Math.min(Number.isFinite(health) ? health : maxHealth, maxHealth),
            noAi,
            position,
            invulnerable,
            UUID,
            myChunkX,
            despawn: !fromBucket && !stomachItems.length && !swallowedEntity,
        });

        this.entityTypeName = "Catfish";
        this.isCatfish = true;
        this.isAquatic = true;
        this.catfishSize = size;
        this.hitbox = new Vector2(definition.width * BLOCK_SIZE, definition.height * BLOCK_SIZE);
        this.body = createCatfishBody(size, definition);
        this.maxHealth = maxHealth;
        this.health = Math.min(Number.isFinite(health) ? health : maxHealth, maxHealth);
        this.fromBucket = fromBucket === true;
        this.stomachItems = normalizeStomach(stomachItems, definition.slots);
        this.swallowedEntity = normalizeSwallowedEntity(swallowedEntity);
        this.spitTime = clampTicks(spitTime, 10);
        this.eatCooldown = clampTicks(eatCooldown, 120);
        this.foodScanTicks = randomRange(50, 100);
        this.foodTarget = null;
        this.lanternScanTicks = randomRange(70, 140);
        this.lanternTargetBlock = null;
        this.lanternChillTicks = 0;
        this.lanternChillTime = randomRange(10, 30);
        this.speed = 0.7;
        this.swimSpeed = this.speed * BLOCK_SIZE;
        this.maxVelocity.x = this.swimSpeed * 1.5;
        this.lootTable = new LootTable([
            new LootItem({
                itemId: Items.RawCatfish,
                maxCount: size === 0 ? 1 : size === 1 ? 3 : 6,
                subtract: size === 0 ? 1 : size === 1 ? 1 : 2,
            }),
        ]);
        this.swimPhase = randomRange(0, Math.PI * 2);
        this.targetPosition = null;
        this.targetTimer = 0;
        this.drag = 0;
        this.updateDespawnState();
    }

    update() {
        if (!this.noAi && this.foodTarget && this.isFoodTargetValid(this.foodTarget)) {
            this.targetPosition = new Vector2(
                this.foodTarget.position.x + this.foodTarget.hitbox.x / 2,
                this.foodTarget.position.y + this.foodTarget.hitbox.y / 2,
            );
            this.targetTimer = 0.25;
        } else {
            this.foodTarget = null;
            const playerWithLantern = this.noAi ? null : this.findLanternPlayer();
            const target = playerWithLantern
                ? this.findWaterPositionNear(this.getEntityCenter(playerWithLantern))
                : this.lanternTargetBlock && !this.isFull()
                  ? this.findWaterPositionNear(this.lanternTargetBlock)
                  : null;
            this.targetPosition = target;
            this.targetTimer = target ? 0.25 : 0;
        }
        this.swimLogic();
        this.updateEntity();
        this.tryEatFoodTarget();
    }

    tickUpdate() {
        this.entityTickUpdate();
        if (this.spitTime > 0) this.spitTime--;
        if (this.eatCooldown > 0) this.eatCooldown--;
        if (this.foodScanTicks > 0) this.foodScanTicks--;
        if (this.foodScanTicks <= 0) {
            this.foodScanTicks = randomRange(50, 100);
            if (!this.noAi && this.isInWater() && this.eatCooldown <= 0 && !this.isFull()) {
                this.foodTarget = this.findFoodTarget();
            }
        }

        if (!this.noAi) {
            this.lanternScanTicks--;
            if (this.lanternScanTicks <= 0) {
                this.lanternScanTicks = randomRange(70, 140);
                this.lanternTargetBlock = this.isInWater() && !this.isFull()
                    ? this.findFascinatingLantern()
                    : null;
                this.lanternChillTicks = 0;
                this.lanternChillTime = randomRange(10, 30);
            }
            this.updateLanternInterest();
        }

        const pickle = this.findSeaPickleContact();
        if (pickle && this.canSpit()) {
            if (this.spitTime === 0) {
                playPositionalSound(this.position, "player/burp.ogg");
            }
            this.spit();
        }
    }

    swimLogic() {
        const dt = Math.min(runtime.deltaTime || 0.05, 0.1);
        this.swimPhase = (this.swimPhase + dt * 10) % (Math.PI * 2);
        super.swimLogic();
        if (this.body?.parts?.body) {
            this.body.parts.body.rotation = Math.sin(this.swimPhase) * 2.5;
        }
        if (this.body?.parts?.tail) {
            this.body.parts.tail.rotation = Math.sin(this.swimPhase * 1.8) * 28;
        }
    }

    isInWater() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        return isAquaticWaterBlock(
            this.world.getBlockAtWorldPosition(centerX, centerY, false, this.dimension),
        );
    }

    findLanternPlayer() {
        const players = new Set(this.world.entities || []);
        if (this.world.player) players.add(this.world.player);
        return [...players]
            .filter((player) =>
                player !== this &&
                player.type === EntityTypes.Player &&
                player.health > 0 &&
                player.dimension === this.dimension &&
                player.holdItem?.itemId === Items.SeaLantern &&
                distanceBetween(this, player) <= BLOCK_SIZE * 10,
            )
            .sort((a, b) => distanceBetween(this, a) - distanceBetween(this, b))[0] || null;
    }

    findFascinatingLantern() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        const originX = Math.floor(centerX / BLOCK_SIZE);
        const originY = Math.floor(centerY / BLOCK_SIZE);
        let nearest = null;
        for (let dy = -8; dy <= 2; dy++) {
            for (let dx = -16; dx <= 16; dx++) {
                const x = (originX + dx + 0.5) * BLOCK_SIZE;
                const y = (originY + dy + 0.5) * BLOCK_SIZE;
                const block = this.world.getBlockAtWorldPosition(x, y, false, this.dimension);
                if (block?.blockType !== Blocks.SeaLantern) continue;
                const distance = Math.hypot(x - centerX, y - centerY);
                if (distance > BLOCK_SIZE * 16 || (nearest && distance >= nearest.distance)) continue;
                if (!this.findWaterPositionNear(new Vector2(x, y))) continue;
                nearest = { x, y, distance };
            }
        }
        return nearest ? new Vector2(nearest.x, nearest.y) : null;
    }

    findWaterPositionNear(position) {
        const originX = Math.floor(position.x / BLOCK_SIZE);
        const originY = Math.floor(position.y / BLOCK_SIZE);
        let nearest = null;
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                const x = (originX + dx + 0.5) * BLOCK_SIZE;
                const y = (originY + dy + 0.5) * BLOCK_SIZE;
                const target = new Vector2(x, y);
                if (!isAquaticWaterBlock(
                    this.world.getBlockAtWorldPosition(x, y, false, this.dimension),
                ) || !this.isWaterPosition(target)) continue;
                const distance = Math.hypot(x - position.x, y - position.y);
                if (!nearest || distance < nearest.distance) nearest = { target, distance };
            }
        }
        return nearest?.target || null;
    }

    getEntityCenter(entity) {
        return new Vector2(
            entity.position.x + entity.hitbox.x / 2,
            entity.position.y + entity.hitbox.y / 2,
        );
    }

    updateLanternInterest() {
        const lantern = this.lanternTargetBlock;
        if (!lantern) return;
        const block = this.world.getBlockAtWorldPosition(
            lantern.x,
            lantern.y,
            false,
            this.dimension,
        );
        if (block?.blockType !== Blocks.SeaLantern || !this.isInWater() || this.isFull()) {
            this.lanternTargetBlock = null;
            return;
        }
        const distance = Math.hypot(
            lantern.x - (this.position.x + this.hitbox.x / 2),
            lantern.y - (this.position.y + this.hitbox.y / 2),
        );
        if (distance < BLOCK_SIZE * 1.25) {
            this.lanternChillTicks++;
            if (this.lanternChillTicks > this.lanternChillTime) {
                this.lanternTargetBlock = null;
                this.lanternScanTicks = randomRange(70, 140);
            }
        } else {
            this.lanternChillTicks = 0;
        }
    }

    findSeaPickleContact() {
        const firstX = Math.floor(this.position.x / BLOCK_SIZE);
        const lastX = Math.floor((this.position.x + this.hitbox.x - 1) / BLOCK_SIZE);
        const firstY = Math.floor(this.position.y / BLOCK_SIZE);
        const lastY = Math.floor((this.position.y + this.hitbox.y - 1) / BLOCK_SIZE);
        for (let x = firstX; x <= lastX; x++) {
            for (let y = firstY; y <= lastY; y++) {
                const block = this.world.getBlockAtWorldPosition(
                    (x + 0.5) * BLOCK_SIZE,
                    (y + 0.5) * BLOCK_SIZE,
                    false,
                    this.dimension,
                );
                if (block?.blockType === Blocks.SeaPickle) return block;
            }
        }
        return null;
    }

    findFoodTarget() {
        const candidates = this.world.entities.filter((entity) =>
            entity !== this && entity.dimension === this.dimension &&
            this.isFoodTargetValid(entity),
        );
        const player = this.world.player;
        if (player && player !== this && player.dimension === this.dimension &&
            this.catfishSize === 2 && player.abilities?.hasHealth &&
            distanceBetween(this, player) <= BLOCK_SIZE * 8) {
            candidates.push(player);
        }
        candidates.sort((a, b) => distanceBetween(this, a) - distanceBetween(this, b));
        return candidates[0] || null;
    }

    isFoodTargetValid(entity) {
        if (!entity || entity.health <= 0 || entity.dimension !== this.dimension) return false;
        const distance = distanceBetween(this, entity);
        if (distance > BLOCK_SIZE * 8) return false;
        if (entity.type === EntityTypes.Drop) {
            return this.catfishSize < 2 && entity.itemId != null && entity.count > 0 &&
                entity.isReady !== false &&
                (runtime.passedTime || 0) - (entity.spawnedAt || 0) >= 1.75 &&
                !this.isFull();
        }
        if (entity.type === EntityTypes.Player) {
            return this.catfishSize === 2 && Boolean(entity.abilities?.hasHealth);
        }
        if (this.catfishSize !== 2 ||
            entity.isCatfish || entity.type !== EntityTypes.Mob || entity.hitbox.y > BLOCK_SIZE) return false;
        const typeName = entity.entityTypeName || entity.name?.replaceAll(" ", "");
        return Boolean(entityRegistry.Entities?.[typeName]);
    }

    tryEatFoodTarget() {
        const food = this.foodTarget;
        if (!food || !this.isFoodTargetValid(food)) {
            this.foodTarget = null;
            return;
        }
        const eatDistance = this.hitbox.x * 0.65 + food.hitbox.x;
        if (distanceBetween(this, food) >= eatDistance) return;
        if (food.type === EntityTypes.Drop) {
            this.pickUpItem(food);
        } else if (food.type === EntityTypes.Player) {
            food.hit(12000, this.position.x, 0, "Eaten by a Catfish", this);
        } else if (this.swallowEntity(food)) {
            this.world.removeEntity(food, multiplayer);
            this.eatCooldown = randomRange(60, 120);
        }
        this.foodTarget = null;
    }

    pickUpItem(drop) {
        if (!drop || drop.itemId == null || this.isFull()) return false;
        const remaining = this.addStomachItem({ itemId: drop.itemId, count: drop.count });
        const pickedUp = drop.count - remaining;
        if (pickedUp <= 0) return false;
        if (remaining <= 0) this.world.removeEntity(drop, multiplayer);
        else drop.count = remaining;
        this.eatCooldown = randomRange(60, 120);
        this.updateDespawnState();
        return true;
    }

    addStomachItem(entry) {
        if (this.catfishSize === 2 || !entry || !Number.isInteger(entry.itemId)) return entry?.count || 0;
        let remaining = Math.max(0, Math.floor(entry.count));
        const itemMax = getItem(entry.itemId)?.stackSize || 64;
        for (const stack of this.stomachItems) {
            if (stack.itemId !== entry.itemId || stack.count >= itemMax) continue;
            const amount = Math.min(remaining, itemMax - stack.count);
            stack.count += amount;
            remaining -= amount;
            if (!remaining) return 0;
        }
        const capacity = CATFISH_DIMENSIONS[this.catfishSize].slots;
        while (remaining > 0 && this.stomachItems.length < capacity) {
            const amount = Math.min(remaining, itemMax);
            this.stomachItems.push({ itemId: entry.itemId, count: amount });
            remaining -= amount;
        }
        this.updateDespawnState();
        return remaining;
    }

    isFull() {
        if (this.catfishSize === 2) return Boolean(this.swallowedEntity);
        return this.stomachItems.length >= CATFISH_DIMENSIONS[this.catfishSize].slots;
    }

    swallowEntity(entity) {
        if (this.catfishSize !== 2 || this.swallowedEntity || !this.isFoodTargetValid(entity)) return false;
        const type = entity.entityTypeName || entity.name?.replaceAll(" ", "");
        this.swallowedEntity = {
            type,
            health: Number.isFinite(entity.health) ? entity.health : 1,
            state: captureSwallowedState(entity),
        };
        this.eatCooldown = randomRange(60, 120);
        this.updateDespawnState();
        return true;
    }

    canSpit() {
        return this.catfishSize === 2
            ? Boolean(this.swallowedEntity)
            : this.stomachItems.length > 0;
    }

    spit() {
        this.spitTime = 10;
        this.eatCooldown = randomRange(60, 120);
        if (this.catfishSize === 2) this.spitSwallowedEntity();
        else this.spitStomachItem();
        this.updateDespawnState();
    }

    spitStomachItem() {
        const index = this.stomachItems.findIndex((entry) => entry.count > 0);
        if (index < 0) return false;
        const [entry] = this.stomachItems.splice(index, 1);
        const drop = this.world.spawnDrop(this.getMouthPosition(), entry);
        if (drop) drop.pickupDelayUntil = (runtime.passedTime || 0) + 1.5;
        return true;
    }

    spitSwallowedEntity() {
        const contained = this.swallowedEntity;
        const EntityType = entityRegistry.Entities?.[contained?.type];
        if (!contained || typeof EntityType !== "function") return false;
        const spawnPosition = this.getMouthPosition();
        const spawnChunk = this.world.getChunkForX(spawnPosition.x, this.dimension);
        if (!spawnChunk) return false;
        const spawned = this.world.summonEntity(EntityType, spawnPosition, {
            ...contained.state,
            health: contained.health,
            dimension: this.dimension,
            myChunkX: spawnChunk.x,
        }, multiplayer);
        if (!spawned) return false;
        spawned.dimension = this.dimension;
        spawned.myChunkX = spawnChunk.x;
        if (!spawnChunk.entities.includes(spawned)) spawnChunk.entities.push(spawned);
        const restoredHealth = Math.max(2, (spawned.maxHealth || spawned.health || 2) * 0.25);
        spawned.health = Math.min(spawned.maxHealth || restoredHealth, restoredHealth);
        this.swallowedEntity = null;
        return true;
    }

    getMouthPosition() {
        const facing = this.direction < 0 ? -1 : 1;
        return new Vector2(
            this.position.x + this.hitbox.x / 2 + facing * this.hitbox.x * 0.4,
            this.position.y + this.hitbox.y * 0.25,
        );
    }

    hit(damage, hitfromX = 0, kb = 0) {
        const healthBefore = this.health;
        super.hit(damage, hitfromX, kb);
        if (this.health < healthBefore && this.health > 0) {
            playRandomSoundFromArray({
                array: Sounds.Cod_Hurt,
                positional: true,
                origin: this.position,
            });
        }
        if (this.health < healthBefore) this.spit();
    }

    dieEvent() {
        playRandomSoundFromArray({
            array: Sounds.Cod_Death,
            positional: true,
            origin: this.position,
        });
        if (runtime.GAMERULES.doMobLoot) {
            const cooked = this.fire > this.fireMin;
            for (const item of this.lootTable?.getRandomLoot() || []) {
                this.world.spawnDrop(this.position, {
                    itemId: cooked ? Items.CookedCatfish : item.itemId,
                    count: item.count,
                });
            }
        }
        for (const item of this.stomachItems) {
            this.world.spawnDrop(this.position, item);
        }
        this.stomachItems = [];
        if (this.catfishSize === 2) this.spitSwallowedEntity();
        this.world.removeEntity(this, multiplayer);
    }

    interact(player, item) {
        if (item?.itemId === Items.SeaPickle) {
            this.spit();
            return true;
        }
        if (item?.itemId !== Items.Bucket) return false;
        const bucketItem = CATFISH_BUCKETS[this.catfishSize];
        const bucketData = this.createBucketData();
        if (player.abilities?.instaBuild) {
            if (player.inventory.addItem(new InventoryItem({ itemId: bucketItem, count: 1, props: bucketData })) > 0) {
                return false;
            }
        } else {
            player.removeFromCurrentSlot();
            const remaining = player.inventory.addItem(new InventoryItem({
                itemId: bucketItem,
                count: 1,
                props: bucketData,
            }));
            if (remaining > 0) {
                player.inventory.addItem(new InventoryItem({ itemId: Items.Bucket, count: 1 }));
                return false;
            }
        }
        this.world.removeEntity(this, multiplayer);
        return true;
    }

    createBucketData() {
        return {
            catfishSize: this.catfishSize,
            health: this.health,
            fromBucket: true,
            stomachItems: this.stomachItems.map((entry) => ({ ...entry })),
            swallowedEntity: this.swallowedEntity ? structuredClone(this.swallowedEntity) : null,
        };
    }

    createSaveData() {
        return {
            UUID: this.UUID,
            position: { x: this.position.x, y: this.position.y },
            dimension: this.dimension,
            health: this.health,
            catfishSize: this.catfishSize,
            fromBucket: this.fromBucket,
            stomachItems: this.stomachItems.map((entry) => ({ ...entry })),
            swallowedEntity: this.swallowedEntity ? structuredClone(this.swallowedEntity) : null,
            spitTime: this.spitTime,
            eatCooldown: this.eatCooldown,
        };
    }

    updateDespawnState() {
        this.despawn = !this.fromBucket && !this.stomachItems.length && !this.swallowedEntity;
    }
}

export function catfishSpawnSize(biomeName, random = Math.random) {
    let size = random() < 0.35 ? 1 : 0;
    if (random() < 0.1 && (biomeName === "Swamp" || biomeName === "Mangrove Swamp")) size = 2;
    return size;
}

function createCatfishBody(size, definition) {
    const sizeName = ["small", "medium", "large"][size];
    const tailCrop = size === 0
        ? { x: 14, y: 31, width: 10, height: 5 }
        : size === 1
          ? { x: 29, y: 49, width: 19, height: 8 }
          : { x: 32, y: 61, width: 20, height: 11 };
    const renderScale = definition.atlas / 16;
    const centerOffset = {
        x: definition.width * 16 / (4 * renderScale),
        y: definition.height * 32 / renderScale,
    };
    return new Body({
        sprite: `alexsmobs/catfish_${sizeName}.png`,
        renderScale,
        parts: {
            tail: new BodyPart({
                spriteCrop: tailCrop,
                offset: { x: centerOffset.x + definition.body.width * 0.35, y: centerOffset.y },
                rotationOrigin: { x: -12, y: 0 },
                flip: true,
                zIndex: -1,
            }),
            body: new BodyPart({
                spriteCrop: definition.body,
                offset: centerOffset,
                flip: true,
                zIndex: 1,
            }),
        },
    });
}

function chooseSpawnSize(world, position, reason) {
    const biomeName = world?.getChunkForX?.(position.x, 0)?.biome?.name;
    return catfishSpawnSize(reason === "spawn_egg" ? "Swamp" : biomeName);
}

function normalizeStomach(items, capacity) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, capacity).flatMap((entry) =>
        Number.isInteger(entry?.itemId) && Number.isFinite(entry.count) && entry.count > 0
            ? [{ itemId: entry.itemId, count: Math.min(64, Math.floor(entry.count)) }]
            : [],
    );
}

function normalizeSwallowedEntity(entity) {
    if (!entity || typeof entity.type !== "string" ||
        !Number.isFinite(entity.health) || entity.health <= 0) return null;
    return {
        type: entity.type,
        health: Math.min(1000, entity.health),
        state: entity.state && typeof entity.state === "object"
            ? Object.fromEntries(SWALLOWED_STATE_KEYS.filter((key) =>
                entity.state[key] !== undefined,
            ).map((key) => [key, entity.state[key]]))
            : {},
    };
}

function captureSwallowedState(entity) {
    const saveData = typeof entity.createSaveData === "function"
        ? entity.createSaveData()
        : entity;
    return Object.fromEntries(SWALLOWED_STATE_KEYS.filter((key) =>
        saveData?.[key] !== undefined,
    ).map((key) => [key, saveData[key]]));
}

function clampSize(size) {
    return Math.max(0, Math.min(2, Math.floor(size)));
}

function clampTicks(value, max) {
    return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}

function distanceBetween(a, b) {
    const ax = a.position.x + a.hitbox.x / 2;
    const ay = a.position.y + a.hitbox.y / 2;
    const bx = b.position.x + b.hitbox.x / 2;
    const by = b.position.y + b.hitbox.y / 2;
    return Math.hypot(ax - bx, ay - by);
}
