import { EntityTypes } from "../../game/entity.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { getBlock, hasBlockCollision } from "../../world/block.js";
import { Creeper } from "./creeper.js";
import { CreeperMinion, CreeperMinionEgg } from "./creeperMinion.js";
import { Enderman } from "./enderman.js";
import { SnowGolem } from "./golem.js";
import { Pig } from "./pig.js";
import { Skeleton } from "./variants.js";
import { Zombie } from "./zombie.js";
import { MutantBoneArrow, MutantIceShard } from "../projectiles/mutantProjectiles.js";
import { createMutantModelBody } from "./mutantModelBodies.js";
import { playPositionalSound, playRandomSoundFromArray } from "../../game/sounds.js";

const mutantSounds = (mob, names) => names.map(name => `mobs/${mob}/${name}`);
const ZOMBIE_AMBIENT = mutantSounds("mutant_zombie", ["ambient1", "ambient2", "ambient3"]);
const ZOMBIE_HURT = mutantSounds("mutant_zombie", ["hurt1", "hurt2"]);
const CREEPER_AMBIENT = mutantSounds("mutant_creeper", ["ambient1", "ambient2", "ambient3", "ambient4"]);
const SKELETON_AMBIENT = mutantSounds("mutant_skeleton", ["ambient1", "ambient2", "ambient3"]);
const SKELETON_HURT = mutantSounds("mutant_skeleton", ["hurt1", "hurt2", "hurt3", "hurt4"]);
const SKELETON_DEATH = mutantSounds("mutant_skeleton", ["death1", "death2"]);
const SKELETON_STEP = mutantSounds("mutant_skeleton", ["step1", "step2", "step3", "step4"]);
const ENDERMAN_AMBIENT = mutantSounds("mutant_enderman", ["ambient1", "ambient2"]);
const ENDERMAN_HURT = mutantSounds("mutant_enderman", ["hurt1", "hurt2", "hurt3"]);

function playMutantSound(entity, sounds) {
    playRandomSoundFromArray({ array: sounds, positional: true, origin: entity.position });
}

function playerDistance(mob, player) {
    return Vector2.Distance(
        new Vector2(
            mob.position.x + mob.hitbox.x / 2,
            mob.position.y + mob.hitbox.y / 2,
        ),
        new Vector2(
            player.position.x + player.hitbox.x / 2,
            player.position.y + player.hitbox.y / 2,
        ),
    );
}

function nearestMob(mob, range, canTarget) {
    let nearest = null;
    let nearestDistance = range;
    for (const entity of mob.world.entities) {
        if (
            entity === mob ||
            entity.dimension !== mob.dimension ||
            entity.type !== EntityTypes.Mob ||
            !canTarget(entity) ||
            entity.health <= 0
        ) continue;

        const distance = playerDistance(mob, entity);
        if (distance >= nearestDistance) continue;
        nearest = entity;
        nearestDistance = distance;
    }
    return nearest;
}

function triggerAttackPose(entity, duration = 0.4) {
    entity.attackPoseDuration = duration;
    entity.attackPoseUntil = runtime.passedTime + duration;
    if (entity.body) {
        entity.body.mutantAttackPoseDuration = duration;
        entity.body.mutantAttackPoseUntil = entity.attackPoseUntil;
    }
}

export class MutantZombie extends Zombie {
    static spawnSize = Object.freeze({ width: 1.1, height: 2.8 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 75,
            body: options.body ?? createMutantModelBody("MutantZombie"),
        });
        this.name = "Mutant Zombie";
        this.entityTypeName = "MutantZombie";
        this.isMutant = true;
        this.hitbox = new Vector2(
            MutantZombie.spawnSize.width * BLOCK_SIZE,
            MutantZombie.spawnSize.height * BLOCK_SIZE,
        );
        this.burnInSunlight = false;
        this.ambientSounds = ZOMBIE_AMBIENT;
        this.footstepSounds = null;
        this.speed = 1.2;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.roarCooldown = randomRange(6, 9);
        this.roarMoveUntil = 0;
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
        this.hitPlayerLogic();
        if (runtime.passedTime < this.roarMoveUntil) this.targetVelocity.x = 0;
        this.roarCooldown -= runtime.deltaTime;

        const player = this.world.player;
        if (!player || !player.abilities.hasHealth ||
            player.dimension !== this.dimension || this.roarCooldown > 0) return;
        const distance = playerDistance(this, player);
        if (distance < 2.5 * BLOCK_SIZE || distance > 8 * BLOCK_SIZE) return;

        const direction = Math.sign(
            player.position.x + player.hitbox.x / 2 - this.position.x - this.hitbox.x / 2,
        ) || this.direction;
        player.hit(5, this.position.x, 5, `Hit by ${this.name}'s roar`);
        player.velocity.x += direction * 3 * BLOCK_SIZE;
        player.velocity.y = Math.min(player.velocity.y, -2 * BLOCK_SIZE);
        this.roarCooldown = randomRange(8, 11);
        this.roarMoveUntil = runtime.passedTime + 0.8;
        this.targetVelocity.x = 0;
        playMutantSound(this, mutantSounds("mutant_zombie", ["roar1", "roar2"]));
        triggerAttackPose(this, 0.8);
    }

    hitPlayerLogic() {
        if (this.attackCooldown) return;
        const player = this.entityCollision(EntityTypes.Player);
        if (!player?.abilities.hasHealth) return;
        if (Math.random() < 0.2) {
            const direction = Math.sign(player.position.x - this.position.x) || this.direction;
            player.hit(8, this.position.x, 0, `Thrown by ${this.name}`);
            player.velocity.x = direction * 7 * BLOCK_SIZE;
            player.velocity.y = Math.min(player.velocity.y, -15 * BLOCK_SIZE);
            this.attackCooldown = 2.2;
            playPositionalSound(this.position, "mobs/mutant_zombie/attack.ogg");
            triggerAttackPose(this, 0.9);
            return;
        }
        player.hit(8, this.position.x, 7, `Killed by ${this.name}`);
        this.attackCooldown = 1.6;
        playPositionalSound(this.position, "mobs/mutant_zombie/attack.ogg");
        triggerAttackPose(this, 0.45);
    }

    hit(damage, hitfromX = 0, kb = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
        this.knockBack(hitfromX, kb);
        playMutantSound(this, ZOMBIE_HURT);
    }

    dieEvent() {
        this.dropLoot();
        playMutantSound(this, ZOMBIE_HURT);
        this.world.removeEntity(this, multiplayer);
    }
}

export class MutantCreeper extends Creeper {
    static spawnSize = Object.freeze({ width: 1.98, height: 2.8 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 150,
            body: options.body ?? createMutantModelBody("MutantCreeper"),
        });
        this.name = "Mutant Creeper";
        this.entityTypeName = "MutantCreeper";
        this.isMutant = true;
        this.hitbox = new Vector2(
            MutantCreeper.spawnSize.width * BLOCK_SIZE,
            MutantCreeper.spawnSize.height * BLOCK_SIZE,
        );
        this.maxVelocity.x = Math.max(this.maxVelocity.x, 5 * BLOCK_SIZE);
        this.speed = 1.3;
        this.stepSize = 1;
        this.jumpAttackCooldown = randomRange(3, 5);
        this.minionCooldown = randomRange(6, 10);
        this.chargeCooldown = randomRange(8, 12);
        this.chargeTime = 0;
        this.chargeHits = 0;
        this.lightningPending = false;
        this.dyingTime = 0;
        this.powered = options.powered ?? false;
        this.ambientSounds = CREEPER_AMBIENT;
        this.jumpAttacking = false;
    }

    update() {
        if (this.dyingTime > 0) {
            this.updateDeath();
            return;
        }
        if (this.chargeTime > 0) {
            this.updateEntity();
            this.updateCharge();
            return;
        }
        super.update();
        if (this.noAi || this.health <= 0) return;
        if (this.jumpAttacking) {
            if (this.grounded) {
                this.jumpAttacking = false;
                this.explode();
            } else this.targetVelocity.x = this.velocity.x;
            this.body.flashingColor = Math.floor(runtime.passedTime * 7) % 2 ? "white" : null;
            return;
        }
        this.jumpAttackCooldown -= runtime.deltaTime;
        this.minionCooldown -= runtime.deltaTime;
        this.chargeCooldown -= runtime.deltaTime;

        const player = this.world.player;
        if (!player || !player.abilities.hasHealth ||
            player.dimension !== this.dimension) {
            this.addHealth(this.maxHealth * 0.2 * runtime.deltaTime);
            return;
        }
        const distance = playerDistance(this, player);
        if (distance > 35 * BLOCK_SIZE && this.health < this.maxHealth) {
            this.addHealth(this.maxHealth * 0.2 * runtime.deltaTime);
        }
        if (!this.attackCooldown &&
            this.entityCollision(EntityTypes.Player)) {
            player.hit(5, this.position.x, 5, `Hit by ${this.name}`);
            player.velocity.y = Math.min(player.velocity.y, -3 * BLOCK_SIZE);
            this.attackCooldown = 1.3;
            triggerAttackPose(this, 0.4);
        }
        if (this.grounded && distance <= 20 * BLOCK_SIZE &&
            this.health <= this.maxHealth * 5 / 6 && this.chargeCooldown <= 0) {
            this.chargeTime = 5;
            this.chargeHits = randomRange(4, 7);
            this.lightningPending = !this.powered && this.getSkyExposure() > 0.5 &&
                Math.random() < 1 / 6;
            this.targetVelocity.x = 0;
            playPositionalSound(this.position, "mobs/mutant_creeper/charge.ogg");
            return;
        }
        if (this.minionCooldown <= 0 && distance <= 20 * BLOCK_SIZE) {
            this.summonMinions();
            this.minionCooldown = randomRange(13, 19);
        }
        if (!this.grounded || this.jumpAttackCooldown > 0) return;
        if (distance < 3.5 * BLOCK_SIZE || distance > 9 * BLOCK_SIZE) return;

        this.direction = Math.sign(
            player.position.x + player.hitbox.x / 2 - this.position.x - this.hitbox.x / 2,
        ) || this.direction;
        this.velocity.x = this.direction * 5 * BLOCK_SIZE;
        this.velocity.y = -10 * BLOCK_SIZE;
        this.jumpAttacking = true;
        this.jumpAttackCooldown = randomRange(4, 6);
        triggerAttackPose(this, 0.55);
    }

    updateCharge() {
        this.targetVelocity.x = 0;
        this.velocity.x = 0;
        const player = this.world.player;
        if (this.lightningPending && player?.dimension === this.dimension &&
            playerDistance(this, player) < 5 * BLOCK_SIZE &&
            this.getSkyExposure() > 0.5) {
            this.powered = true;
            this.lightningPending = false;
            this.chargeTime = 0;
            this.chargeCooldown = randomRange(12, 18);
            this.body.flashingColor = "#8ed8ff";
            if (playerDistance(this, player) < 2.5 * BLOCK_SIZE) {
                player.hit(6, this.position.x, 2, "Struck by Mutant Creeper lightning");
            }
            playPositionalSound(this.position, "mobs/mutant_creeper/charge.ogg");
            return;
        }
        this.chargeTime -= runtime.deltaTime;
        this.body.flashingColor = Math.floor(runtime.passedTime * 5) % 2 ? "white" : null;
        if (this.chargeTime > 0 && this.chargeHits > 0) return;
        if (this.chargeHits > 0) this.addHealth(this.maxHealth / 4);
        this.chargeTime = 0;
        this.lightningPending = false;
        this.chargeCooldown = randomRange(12, 18);
        this.body.flashingColor = null;
    }

    summonMinions() {
        const active = this.world.entities.filter(entity =>
            entity.entityTypeName === "CreeperMinion" &&
            entity.ownerUUID === this.UUID && entity.health > 0).length;
        const count = Math.min(4 - active,
            Math.ceil(this.health / this.maxHealth * 4));
        const chunk = this.world.getChunkForX(this.position.x, this.dimension);
        for (let i = 0; i < count; i++) {
            const minion = this.world.summonEntity(CreeperMinion,
                new Vector2(this.position.x + this.hitbox.x / 2 +
                    (i % 2 ? 1 : -1) * BLOCK_SIZE * 0.4,
                this.position.y + this.hitbox.y - BLOCK_SIZE),
                { ownerUUID: this.UUID, powered: this.powered,
                    myChunkX: chunk?.x ?? null }, multiplayer);
            minion.dimension = this.dimension;
            minion.velocity.x = (i % 2 ? 1 : -1) * 2 * BLOCK_SIZE;
            minion.velocity.y = -4 * BLOCK_SIZE;
            if (chunk && !chunk.entities.includes(minion)) chunk.entities.push(minion);
        }
    }

    hit(damage, hitfromX = 0, kb = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
        this.knockBack(hitfromX, kb);
        playPositionalSound(this.position,
            `mobs/mutant_creeper/hurt${Math.random() < 0.5 ? 1 : 2}.ogg`);
        if (this.chargeTime > 0 && --this.chargeHits <= 0) this.updateCharge();
    }

    hitByExplosion(damage, sourceEntity) {
        if (this.health <= 0 || sourceEntity?.entityTypeName === "MutantCreeper") return false;
        this.addHealth(damage / 2);
        return false;
    }

    dieEvent() {
        if (this.dyingTime > 0) return;
        this.dyingTime = 5;
        this.despawn = false;
        this.chargeTime = 0;
        this.lightningPending = false;
        this.targetVelocity.x = 0;
        playPositionalSound(this.position, "mobs/mutant_creeper/death.ogg");
    }

    updateDeath() {
        this.dyingTime -= runtime.deltaTime;
        this.body.flashingColor = Math.floor(runtime.passedTime * 9) % 2 ? "white" : null;
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        for (const entity of this.world.entities) {
            if (entity === this || entity.dimension !== this.dimension ||
                (entity.type !== EntityTypes.Player && entity.type !== EntityTypes.Mob)) continue;
            const dx = centerX - entity.position.x - entity.hitbox.x / 2;
            const dy = centerY - entity.position.y - entity.hitbox.y / 2;
            const distance = Math.hypot(dx, dy);
            if (distance > 8 * BLOCK_SIZE || distance < 1) continue;
            const pull = (1 - distance / (8 * BLOCK_SIZE)) * 2 * BLOCK_SIZE * runtime.deltaTime;
            entity.velocity.x += dx / distance * pull;
            entity.velocity.y += dy / distance * pull;
        }
        if (this.dyingTime > 0) return;
        this.world.createExplosion(new Vector2(centerX, centerY), {
            radius: (this.powered ? 12 : 8) * BLOCK_SIZE,
            damage: this.powered ? 48 : 32,
            power: this.powered ? 48 : 32,
            excludeEntity: this,
            sourceEntity: this,
            destroyTerrain: runtime.GAMERULES.doMobGriefing,
        });
        if (runtime.GAMERULES.doMobLoot && this.world.player?.dimension === this.dimension) {
            const chunk = this.world.getChunkForX(centerX, this.dimension);
            const egg = this.world.summonEntity(CreeperMinionEgg,
                new Vector2(centerX - 0.275 * BLOCK_SIZE,
                    this.position.y + this.hitbox.y - 0.65 * BLOCK_SIZE),
                { ownerUUID: this.world.player.UUID, powered: this.powered,
                    myChunkX: chunk?.x ?? null }, multiplayer);
            egg.dimension = this.dimension;
            if (chunk && !chunk.entities.includes(egg)) chunk.entities.push(egg);
        }
        this.world.removeEntity(this, multiplayer);
    }

    // The mutant uses melee and a landing blast, not the vanilla creeper fuse.
    checkPrime() {
        return;
    }

    explode() {
        this.world.createExplosion(new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y,
        ), {
            radius: 4 * BLOCK_SIZE,
            damage: this.powered ? 27 : 18,
            power: this.powered ? 24 : 16,
            excludeEntity: this,
            sourceEntity: this,
            destroyTerrain: runtime.GAMERULES.doMobGriefing,
        });
    }
}

export class MutantSkeleton extends Skeleton {
    static spawnSize = Object.freeze({ width: 1.2, height: 3.7 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 80,
            body: options.body ?? createMutantModelBody("MutantSkeleton"),
        });
        this.name = "Mutant Skeleton";
        this.body.setSprite("mutantbeasts/mutant_skeleton");
        this.entityTypeName = "MutantSkeleton";
        this.isMutant = true;
        this.hitbox = new Vector2(
            MutantSkeleton.spawnSize.width * BLOCK_SIZE,
            MutantSkeleton.spawnSize.height * BLOCK_SIZE,
        );
        this.burnInSunlight = false;
        this.ambientSounds = SKELETON_AMBIENT;
        this.footstepSounds = SKELETON_STEP;
        this.volleyCooldown = randomRange(1.5, 3);
        this.speed = 1.15;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.shootMoveUntil = 0;
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
        this.hitPlayerLogic();
        if (runtime.passedTime < this.shootMoveUntil) {
            this.targetVelocity.x = 0;
            return;
        }
        this.volleyCooldown -= runtime.deltaTime;
        const player = this.world.player;
        if (
            !player ||
            !player.abilities.hasHealth ||
            player.dimension !== this.dimension ||
            playerDistance(this, player) > 12 * BLOCK_SIZE ||
            playerDistance(this, player) < 2.5 * BLOCK_SIZE ||
            this.volleyCooldown > 0
        ) {
            return;
        }

        this.fireVolley(player);
        playPositionalSound(this.position, "mobs/mutant_skeleton/bow_shoot1.ogg");
        this.volleyCooldown = 2.8;
        this.shootMoveUntil = runtime.passedTime + 0.8;
        this.targetVelocity.x = 0;
        triggerAttackPose(this, 0.8);
    }

    fireVolley(target) {
        const start = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y * 0.35,
        );
        const targetX = target.position.x + target.hitbox.x / 2;
        const targetY = target.position.y + target.hitbox.y / 2;
        const angle = Math.atan2(targetY - start.y, targetX - start.x);

        for (const spread of [-0.28, -0.17, -0.06, 0.06, 0.17, 0.28]) {
            const shotAngle = angle + spread;
            this.world.summonEntity(
                MutantBoneArrow,
                start,
                {
                    velocity: new Vector2(
                        Math.cos(shotAngle) * 18 * BLOCK_SIZE,
                        Math.sin(shotAngle) * 18 * BLOCK_SIZE,
                    ),
                    dimension: this.dimension,
                },
                multiplayer,
            );
        }
    }

    hitPlayerLogic() {
        if (this.attackCooldown) return;
        const player = this.world.player;
        if (!player || !player.abilities.hasHealth || player.dimension !== this.dimension ||
            playerDistance(this, player) > 2.3 * BLOCK_SIZE) return;
        const direction = Math.sign(player.position.x - this.position.x) || this.direction;
        if (direction !== this.direction) return;
        player.hit(8, this.position.x, 0, `Punched by ${this.name}`);
        player.velocity.x = direction * 7 * BLOCK_SIZE;
        player.velocity.y = Math.min(player.velocity.y, -4 * BLOCK_SIZE);
        this.attackCooldown = 1.3;
        playPositionalSound(this.position, "mobs/mutant_skeleton/punch1.ogg");
        triggerAttackPose(this, 0.5);
    }

    hit(damage, hitfromX = 0, kb = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
        this.knockBack(hitfromX, kb);
        playMutantSound(this, SKELETON_HURT);
    }

    dieEvent() {
        this.dropLoot();
        playMutantSound(this, SKELETON_DEATH);
        this.world.removeEntity(this, multiplayer);
    }
}

export class MutantEnderman extends Enderman {
    static spawnSize = Object.freeze({ width: 1.55, height: 4.8 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 100,
            body: options.body ?? createMutantModelBody("MutantEnderman"),
        });
        this.name = "Mutant Enderman";
        this.entityTypeName = "MutantEnderman";
        this.isMutant = true;
        this.hitbox = new Vector2(
            MutantEnderman.spawnSize.width * BLOCK_SIZE,
            MutantEnderman.spawnSize.height * BLOCK_SIZE,
        );
        this.speed = 1.35;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.teleportCooldown = randomRange(7, 11);
        this.ambientSounds = ENDERMAN_AMBIENT;
    }

    update() {
        this.updateEntity();
        if (this.world.difficulty === "peaceful") {
            this.world.removeEntity(this);
            return;
        }
        this.aiUpdate();

        const player = this.world.player;
        if (!player || !player.abilities.hasHealth ||
            player.dimension !== this.dimension) return;

        if (!this.attackCooldown && this.entityCollision(EntityTypes.Player)) {
            player.hit(12, this.position.x, 8, `Hit by ${this.name}`);
            this.attackCooldown = 1.6;
            triggerAttackPose(this, 0.5);
        }

        this.teleportCooldown -= runtime.deltaTime;
        if (
            this.teleportCooldown > 0 ||
            playerDistance(this, player) > 16 * BLOCK_SIZE
        ) {
            return;
        }

        const destination = this.findTeleportPosition(player);
        this.teleportCooldown = destination ? randomRange(7, 11) : randomRange(1.5, 3);
        if (!destination) return;

        this.position = destination;
        playPositionalSound(this.position, "mobs/mutant_enderman/scream.ogg");
        this.velocity = new Vector2();
        this.targetVelocity = new Vector2();
        this.direction = Math.sign(player.position.x - destination.x) || this.direction;
        this.moving = false;
        this.resetMoveTime();
        triggerAttackPose(this, 0.5);
        this.hitNearbyEntities();
    }

    findTeleportPosition(player) {
        const side = Math.random() < 0.5 ? -1 : 1;
        for (const distance of [3, 4, 5, 2]) {
            const centerX =
                player.position.x +
                player.hitbox.x / 2 +
                side * distance * BLOCK_SIZE;
            const x = Math.floor(centerX / BLOCK_SIZE) * BLOCK_SIZE +
                (BLOCK_SIZE - this.hitbox.x) / 2;
            for (const heightOffset of [0, -1, 1, -2, 2]) {
                const feetY = player.position.y + player.hitbox.y + heightOffset * BLOCK_SIZE;
                const y = feetY - this.hitbox.y;
                let clear = true;
                for (const sampleX of [x + 1, x + this.hitbox.x - 1]) {
                    const ground = this.world.getBlockAtWorldPosition(
                        sampleX, feetY + 1, false, this.dimension,
                    );
                    if (!ground || !hasBlockCollision(ground)) {
                        clear = false;
                        break;
                    }
                    for (let sampleY = y; sampleY < feetY; sampleY += BLOCK_SIZE) {
                        const block = this.world.getBlockAtWorldPosition(
                            sampleX, sampleY, false, this.dimension,
                        );
                        const definition = block && getBlock(block.blockType);
                        if (!definition || definition.fluid || hasBlockCollision(block)) {
                            clear = false;
                            break;
                        }
                    }
                    if (!clear) break;
                    const footBlock = this.world.getBlockAtWorldPosition(
                        sampleX, feetY - 1, false, this.dimension,
                    );
                    if (!footBlock || hasBlockCollision(footBlock) ||
                        getBlock(footBlock.blockType)?.fluid) {
                        clear = false;
                        break;
                    }
                }
                if (clear) return new Vector2(x, y);
            }
        }
        return null;
    }

    hitNearbyEntities() {
        for (const entity of this.world.entities) {
            if (
                entity === this ||
                entity.dimension !== this.dimension ||
                (entity.type === EntityTypes.Player && !entity.abilities.hasHealth) ||
                (entity.type !== EntityTypes.Player && entity.type !== EntityTypes.Mob)
            ) {
                continue;
            }

            if (Vector2.Distance(this.position, entity.position) > 2.5 * BLOCK_SIZE)
                continue;
            entity.hit?.(2, this.position.x, 5, "Hit by a Mutant Enderman teleport");
            const direction = Math.sign(entity.position.x - this.position.x) || 1;
            entity.velocity.x += direction * 4 * BLOCK_SIZE;
            entity.velocity.y = Math.min(entity.velocity.y, -4 * BLOCK_SIZE);
        }
    }

    hit(damage, hitFromX = 0, knockback = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
        this.knockBack(hitFromX, knockback);
        playMutantSound(this, ENDERMAN_HURT);
    }

    dieEvent() {
        this.dropLoot();
        playPositionalSound(this.position, "mobs/mutant_enderman/death.ogg");
        this.world.removeEntity(this, multiplayer);
    }
}

export class MutantSnowGolem extends SnowGolem {
    static spawnSize = Object.freeze({ width: 1.2, height: 2.8 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 60,
            body: options.body ?? createMutantModelBody("MutantSnowGolem"),
        });
        this.name = "Mutant Snow Golem";
        this.entityTypeName = "MutantSnowGolem";
        this.isMutant = true;
        this.hitbox = new Vector2(
            MutantSnowGolem.spawnSize.width * BLOCK_SIZE,
            MutantSnowGolem.spawnSize.height * BLOCK_SIZE,
        );
        this.isHostile = false;
        this.speed = 1;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.trackingHostile = false;
    }

    update() {
        super.update();
        const target = nearestMob(this, 10 * BLOCK_SIZE, entity => entity.isHostile);
        if (!target) {
            if (this.trackingHostile) {
                this.trackingHostile = false;
                this.targetVelocity.x = 0;
                this.moving = false;
                this.resetMoveTime();
            }
            return;
        }

        this.trackingHostile = true;
        const distance = playerDistance(this, target);
        this.direction = Math.sign(target.position.x - this.position.x) || this.direction;
        this.targetVelocity.x = distance > 4 * BLOCK_SIZE
            ? this.direction * this.speed * BLOCK_SIZE : 0;
        if (this.attackCooldown) return;

        const start = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y * 0.4,
        );
        const targetX = target.position.x + target.hitbox.x / 2;
        const targetY = target.position.y + target.hitbox.y / 2;
        const angle = Math.atan2(targetY - start.y, targetX - start.x);
        this.world.summonEntity(
            MutantIceShard,
            start,
            {
                velocity: new Vector2(
                    Math.cos(angle) * 14 * BLOCK_SIZE,
                    Math.sin(angle) * 14 * BLOCK_SIZE,
                ),
                dimension: this.dimension,
                ownerUUID: this.UUID,
            },
            multiplayer,
        );
        this.attackCooldown = 1.5;
        triggerAttackPose(this, 0.4);
    }
}

export class SpiderPig extends Pig {
    static spawnSize = Object.freeze({ width: 1.3, height: 2.1 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 25,
            body: options.body ?? createMutantModelBody("SpiderPig"),
        });
        this.name = "Spider Pig";
        this.entityTypeName = "SpiderPig";
        this.isMutant = true;
        this.hitbox = new Vector2(
            SpiderPig.spawnSize.width * BLOCK_SIZE,
            SpiderPig.spawnSize.height * BLOCK_SIZE,
        );
        this.speed = 1.4;
        this.maxVelocity.x = 4.5 * BLOCK_SIZE;
        this.leapCooldown = randomRange(1, 2.5);
        this.chasingPrey = false;
    }

    update() {
        super.update();
        this.leapCooldown -= runtime.deltaTime;

        const target = nearestMob(this, 7 * BLOCK_SIZE,
            entity => entity instanceof Pig && !entity.isMutant);
        if (!target) {
            if (this.chasingPrey) {
                this.chasingPrey = false;
                this.targetVelocity.x = 0;
                this.moving = false;
                this.resetMoveTime();
            }
            return;
        }

        this.chasingPrey = true;
        const distance = playerDistance(this, target);
        this.direction = Math.sign(target.position.x - this.position.x) || this.direction;
        this.targetVelocity.x = distance > 1.5 * BLOCK_SIZE
            ? this.direction * this.speed * BLOCK_SIZE : 0;
        if (!this.grounded && this.velocity.x === 0 && this.targetVelocity.x !== 0) {
            this.velocity.y = Math.min(this.velocity.y, -2 * BLOCK_SIZE);
        }
        if (distance <= 1.5 * BLOCK_SIZE && !this.attackCooldown) {
            target.hit(8, this.position.x, 5, `Bitten by ${this.name}`);
            this.attackCooldown = 1.3;
            triggerAttackPose(this, 0.4);
            return;
        }
        if (!this.grounded || this.leapCooldown > 0 ||
            (distance >= 2.5 * BLOCK_SIZE && Math.random() >= 0.05)) return;

        this.direction = Math.sign(
            target.position.x + target.hitbox.x / 2 - this.position.x - this.hitbox.x / 2,
        ) || this.direction;
        this.velocity.x = this.direction * 4.5 * BLOCK_SIZE;
        this.velocity.y = -8 * BLOCK_SIZE;
        this.leapCooldown = 1.2;
        triggerAttackPose(this, 0.45);
    }
}
