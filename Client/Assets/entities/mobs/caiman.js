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
import { playRandomSoundFromArray } from "../../game/sounds.js";

const SOURCE_PREY = new Set([
    "Chicken", "TropicalFish", "Cod", "Salmon", "Parrot", "Rabbit",
    "Crow", "Toucan", "Jerboa", "Frog", "BlueJay", "Terrapin",
    "Catfish", "FlyingFish", "RainFrog", "SugarGlider", "BananaSlug", "Triops",
]);
const BREEDING_FOOD = new Set([Items.RawCatfish, Items.CookedCatfish]);
const FISH_FOOD = new Set([
    Items.RawCod, Items.CookedCod, Items.RawSalmon, Items.CookedSalmon,
    Items.Pufferfish, Items.TropicalFish,
]);
const EGG_GROUND = new Set([
    Blocks.Sand, Blocks.SandStone, Blocks.Dirt, Blocks.GrassBlock,
    Blocks.Podzol, Blocks.Gravel, Blocks.Stone,
]);
const CAIMAN_IDLE = [0, 1, 2, 3].map(i => `alexsmobs/caiman_idle_${i}`);
const CAIMAN_HURT = [0, 1].map(i => `alexsmobs/caiman_hurt_${i}`);
const CAIMAN_SPLASH = [0, 1, 2].map(i => `alexsmobs/caiman_splash_${i}`);
const SPAWN_SIZE = Object.freeze({ width: 1.3, height: 0.6 });
const BABY_AGE_TICKS = 24_000;
const OWNER_HOLD_TICKS = 300;
const TARGET_RANGE = 12 * BLOCK_SIZE;

export class Caiman extends Mob {
    static spawnSize = SPAWN_SIZE;

    static canSpawnAt(world, worldX, feetY, biomeName, dimension) {
        if (biomeName !== "Swamp") return false;
        const ground = world.getBlockAtWorldPosition(worldX, feetY, false, dimension);
        const above = world.getBlockAtWorldPosition(
            worldX, feetY - BLOCK_SIZE, false, dimension,
        );
        if (!ground || !above || above.blockType !== Blocks.Air ||
            ![Blocks.GrassBlock, Blocks.Dirt, Blocks.Sand, Blocks.Gravel]
                .includes(ground.blockType)) return false;

        for (let xOffset = -4; xOffset <= 4; xOffset++) {
            for (let yOffset = -3; yOffset <= 3; yOffset++) {
                const water = world.getBlockAtWorldPosition(
                    worldX + xOffset * BLOCK_SIZE,
                    feetY + yOffset * BLOCK_SIZE,
                    false,
                    dimension,
                );
                if (water?.blockType === Blocks.Water) return true;
            }
        }
        return false;
    }

    constructor(world, {
        health = 20,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        UUID,
        tamed = false,
        ownerUUID = null,
        sitting = false,
        command = 0,
        hasEgg = false,
        babyAgeTicks = 0,
        swimTimer = -1000,
        bellowCooldown = randomRange(100, 1100),
        breedingCooldown = 0,
        loveTicks = 0,
    } = {}) {
        super(world, {
            name: "Caiman",
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
            body: createCaimanBody(),
            ai: AI.PassiveSimple,
            speed: 0.92,
            stepSize: 0.45,
            canSwim: true,
            canDrown: false,
            float: true,
            lootTable: new LootTable([]),
            ambientSounds: CAIMAN_IDLE,
            ambientSoundRange: { min: 9, max: 19 },
        });

        this.entityTypeName = "Caiman";
        this.isCaiman = true;
        this.isHostile = false;
        this.tamed = Boolean(tamed);
        this.ownerUUID = typeof ownerUUID === "string" ? ownerUUID : null;
        this.command = Math.max(0, Math.min(2, Math.floor(command)));
        this.sitting = Boolean(sitting) || this.command === 2;
        this.hasEgg = Boolean(hasEgg);
        this.babyAgeTicks = Math.max(0, Math.min(BABY_AGE_TICKS, Math.floor(babyAgeTicks)));
        this.swimTimer = Math.floor(swimTimer);
        this.bellowCooldown = Math.max(0, Math.floor(bellowCooldown));
        this.breedingCooldown = Math.max(0, Math.floor(breedingCooldown));
        this.loveTicks = Math.max(0, Math.floor(loveTicks));

        this.currentTarget = null;
        this.grabbedTargetUUID = null;
        this.grabTicks = 0;
        this.grabDamageCooldown = 0;
        this.grabDefendOwner = false;
        this.swimPhase = randomRange(0, Math.PI * 2);
        this.swimTarget = null;
        this.swimTargetTimer = 0;
        this.bankTarget = null;
        this.bankSearchTimer = 0;
        this.bellowing = false;
        this.bellowTicks = 0;
        this.bellowSoundPlayed = false;
        this.eggSiteTarget = null;
        this.eggSiteSearchTimer = 0;
        this.growthDropGiven = false;
    }

    get isBaby() {
        return this.babyAgeTicks > 0;
    }

    update() {
        this.updateEntity();
        this.pinGrabbedTarget();
        this.updateCaimanAnimation();
        this.updateCaimanAI();
    }

    tickUpdate() {
        this.entityTickUpdate();
        if (this.babyAgeTicks > 0) this.babyAgeTicks--;
        if (this.swimming) this.swimTimer++;
        else this.swimTimer--;
        if (this.loveTicks > 0) this.loveTicks--;
        if (this.breedingCooldown > 0) this.breedingCooldown--;
        if (this.bellowCooldown > 0) this.bellowCooldown--;
        if (this.grabDamageCooldown > 0) this.grabDamageCooldown--;
    }

    updateCaimanAI() {
        const deltaTime = Math.min(Math.max(0, runtime.deltaTime || 0), 0.1);
        this.attackCooldownLogic();
        this.ambientLogic();
        if (this.noAi || this.health <= 0) return;

        const grabbed = this.getGrabbedTarget();
        if (grabbed) {
            this.holdTarget(grabbed, deltaTime);
            return;
        }

        this.currentTarget = this.findTarget();
        if (this.currentTarget) {
            this.bellowing = false;
            this.sitting = false;
            this.direction = this.currentTarget.position.x < this.position.x ? -1 : 1;
            this.chaseTarget(this.currentTarget, deltaTime);
            return;
        }

        this.updateBreeding();
        if (this.hasEgg && this.tryLayEgg(deltaTime)) return;

        if (this.tamed && this.command === 2) {
            this.sitting = true;
            this.targetVelocity.x = 0;
            this.bellowing = false;
            return;
        }
        this.sitting = false;

        if (this.swimming) {
            this.updateSwimming(deltaTime);
            if (this.swimTimer > 600) this.seekDryBank(deltaTime);
            if (this.bellowCooldown <= 0 && this.command !== 1) {
                this.updateBellow(deltaTime);
                return;
            }
        } else {
            this.bellowing = false;
            if (this.swimTimer <= -1000 && this.command !== 1) {
                const water = this.findWaterTarget();
                if (water) {
                    this.moveTowardPoint(water, deltaTime, 1);
                    if (this.grounded && water.y < this.position.y + this.hitbox.y) this.jump();
                    return;
                }
            }
            this.swimTarget = null;
        }

        if (this.tamed && this.command === 1) {
            const owner = this.findOwner();
            if (owner && this.distanceToEntity(owner) > BLOCK_SIZE * 3) {
                this.chaseTarget(owner, deltaTime);
                return;
            }
        }

        this.passiveWander();
    }

    findTarget() {
        if (this.isBaby) return null;
        this.grabDefendOwner = false;
        const retaliation = this.validRetaliationTarget(
            this.retaliationTarget,
            this.retaliationUntil,
        );
        if (retaliation) return retaliation;

        if (this.tamed) {
            const owner = this.findOwner();
            const ownerRetaliation = this.validRetaliationTarget(
                owner?.retaliationTarget,
                owner?.retaliationUntil,
            );
            if (ownerRetaliation) {
                this.grabDefendOwner = true;
                return ownerRetaliation;
            }
            return null;
        }

        let closest = null;
        let closestDistance = TARGET_RANGE;
        for (const entity of this.world?.entities || []) {
            if (entity === this || entity.health <= 0 ||
                entity.dimension !== this.dimension || entity.type !== EntityTypes.Mob) continue;
            const name = entity.entityTypeName || entity.name?.replaceAll(" ", "");
            if (!SOURCE_PREY.has(name)) continue;
            const distance = this.distanceToEntity(entity);
            if (distance < closestDistance) {
                closest = entity;
                closestDistance = distance;
            }
        }
        return closest;
    }

    validRetaliationTarget(target, retaliationUntil = this.retaliationUntil) {
        if (!target || target === this || target.health <= 0 ||
            !Number.isFinite(retaliationUntil) ||
            target.dimension !== this.dimension ||
            runtime.passedTime > retaliationUntil ||
            !this.world?.entities?.includes(target)) {
            return null;
        }
        return target;
    }

    chaseTarget(target, deltaTime) {
        const center = this.center();
        const targetCenter = new Vector2(
            target.position.x + target.hitbox.x / 2,
            target.position.y + target.hitbox.y / 2,
        );
        const distance = Math.hypot(targetCenter.x - center.x, targetCenter.y - center.y);
        this.direction = targetCenter.x < center.x ? -1 : 1;
        const grabRange = (this.hitbox.x + target.hitbox.x) / 2 + BLOCK_SIZE * 0.2;
        if (distance <= grabRange) {
            this.beginGrab(target);
            this.holdTarget(target, deltaTime);
            return;
        }
        if (this.swimming) this.moveTowardPoint(targetCenter, deltaTime, 0.8);
        else {
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE * 1.2;
            if (this.grounded && (this.wasColliding || targetCenter.y < center.y - BLOCK_SIZE * 0.55)) {
                this.jump();
            }
            if (targetCenter.y > center.y + BLOCK_SIZE) this.seekWater(deltaTime);
        }
    }

    beginGrab(target) {
        this.currentTarget = target;
        this.grabbedTargetUUID = target.UUID;
        this.grabTicks = 0;
    }

    holdTarget(target, deltaTime) {
        this.grabTicks += deltaTime * 20;
        this.targetVelocity.x = 0;
        this.pinGrabbedTarget();
        if (this.grabDamageCooldown <= 0) {
            this.damageTarget(target);
            this.grabDamageCooldown = 25;
        }
        const maxHold = this.tamed && this.grabDefendOwner ? OWNER_HOLD_TICKS : 2;
        if (this.grabTicks > maxHold) {
            this.releaseGrabbedTarget();
            this.grabDamageCooldown = Math.max(this.grabDamageCooldown, 10);
        }
    }

    damageTarget(target) {
        if (target.isAquatic) target.lootTable = new LootTable([]);
        const cause = this.tamed && this.grabDefendOwner ? "CaimanDrown" : "Caiman";
        target.hit?.(
            3,
            this.position.x + this.hitbox.x / 2,
            2,
            cause,
            this,
        );
        this.attackPoseUntil = runtime.passedTime + 0.35;
    }

    pinGrabbedTarget() {
        const target = this.getGrabbedTarget();
        if (!target) return;
        const offset = this.direction * (this.hitbox.x / 2 + target.hitbox.x * 0.3);
        target.position.x = this.position.x + this.hitbox.x / 2 + offset - target.hitbox.x / 2;
        target.position.y = this.position.y + this.hitbox.y / 2 - target.hitbox.y / 2;
        target.velocity.x = 0;
        target.velocity.y = 0;
        target.targetVelocity.x = 0;
    }

    getGrabbedTarget() {
        if (!this.grabbedTargetUUID) return null;
        const target = this.world?.getEntityByUUID?.(this.grabbedTargetUUID) ??
            this.world?.entities?.find(entity => entity.UUID === this.grabbedTargetUUID);
        if (!target || target.health <= 0 || target.dimension !== this.dimension) {
            this.releaseGrabbedTarget();
            return null;
        }
        return target;
    }

    releaseGrabbedTarget() {
        this.grabbedTargetUUID = null;
        this.grabTicks = 0;
        this.grabDefendOwner = false;
    }

    updateSwimming(deltaTime) {
        this.swimTargetTimer -= deltaTime;
        if (this.swimTargetTimer <= 0 || !this.swimTarget ||
            !this.isWaterPosition(this.swimTarget.x, this.swimTarget.y)) {
            this.swimTarget = this.findWaterTarget();
            this.swimTargetTimer = 1.5;
        }
        if (this.swimTarget) this.moveTowardPoint(this.swimTarget, deltaTime, 0.7);
        else {
            this.targetVelocity.x = 0;
            this.velocity.y = Math.min(this.velocity.y, 0);
        }
    }

    updateBellow(deltaTime) {
        this.bellowing = true;
        this.bellowTicks += deltaTime * 20;
        this.targetVelocity.x = 0;
        const center = this.center();
        const water = this.world?.getBlockAtWorldPosition?.(
            center.x, center.y, false, this.dimension,
        );
        if (water?.blockType === Blocks.Water) {
            this.velocity.y = Math.min(this.velocity.y, -BLOCK_SIZE * 0.02);
        }
        if (!this.bellowSoundPlayed) {
            playRandomSoundFromArray({
                array: CAIMAN_SPLASH,
                positional: true,
                origin: this.position,
                range: 14,
            });
            this.bellowSoundPlayed = true;
        }
        if (this.bellowTicks >= 60 || !this.swimming) {
            this.bellowing = false;
            this.bellowTicks = 0;
            this.bellowCooldown = randomRange(1000, 2000);
            this.bellowSoundPlayed = false;
        }
    }

    seekWater(deltaTime) {
        const target = this.findWaterTarget();
        if (target) this.moveTowardPoint(target, deltaTime, 1);
    }

    seekDryBank(deltaTime) {
        this.bankSearchTimer -= deltaTime;
        if (this.bankSearchTimer <= 0 || !this.bankTarget) {
            this.bankTarget = this.findDryBankTarget();
            this.bankSearchTimer = 1;
        }
        if (this.bankTarget) this.moveTowardPoint(this.bankTarget, deltaTime, 0.7);
    }

    findDryBankTarget() {
        const center = this.center();
        for (let offset = 1; offset <= 12; offset++) {
            for (const direction of [-1, 1]) {
                const x = center.x + direction * offset * BLOCK_SIZE;
                for (let depth = 0; depth <= 5; depth++) {
                    const y = center.y + depth * BLOCK_SIZE;
                    const ground = this.world?.getBlockAtWorldPosition?.(
                        x, y, false, this.dimension,
                    );
                    if (!ground || !getBlock(ground.blockType)?.collision ||
                        getBlock(ground.blockType)?.fluid) continue;
                    const above = this.world.getBlockAtWorldPosition(
                        x, ground.transform.position.y - BLOCK_SIZE,
                        false, this.dimension,
                    );
                    if (above?.blockType === Blocks.Air) {
                        return new Vector2(
                            x,
                            ground.transform.position.y - this.hitbox.y / 2,
                        );
                    }
                }
            }
        }
        return null;
    }

    findWaterTarget() {
        const center = this.center();
        for (let attempt = 0; attempt < 12; attempt++) {
            const x = center.x + randomRange(-4, 5) * BLOCK_SIZE;
            const y = center.y + randomRange(-2, 3) * BLOCK_SIZE;
            if (this.isWaterPosition(x, y)) return new Vector2(x, y);
        }
        return null;
    }

    isWaterPosition(x, y) {
        const inset = Math.min(BLOCK_SIZE * 0.15, this.hitbox.x / 4);
        return [
            [x - this.hitbox.x / 2 + inset, y - this.hitbox.y / 2 + inset],
            [x + this.hitbox.x / 2 - inset, y - this.hitbox.y / 2 + inset],
            [x - this.hitbox.x / 2 + inset, y + this.hitbox.y / 2 - inset],
            [x + this.hitbox.x / 2 - inset, y + this.hitbox.y / 2 - inset],
        ].every(([pointX, pointY]) => this.world?.getBlockAtWorldPosition?.(
            pointX, pointY, false, this.dimension,
        )?.blockType === Blocks.Water);
    }

    moveTowardPoint(target, deltaTime, verticalScale) {
        const center = this.center();
        const dx = target.x - center.x;
        const dy = target.y - center.y;
        const distance = Math.hypot(dx, dy);
        if (distance < BLOCK_SIZE * 0.15) {
            this.targetVelocity.x = 0;
            this.velocity.y *= 0.85;
            return;
        }
        this.direction = dx < 0 ? -1 : 1;
        this.targetVelocity.x = (dx / distance) * this.speed * BLOCK_SIZE * 1.2;
        const desiredY = (dy / distance) * this.speed * BLOCK_SIZE * verticalScale;
        this.velocity.y = approach(this.velocity.y, desiredY, BLOCK_SIZE * 2.5 * deltaTime);
    }

    findOwner() {
        if (!this.ownerUUID) return null;
        return this.world?.entities?.find(entity => entity.UUID === this.ownerUUID) || null;
    }

    center() {
        return new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        );
    }

    distanceToEntity(entity) {
        return Vector2.Distance(this.center(), new Vector2(
            entity.position.x + entity.hitbox.x / 2,
            entity.position.y + entity.hitbox.y / 2,
        ));
    }

    updateBreeding() {
        if (this.isBaby || this.loveTicks <= 0 || this.breedingCooldown > 0 || this.hasEgg) return;
        const partner = this.world?.entities?.find(entity =>
            entity !== this && entity.isCaiman && !entity.isBaby &&
            entity.dimension === this.dimension && entity.health > 0 &&
            entity.loveTicks > 0 && entity.breedingCooldown <= 0 &&
            !entity.hasEgg && this.distanceToEntity(entity) <= BLOCK_SIZE * 8,
        );
        if (!partner) return;
        this.hasEgg = true;
        this.loveTicks = 0;
        partner.loveTicks = 0;
        this.breedingCooldown = 6000;
        partner.breedingCooldown = 6000;
    }

    tryLayEgg(deltaTime) {
        if (this.swimming) return false;
        this.eggSiteSearchTimer -= deltaTime;
        if (!this.eggSiteTarget || this.eggSiteSearchTimer <= 0) {
            this.eggSiteTarget = this.findEggSite();
            this.eggSiteSearchTimer = 1;
        }
        if (!this.eggSiteTarget) return false;
        const centerX = this.position.x + this.hitbox.x / 2;
        const site = this.eggSiteTarget;
        if (Math.abs(site.x + BLOCK_SIZE / 2 - centerX) > BLOCK_SIZE * 0.6) {
            this.direction = site.x < centerX ? -1 : 1;
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
            return true;
        }
        const placed = this.world?.setBlockTypeAtPosition?.(
            site.x,
            site.y - BLOCK_SIZE,
            Blocks.CaimanEgg,
            false,
            this.dimension,
            { hatch: 0, eggs: 3, hatchTicks: 0, wasDawn: false },
            false,
            false,
        );
        if (placed) {
            this.hasEgg = false;
            this.loveTicks = 0;
            this.breedingCooldown = 600;
            this.eggSiteTarget = null;
            return true;
        }
        this.eggSiteTarget = null;
        return false;
    }

    findEggSite() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const feetY = this.position.y + this.hitbox.y;
        const baseY = Math.floor(feetY / BLOCK_SIZE) * BLOCK_SIZE;
        const candidates = [];
        for (let xOffset = -12; xOffset <= 12; xOffset++) {
            const x = Math.floor(centerX / BLOCK_SIZE) * BLOCK_SIZE + xOffset * BLOCK_SIZE;
            for (let yOffset = -2; yOffset <= 2; yOffset++) {
                const y = baseY + yOffset * BLOCK_SIZE;
                const ground = this.world?.getBlockAtWorldPosition?.(x, y, false, this.dimension);
                if (!ground || !EGG_GROUND.has(ground.blockType)) continue;
                const above = this.world.getBlockAtWorldPosition(
                    x, y - BLOCK_SIZE, false, this.dimension,
                );
                if (above?.blockType === Blocks.Air) {
                    candidates.push({
                        x: ground.transform.position.x,
                        y: ground.transform.position.y,
                    });
                }
            }
        }
        candidates.sort((a, b) => Math.abs(a.x - centerX) - Math.abs(b.x - centerX));
        return candidates[0] || null;
    }

    interact(player, item) {
        const itemId = item?.itemId ?? null;
        if (this.tamed && FISH_FOOD.has(itemId) && this.health < this.maxHealth) {
            this.consumeHeldItem(player);
            this.addHealth(5);
            return true;
        }
        if (BREEDING_FOOD.has(itemId)) {
            if (this.isBaby) {
                this.consumeHeldItem(player);
                this.babyAgeTicks = Math.max(0, this.babyAgeTicks - 2400);
                return true;
            }
            if (this.hasEgg || this.loveTicks > 0 || this.breedingCooldown > 0) return true;
            this.consumeHeldItem(player);
            this.loveTicks = 6000;
            this.updateBreeding();
            return true;
        }
        if (this.tamed && this.ownerUUID === player?.UUID) {
            this.command = (this.command + 1) % 3;
            this.sitting = this.command === 2;
            return true;
        }
        return false;
    }

    consumeHeldItem(player) {
        if (!player?.abilities?.instaBuild) player?.removeFromCurrentSlot?.();
    }

    hit(damage, hitfromX = 0, kb = 0, cause = null, sourceEntity = null) {
        if (this.health <= 0 || this.invulnerable || cause === "In wall") return false;
        const scaledDamage = this.tamed && sourceEntity?.type === EntityTypes.Mob
            ? (damage + 1) / 3 : damage;
        const armorPoints = 8;
        const reduction = Math.min(
            20,
            Math.max(armorPoints / 5, armorPoints - scaledDamage / 2),
        ) / 25;
        if (!this.damage(scaledDamage * (1 - reduction), sourceEntity)) return false;
        this.sitting = false;
        if (sourceEntity && sourceEntity !== this && sourceEntity.health > 0 &&
            sourceEntity.dimension === this.dimension && !this.isBaby) {
            this.retaliationTarget = sourceEntity;
            this.retaliationUntil = runtime.passedTime + 8;
        }
        playRandomSoundFromArray({
            array: CAIMAN_HURT,
            positional: true,
            origin: this.position,
            range: 12,
        });
        this.knockBack(hitfromX, kb * 0.6);
        return true;
    }

    updateCaimanAnimation() {
        const deltaTime = Math.min(Math.max(0, runtime.deltaTime || 0), 0.1);
        this.swimPhase = (this.swimPhase + deltaTime * 6) % (Math.PI * 2);
    }

    dieEvent() {
        this.releaseGrabbedTarget();
        this.dropLoot();
        this.world?.removeEntity?.(this);
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
            command: this.command,
            hasEgg: this.hasEgg,
            babyAgeTicks: this.babyAgeTicks,
            swimTimer: this.swimTimer,
            bellowCooldown: this.bellowCooldown,
            breedingCooldown: this.breedingCooldown,
            loveTicks: this.loveTicks,
        };
    }
}

export function createCaimanBody() {
    return new Body({ sprite: "alexsmobs/caiman.png", parts: {} });
}

function approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    return Math.max(value - amount, target);
}
