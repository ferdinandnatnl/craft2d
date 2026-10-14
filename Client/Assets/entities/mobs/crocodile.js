import { AI, Mob } from "../mob.js";
import { EntityTypes } from "../../game/entity.js";
import { Body } from "../../game/body.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { getBlock } from "../../world/block.js";

const CROCODILE_PREY = new Set([
    "Pig",
    "Cow",
    "Sheep",
    "Villager",
    "Kangaroo",
    "GeladaMonkey",
    "Cod",
    "Salmon",
    "TropicalFish",
    "Catfish",
    "Caiman",
    "Triops",
]);

const MEAT_ITEMS = new Set([
    Items.RawBeef,
    Items.CookedBeef,
    Items.RawPorkchop,
    Items.CookedPorkchop,
    Items.RawChicken,
    Items.CookedChicken,
    Items.RawMutton,
    Items.CookedMutton,
    Items.RawRabbit,
    Items.CookedRabbit,
    Items.RawCod,
    Items.CookedCod,
    Items.RawSalmon,
    Items.CookedSalmon,
    Items.RottenFlesh,
]);

const CROCODILE_LOOT = new LootTable([
    new LootItem({ itemId: Items.CrocodileScute, maxCount: 2, subtract: 3 }),
    new LootItem({ itemId: Items.CrocodileEgg, maxCount: 1, subtract: 3 }),
]);

const SPAWN_SIZE = Object.freeze({ width: 2.15, height: 0.75 });
const WATER_TARGET_TICKS = 80;
const BABY_AGE_TICKS = 24_000;
const LUNGE_TICKS = 23;
const DEATH_ROLL_TICKS = 40;
const ARMOR_POINTS = 8;

export class Crocodile extends Mob {
    static spawnSize = SPAWN_SIZE;

    static canSpawnAt(world, worldX, groundY, biomeName, dimension) {
        if (biomeName !== "Swamp" && biomeName !== "Mangrove Swamp") return false;
        const ground = world.getBlockAtWorldPosition(
            worldX,
            groundY,
            false,
            dimension,
        );
        const above = world.getBlockAtWorldPosition(
            worldX,
            groundY - BLOCK_SIZE,
            false,
            dimension,
        );
        if (!ground || !above || above.blockType !== Blocks.Air ||
            !EGG_GROUND_BLOCKS.has(ground.blockType)) return false;

        for (let xOffset = -4; xOffset <= 4; xOffset++) {
            for (let yOffset = -4; yOffset <= 4; yOffset++) {
                const water = world.getBlockAtWorldPosition(
                    worldX + xOffset * BLOCK_SIZE,
                    groundY + yOffset * BLOCK_SIZE,
                    false,
                    dimension,
                );
                if (
                    water?.blockType === Blocks.Water &&
                    Math.abs(water.transform.position.y - ground.transform.position.y) <=
                        BLOCK_SIZE * 4
                ) return true;
            }
        }
        return false;
    }

    constructor(
        world,
        {
            health = 30,
            noAi = false,
            position = new Vector2(),
            invulnerable = false,
            myChunkX = 0,
            UUID,
            tamed = false,
            ownerUUID = null,
            sitting = false,
            hasEgg = false,
            babyAgeTicks = 0,
            stunTicks = 0,
            baskingTimer = 0,
            swimTimer = -1000,
            desert = false,
        } = {},
    ) {
        super(world, {
            name: "Crocodile",
            health,
            noAi,
            position,
            invulnerable,
            UUID,
            myChunkX,
            hitbox: new Vector2(
                SPAWN_SIZE.width * BLOCK_SIZE,
                SPAWN_SIZE.height * BLOCK_SIZE,
            ),
            body: createCrocodileBody(desert),
            ai: AI.PassiveSimple,
            speed: 1.15,
            stepSize: 0.6,
            canSwim: true,
            canDrown: false,
            float: true,
            lootTable: CROCODILE_LOOT,
        });

        this.entityTypeName = "Crocodile";
        this.isCrocodile = true;
        this.isHostile = false;
        this.tamed = Boolean(tamed);
        this.ownerUUID = typeof ownerUUID === "string" ? ownerUUID : null;
        this.sitting = Boolean(sitting);
        this.forcedSit = false;
        this.hasEgg = Boolean(hasEgg);
        this.babyAgeTicks = Math.max(0, Math.floor(babyAgeTicks));
        this.stunTicks = Math.max(0, Math.floor(stunTicks));
        this.baskingTimer = Math.floor(baskingTimer);
        this.swimTimer = Math.floor(swimTimer);
        this.desert = Boolean(desert);

        this.currentTarget = null;
        this.grabbedTargetUUID = null;
        this.action = null;
        this.actionTicks = 0;
        this.actionHitApplied = false;
        this.attackCooldown = 0;
        this.attackCooldownMax = 1.5;
        this.swimTarget = null;
        this.swimTargetTimer = 0;
        this.waterSearchTimer = 0;
        this.bankSearchTimer = 0;
        this.bankTarget = null;
        this.loveTicks = 0;
        this.breedingCooldown = 0;
        this.layEggCooldown = 0;
        this.eggSiteTarget = null;
        this.eggSiteSearchTimer = 0;
        this.growthDropGiven = false;
        this.swimPhase = randomRange(0, Math.PI * 2);
    }

    update() {
        this.updateEntity();
        this.pinGrabbedTarget();
        this.updateCrocodileAnimation();
        this.updateCrocodileAI();
    }

    tickUpdate() {
        this.entityTickUpdate();
        if (this.babyAgeTicks > 0) {
            this.babyAgeTicks--;
            if (this.babyAgeTicks === 0 && !this.growthDropGiven) {
                this.growthDropGiven = true;
                this.world?.spawnDrop?.(
                    new Vector2(this.position.x, this.position.y),
                    { itemId: Items.CrocodileScute, count: 1 },
                );
            }
        }
        if (this.swimming) this.swimTimer++;
        else this.swimTimer--;
        if (this.loveTicks > 0) this.loveTicks--;
        if (this.breedingCooldown > 0) this.breedingCooldown--;
        if (this.layEggCooldown > 0) this.layEggCooldown--;
        if (this.baskingTimer > 0) {
            this.baskingTimer--;
            if (this.baskingTimer === 0) {
                this.sitting = false;
                this.baskingTimer = -randomRange(2000, 2750);
            }
        } else if (this.baskingTimer < 0) {
            this.baskingTimer++;
        }
        if (this.stunTicks > 0) this.stunTicks--;
    }

    get isBaby() {
        return this.babyAgeTicks > 0;
    }

    updateCrocodileAI() {
        const deltaTime = Math.min(Math.max(0, runtime.deltaTime || 0), 0.1);
        this.attackCooldownLogic();
        this.ambientLogic();
        if (this.noAi || this.health <= 0) return;

        if (this.stunTicks > 0) {
            this.targetVelocity.x = 0;
            return;
        }

        if (this.action) {
            this.advanceAction(deltaTime);
            if (this.action) {
                this.targetVelocity.x = this.action === "lunge"
                    ? this.direction * this.speed * BLOCK_SIZE * 1.4
                    : 0;
                return;
            }
        }

        const grabbedTarget = this.getGrabbedTarget();
        if (grabbedTarget) {
            if (this.swimming) this.startDeathRoll();
            else {
                this.waterSearchTimer -= deltaTime;
                if (
                    this.waterSearchTimer <= 0 ||
                    (this.swimTarget &&
                        !this.isWaterPosition(this.swimTarget.x, this.swimTarget.y))
                ) {
                    this.swimTarget = this.findSwimTarget() ||
                        this.findNearbyWaterTarget();
                    this.waterSearchTimer = 1;
                }
                if (this.swimTarget) {
                    this.steerToPosition(this.swimTarget, deltaTime, 0.72);
                } else {
                    this.targetVelocity.x = 0;
                }
            }
            return;
        }

        this.updateBreeding();
        if (this.hasEgg) {
            if (this.tryLayEgg()) return;
        }

        this.currentTarget = this.findTarget();
        if (this.currentTarget) {
            this.sitting = false;
            this.baskingTimer = Math.min(this.baskingTimer, 0);
            this.direction = this.currentTarget.position.x < this.position.x ? -1 : 1;
            this.moveTowardWaterOrTarget(this.currentTarget, deltaTime);
            if (
                this.attackCooldown <= 0 &&
                this.distanceTo(this.currentTarget) <= BLOCK_SIZE * 3.5 &&
                this.hasLineOfSight(this.currentTarget)
            ) {
                this.startLunge();
            }
            return;
        }

        if (this.tamed && this.sitting) {
            this.targetVelocity.x = 0;
            return;
        }

        if (this.swimming) {
            this.updateSwimming(deltaTime);
            return;
        }

        this.swimTarget = null;
        if (!this.tamed && this.grounded) {
            if (this.baskingTimer === 0) {
                this.sitting = true;
                this.baskingTimer = randomRange(1000, 1750);
            } else if (this.baskingTimer < 0) {
                this.sitting = false;
            }
        }

        if (this.sitting) {
            this.targetVelocity.x = 0;
            return;
        }

        if (!this.tamed && this.swimTimer <= -1000) {
            const waterTarget = this.findSwimTarget();
            if (waterTarget) {
                this.direction = waterTarget.x < this.position.x ? -1 : 1;
                this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
                if (
                    this.grounded &&
                    waterTarget.y < this.position.y + this.hitbox.y - BLOCK_SIZE * 0.5
                ) this.jump();
                return;
            }
        }

        this.passiveWander();
        this.getOutOfBlocks();
    }

    updateSwimming(deltaTime) {
        this.swimTargetTimer -= deltaTime * 20;
        if (
            this.swimTargetTimer <= 0 ||
            !this.swimTarget ||
            !this.isWaterPosition(this.swimTarget.x, this.swimTarget.y)
        ) {
            this.swimTarget = this.findSwimTarget();
            this.swimTargetTimer = WATER_TARGET_TICKS;
        }

        if (this.swimTarget) {
            this.steerToPosition(this.swimTarget, deltaTime, 0.7);
        } else {
            this.targetVelocity.x = 0;
            this.velocity.y = Math.min(this.velocity.y, 0);
        }

        if (this.swimTimer > 600 && !this.currentTarget && !this.grabbedTargetUUID) {
            this.bankSearchTimer -= deltaTime;
            if (this.bankSearchTimer <= 0 || !this.bankTarget) {
                this.bankTarget = this.findDryBankTarget();
                this.bankSearchTimer = 1;
            }
            if (this.bankTarget) this.steerToPosition(this.bankTarget, deltaTime, 0.7);
        }
    }

    findDryBankTarget() {
        if (typeof this.world?.getBlockAtWorldPosition !== "function") return null;
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        for (let offset = 1; offset <= 16; offset++) {
            for (const direction of [-1, 1]) {
                const x = centerX + direction * offset * BLOCK_SIZE;
                for (let depth = 0; depth <= 8; depth++) {
                    const ground = this.world.getBlockAtWorldPosition(
                        x,
                        centerY + depth * BLOCK_SIZE,
                        false,
                        this.dimension,
                    );
                    if (!ground) continue;
                    const definition = getBlock(ground.blockType);
                    if (!definition?.collision || definition.fluid) continue;
                    const above = this.world.getBlockAtWorldPosition(
                        x,
                        ground.transform.position.y - BLOCK_SIZE,
                        false,
                        this.dimension,
                    );
                    if (!above || above.blockType !== Blocks.Air) continue;
                    return new Vector2(
                        x,
                        ground.transform.position.y - this.hitbox.y / 2,
                    );
                }
            }
        }
        return null;
    }

    moveTowardWaterOrTarget(target, deltaTime) {
        const targetCenter = new Vector2(
            target.position.x + target.hitbox.x / 2,
            target.position.y + target.hitbox.y / 2,
        );
        this.direction = targetCenter.x < this.position.x + this.hitbox.x / 2 ? -1 : 1;
        if (this.swimming) {
            this.steerToPosition(targetCenter, deltaTime, 0.72);
            return;
        }

        this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE * 1.2;
        const verticalDifference = this.position.y + this.hitbox.y - targetCenter.y;
        if (this.grounded && verticalDifference > BLOCK_SIZE * 0.6) this.jump();
        if (this.grounded && this.wasColliding) this.jump();
    }

    steerToPosition(target, deltaTime, verticalScale) {
        const center = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        );
        const deltaX = target.x - center.x;
        const deltaY = target.y - center.y;
        const distance = Math.hypot(deltaX, deltaY);
        this.direction = deltaX < 0 ? -1 : 1;
        if (distance < BLOCK_SIZE * 0.15) {
            this.targetVelocity.x = 0;
            this.velocity.y *= 0.85;
            return;
        }

        this.targetVelocity.x = (deltaX / distance) * this.speed * BLOCK_SIZE * 1.2;
        const desiredY = (deltaY / distance) * this.speed * BLOCK_SIZE * verticalScale;
        const acceleration = BLOCK_SIZE * 2.5 * deltaTime;
        this.velocity.y = approach(this.velocity.y, desiredY, acceleration);
    }

    findSwimTarget() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        for (let attempt = 0; attempt < 12; attempt++) {
            const x = centerX + randomRange(-4, 5) * BLOCK_SIZE;
            const y = centerY + randomRange(-2, 3) * BLOCK_SIZE;
            if (this.isWaterPosition(x, y)) return new Vector2(x, y);
        }
        return null;
    }

    findNearbyWaterTarget() {
        if (typeof this.world?.getBlockAtWorldPosition !== "function") return null;
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        let closest = null;
        let closestDistance = Infinity;
        for (let xOffset = -8; xOffset <= 8; xOffset++) {
            for (let yOffset = -4; yOffset <= 4; yOffset++) {
                const x = centerX + xOffset * BLOCK_SIZE;
                const y = centerY + yOffset * BLOCK_SIZE;
                const block = this.world.getBlockAtWorldPosition(
                    x,
                    y,
                    false,
                    this.dimension,
                );
                if (block?.blockType !== Blocks.Water ||
                    !this.isWaterPosition(x, y)) continue;
                const distance = Math.hypot(x - centerX, y - centerY);
                if (distance < closestDistance) {
                    closest = new Vector2(x, y);
                    closestDistance = distance;
                }
            }
        }
        return closest;
    }

    isWaterPosition(x, y) {
        if (typeof this.world?.getBlockAtWorldPosition !== "function") return false;
        const inset = Math.min(BLOCK_SIZE * 0.15, this.hitbox.x / 4);
        const points = [
            [x - this.hitbox.x / 2 + inset, y - this.hitbox.y / 2 + inset],
            [x + this.hitbox.x / 2 - inset, y - this.hitbox.y / 2 + inset],
            [x - this.hitbox.x / 2 + inset, y + this.hitbox.y / 2 - inset],
            [x + this.hitbox.x / 2 - inset, y + this.hitbox.y / 2 - inset],
        ];
        return points.every(([pointX, pointY]) =>
            this.world.getBlockAtWorldPosition(pointX, pointY, false, this.dimension)
                ?.blockType === Blocks.Water,
        );
    }

    findTarget() {
        if (this.isBaby) return null;
        const candidates = this.world?.entities || [];
        let best = null;
        let bestDistance = 15 * BLOCK_SIZE;
        for (const entity of candidates) {
            if (
                entity === this ||
                entity.health <= 0 ||
                entity.dimension !== this.dimension ||
                (entity.type !== EntityTypes.Player && entity.type !== EntityTypes.Mob)
            ) continue;
            const isRetaliationTarget = entity === this.currentTarget &&
                runtime.passedTime <= (this.retaliationUntil || 0);
            const isWildPlayer = entity.type === EntityTypes.Player &&
                !this.tamed &&
                this.world.difficulty !== "peaceful" &&
                entity.abilities?.hasHealth;
            if (
                entity.type === EntityTypes.Player &&
                ((this.tamed && !isRetaliationTarget) ||
                    (this.world.difficulty === "peaceful" && !isRetaliationTarget) ||
                    !entity.abilities?.hasHealth)
            ) continue;

            const entityName = entity.entityTypeName || entity.name;
            const isPrey = !this.tamed &&
                entity.type === EntityTypes.Mob &&
                !entity.isHostile &&
                CROCODILE_PREY.has(entityName);
            const isThreatToTame = this.tamed &&
                entity.type === EntityTypes.Mob &&
                entity.isHostile &&
                entityName !== "Creeper";
            if (!isPrey && !isThreatToTame && !isRetaliationTarget &&
                !isWildPlayer) continue;

            const distance = this.distanceTo(entity);
            if (distance < bestDistance) {
                best = entity;
                bestDistance = distance;
            }
        }
        return best;
    }

    startLunge() {
        if (this.action || this.stunTicks > 0 || this.isBaby) return;
        this.action = "lunge";
        this.actionTicks = 0;
        this.actionHitApplied = false;
        this.attackCooldown = this.attackCooldownMax;
    }

    advanceAction(deltaTime) {
        const previousTicks = this.actionTicks;
        this.actionTicks += deltaTime * 20;

        if (
            this.action === "lunge" &&
            !this.actionHitApplied &&
            previousTicks < 6 &&
            this.actionTicks >= 6
        ) {
            this.actionHitApplied = true;
            this.performLungeHit();
        }

        if (
            this.action === "death_roll" &&
            Math.floor(previousTicks / 10) < Math.floor(this.actionTicks / 10)
        ) {
            const target = this.getGrabbedTarget();
            if (target) this.damageTarget(target, 5);
            else this.finishDeathRoll();
        }

        if (this.action === "lunge" && this.actionTicks >= LUNGE_TICKS) {
            this.action = null;
            this.actionTicks = 0;
            this.actionHitApplied = false;
        } else if (this.action === "death_roll" && this.actionTicks >= DEATH_ROLL_TICKS) {
            this.finishDeathRoll();
        }
    }

    performLungeHit() {
        const target = this.currentTarget;
        if (
            !target ||
            target.health <= 0 ||
            (target.type === EntityTypes.Player &&
                this.world.difficulty === "peaceful") ||
            this.distanceTo(target) > BLOCK_SIZE * 3.5 ||
            !this.hasLineOfSight(target)
        ) return;

        const blocking = target.isBlocking === true || target.blocking === true;
        if (blocking) {
            this.stunTicks = randomRange(25, 45);
            return;
        }

        this.damageTarget(target, 10);
        if (this.isSmallEnoughToGrab(target)) {
            this.grabbedTargetUUID = target.UUID;
            target.crocodileGrabbedByUUID = this.UUID;
            this.pinGrabbedTarget();
            this.startDeathRoll();
        }
    }

    startDeathRoll() {
        if (!this.getGrabbedTarget()) return;
        this.action = "death_roll";
        this.actionTicks = 0;
        this.targetVelocity.x = 0;
    }

    finishDeathRoll() {
        this.releaseGrabbedTarget();
        this.action = null;
        this.actionTicks = 0;
        this.actionHitApplied = false;
    }

    isSmallEnoughToGrab(target) {
        return target.hitbox.x < this.hitbox.x &&
            target.isCrouching !== true &&
            target.sneaking !== true;
    }

    damageTarget(target, amount) {
        target.hit?.(
            amount,
            this.position.x + this.hitbox.x / 2,
            2,
            "Crocodile",
            this,
        );
        this.attackPoseUntil = runtime.passedTime + 0.4;
    }

    pinGrabbedTarget() {
        const target = this.getGrabbedTarget();
        if (!target) return;
        const offset = this.direction * (this.hitbox.x / 2 + target.hitbox.x * 0.35);
        target.position.x = this.position.x + this.hitbox.x / 2 + offset -
            target.hitbox.x / 2;
        target.position.y = this.position.y + this.hitbox.y / 2 -
            target.hitbox.y / 2;
        target.velocity.x = 0;
        target.velocity.y = 0;
        target.targetVelocity.x = 0;
    }

    getGrabbedTarget() {
        if (!this.grabbedTargetUUID) return null;
        const target = this.world?.getEntityByUUID?.(this.grabbedTargetUUID) ??
            this.world?.entities?.find(entity => entity.UUID === this.grabbedTargetUUID);
        if (!target || target.health <= 0 || target.dimension !== this.dimension) {
            this.grabbedTargetUUID = null;
            return null;
        }
        return target;
    }

    releaseGrabbedTarget() {
        const target = this.getGrabbedTarget();
        if (target?.crocodileGrabbedByUUID === this.UUID) {
            target.crocodileGrabbedByUUID = null;
        }
        this.grabbedTargetUUID = null;
    }

    hasLineOfSight(target) {
        const startX = this.position.x + this.hitbox.x / 2;
        const startY = this.position.y + this.hitbox.y / 2;
        const endX = target.position.x + target.hitbox.x / 2;
        const endY = target.position.y + target.hitbox.y / 2;
        const distance = Math.hypot(endX - startX, endY - startY);
        const steps = Math.ceil(distance / (BLOCK_SIZE / 3));
        for (let step = 1; step < steps; step++) {
            const ratio = step / steps;
            const block = this.world?.getBlockAtWorldPosition?.(
                startX + (endX - startX) * ratio,
                startY + (endY - startY) * ratio,
                false,
                this.dimension,
            );
            const definition = block && getBlock(block.blockType);
            if (definition?.collision && !definition.fluid) return false;
        }
        return true;
    }

    distanceTo(entity) {
        return Vector2.Distance(
            new Vector2(
                this.position.x + this.hitbox.x / 2,
                this.position.y + this.hitbox.y / 2,
            ),
            new Vector2(
                entity.position.x + entity.hitbox.x / 2,
                entity.position.y + entity.hitbox.y / 2,
            ),
        );
    }

    tryLayEgg() {
        if (this.swimming || this.layEggCooldown > 0) return false;
        this.eggSiteSearchTimer -= Math.min(runtime.deltaTime || 0, 0.1);
        if (!this.eggSiteTarget || this.eggSiteSearchTimer <= 0) {
            this.eggSiteTarget = this.findEggSite();
            this.eggSiteSearchTimer = 1;
        }
        const site = this.eggSiteTarget;
        if (!site) return false;

        const centerX = this.position.x + this.hitbox.x / 2;
        const eggY = site.y - BLOCK_SIZE;
        if (Math.abs(site.x + BLOCK_SIZE / 2 - centerX) > BLOCK_SIZE * 0.6 ||
            Math.abs(eggY - this.position.y) > BLOCK_SIZE * 1.5) {
            this.direction = site.x < centerX ? -1 : 1;
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
            return true;
        }

        const placed = this.world?.setBlockTypeAtPosition?.(
            site.x,
            eggY,
            Blocks.CrocodileEgg,
            false,
            this.dimension,
            { hatch: 0, eggs: 1, hatchTicks: 0, lastDawn: -1 },
            false,
            false,
        );
        if (placed) {
            this.hasEgg = false;
            this.baskingTimer = 600;
            this.loveTicks = 0;
            this.layEggCooldown = 600;
            this.eggSiteTarget = null;
            this.eggSiteSearchTimer = 0;
            return true;
        }
        this.eggSiteTarget = null;
        this.eggSiteSearchTimer = 0;
        return false;
    }

    findEggSite() {
        if (typeof this.world?.getBlockAtWorldPosition !== "function") return null;
        const centerX = this.position.x + this.hitbox.x / 2;
        const feetY = this.position.y + this.hitbox.y;
        const baseBlockY = Math.floor(feetY / BLOCK_SIZE) * BLOCK_SIZE;
        const candidates = [];
        for (let xOffset = -16; xOffset <= 16; xOffset++) {
            const x = Math.floor(centerX / BLOCK_SIZE) * BLOCK_SIZE +
                xOffset * BLOCK_SIZE;
            for (let yOffset = -3; yOffset <= 3; yOffset++) {
                const y = baseBlockY + yOffset * BLOCK_SIZE;
                const ground = this.world.getBlockAtWorldPosition(
                    x,
                    y,
                    false,
                    this.dimension,
                );
                if (!ground || !EGG_GROUND_BLOCKS.has(ground.blockType)) continue;
                const above = this.world.getBlockAtWorldPosition(
                    x,
                    y - BLOCK_SIZE,
                    false,
                    this.dimension,
                );
                if (!above || above.blockType !== Blocks.Air) continue;
                candidates.push({ x: ground.transform.position.x, y: ground.transform.position.y });
            }
        }
        candidates.sort((a, b) =>
            Math.abs(a.x - centerX) - Math.abs(b.x - centerX),
        );
        return candidates[0] || null;
    }

    updateBreeding() {
        if (this.isBaby || this.loveTicks <= 0 || this.breedingCooldown > 0 || this.hasEgg) {
            return;
        }
        const partner = this.world?.entities?.find(entity =>
            entity !== this &&
            entity.isCrocodile &&
            !entity.isBaby &&
            entity.dimension === this.dimension &&
            entity.health > 0 &&
            entity.loveTicks > 0 &&
            entity.breedingCooldown <= 0 &&
            !entity.hasEgg &&
            this.distanceTo(entity) <= BLOCK_SIZE * 8,
        );
        if (!partner) return;

        this.hasEgg = true;
        this.loveTicks = 0;
        partner.loveTicks = 0;
        this.breedingCooldown = 6000;
        partner.breedingCooldown = 6000;
    }

    interact(player, item) {
        const itemId = item?.itemId ?? null;
        if (this.tamed && MEAT_ITEMS.has(itemId) && this.health < this.maxHealth) {
            this.consumeHeldItem(player);
            this.addHealth(10);
            return true;
        }

        if (itemId === Items.RottenFlesh) {
            if (this.isBaby) {
                this.consumeHeldItem(player);
                this.babyAgeTicks = Math.max(0, this.babyAgeTicks - 2400);
                return true;
            }
            if (this.hasEgg || this.loveTicks > 0 || this.breedingCooldown > 0) {
                return true;
            }
            this.consumeHeldItem(player);
            this.loveTicks = 6000;
            this.updateBreeding();
            return true;
        }

        if (
            this.tamed &&
            this.ownerUUID === player?.UUID &&
            itemId !== Items.RottenFlesh
        ) {
            if (this.sitting) {
                this.forcedSit = false;
                this.sitting = false;
            } else {
                this.forcedSit = true;
                this.sitting = true;
            }
            return true;
        }
        return false;
    }

    consumeHeldItem(player) {
        if (!player?.abilities?.instaBuild) player?.removeFromCurrentSlot?.();
    }

    hit(damage, hitfromX = 0, kb = 0, cause = null, sourceEntity = null) {
        if (
            this.health <= 0 ||
            this.invulnerable ||
            cause === "Drowned" ||
            cause === "In wall"
        ) return false;

        const tamedDamage = this.tamed &&
            sourceEntity?.type === EntityTypes.Mob
            ? (damage + 1) / 3
            : damage;
        const armorReduction = Math.min(
            20,
            Math.max(ARMOR_POINTS / 5, ARMOR_POINTS - tamedDamage / 2),
        ) / 25;
        const actualDamage = tamedDamage * (1 - armorReduction);
        if (!this.damage(actualDamage, sourceEntity)) return false;

        this.sitting = false;
        this.forcedSit = false;
        if (
            sourceEntity &&
            sourceEntity !== this &&
            sourceEntity.dimension === this.dimension &&
            sourceEntity.health > 0 &&
            (!this.isBaby || sourceEntity.type === EntityTypes.Player)
        ) {
            this.currentTarget = sourceEntity;
            this.retaliationUntil = runtime.passedTime + 8;
        }
        this.knockBack(hitfromX, kb * 0.6);
        return true;
    }

    dieEvent() {
        this.releaseGrabbedTarget();
        this.dropLoot();
        this.world?.removeEntity?.(this);
    }

    updateCrocodileAnimation() {
        const deltaTime = Math.min(Math.max(0, runtime.deltaTime || 0), 0.1);
        this.swimPhase = (this.swimPhase + deltaTime * 8) % (Math.PI * 2);
        const tail = this.body?.parts?.tail;
        if (!tail) return;
        const roll = this.action === "death_roll"
            ? Math.sin(this.actionTicks * 0.55) * 32
            : 0;
        const swimming = this.swimming
            ? Math.sin(this.swimPhase) * 16
            : Math.sin(this.swimPhase * 0.5) * 4;
        const lunge = this.action === "lunge"
            ? Math.sin(Math.min(1, this.actionTicks / LUNGE_TICKS) * Math.PI) * 12
            : 0;
        tail.rotation = roll + swimming + lunge;
    }

    getGrabPosition(target) {
        const offset = this.direction * (this.hitbox.x / 2 + target.hitbox.x * 0.35);
        return new Vector2(
            this.position.x + this.hitbox.x / 2 + offset - target.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2 - target.hitbox.y / 2,
        );
    }

    createSaveData() {
        return {
            UUID: this.UUID,
            position: { x: this.position.x, y: this.position.y },
            health: this.health,
            dimension: this.dimension,
            tamed: this.tamed,
            ownerUUID: this.ownerUUID,
            sitting: this.sitting,
            hasEgg: this.hasEgg,
            babyAgeTicks: this.babyAgeTicks,
            stunTicks: this.stunTicks,
            baskingTimer: this.baskingTimer,
            swimTimer: this.swimTimer,
            desert: this.desert,
            loveTicks: this.loveTicks,
            breedingCooldown: this.breedingCooldown,
            layEggCooldown: this.layEggCooldown,
        };
    }
}

const EGG_GROUND_BLOCKS = new Set([
    Blocks.Dirt,
    Blocks.GrassBlock,
    Blocks.Podzol,
    Blocks.Sand,
    Blocks.SandStone,
    Blocks.Gravel,
    Blocks.Stone,
]);

export function createCrocodileBody(desert = false) {
    return new Body({
        sprite: `alexsmobs/crocodile_${desert ? 1 : 0}.png`,
        parts: {},
    });
}

function approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    return Math.max(value - amount, target);
}
