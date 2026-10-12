import { EntityTypes } from "../../game/entity.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { getBlock, hasBlockCollision } from "../../world/block.js";
import { Creeper } from "./creeper.js";
import { Enderman } from "./enderman.js";
import { SnowGolem } from "./golem.js";
import { Pig } from "./pig.js";
import { Skeleton } from "./variants.js";
import { Zombie } from "./zombie.js";
import { MutantBoneArrow, MutantIceShard } from "../projectiles/mutantProjectiles.js";
import { createMutantModelBody } from "./mutantModelBodies.js";

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
        this.speed = 1.2;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.roarCooldown = randomRange(6, 9);
        this.roarMoveUntil = 0;
    }

    update() {
        super.update();
        if (runtime.passedTime < this.roarMoveUntil) this.targetVelocity.x = 0;
        this.roarCooldown -= runtime.deltaTime;

        const player = this.world.player;
        if (!player || player.dimension !== this.dimension || this.roarCooldown > 0) return;
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
        triggerAttackPose(this, 0.8);
    }

    hitPlayerLogic() {
        if (this.attackCooldown) return;
        const player = this.entityCollision(EntityTypes.Player);
        if (!player) return;
        player.hit(8, this.position.x, 7, `Killed by ${this.name}`);
        this.attackCooldown = 1.6;
        triggerAttackPose(this, 0.45);
    }
}

export class MutantCreeper extends Creeper {
    static spawnSize = Object.freeze({ width: 1.35, height: 3.9 });

    constructor(world, options = {}) {
        super(world, {
            ...options,
            health: options.health ?? 60,
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
        this.jumpAttackCooldown = randomRange(2.5, 4);
        this.jumpAttacking = false;
    }

    update() {
        super.update();
        if (this.jumpAttacking) {
            if (this.grounded) this.jumpAttacking = false;
            else this.targetVelocity.x = this.velocity.x;
        }
        this.jumpAttackCooldown -= runtime.deltaTime;

        const player = this.world.player;
        if (!player || player.dimension !== this.dimension || this.primed || !this.grounded ||
            this.jumpAttackCooldown > 0) return;
        const distance = playerDistance(this, player);
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

    explode() {
        this.world.createExplosion(this.position, {
            radius: 4 * BLOCK_SIZE,
            damage: 18,
            power: 16,
            excludeEntity: this,
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
        this.volleyCooldown = randomRange(1.5, 3);
        this.speed = 1.15;
        this.maxVelocity.x = this.speed * BLOCK_SIZE * 1.5;
        this.shootMoveUntil = 0;
    }

    update() {
        super.update();
        if (runtime.passedTime < this.shootMoveUntil) {
            this.targetVelocity.x = 0;
            return;
        }
        this.volleyCooldown -= runtime.deltaTime;
        const player = this.world.player;
        if (
            !player ||
            player.dimension !== this.dimension ||
            playerDistance(this, player) > 12 * BLOCK_SIZE ||
            playerDistance(this, player) < 2.5 * BLOCK_SIZE ||
            this.volleyCooldown > 0
        ) {
            return;
        }

        this.fireVolley(player);
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
        this.speed = 0;
        this.targetVelocity.x = 0;
        this.teleportCooldown = randomRange(1.8, 2.8);
    }

    update() {
        this.updateEntity();
        this.attackCooldownLogic();
        this.targetVelocity.x = 0;
        this.velocity.x = 0;

        if (this.world.difficulty === "peaceful") {
            this.world.removeEntity(this);
            return;
        }

        const player = this.world.player;
        if (!player || player.dimension !== this.dimension) return;

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
        this.teleportCooldown = randomRange(2, 3.2);
        if (!destination) return;

        this.position = destination;
        this.velocity = new Vector2();
        this.targetVelocity = new Vector2();
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
            const y = player.position.y;
            let clear = true;

            for (
                let sampleX = x;
                sampleX < x + this.hitbox.x;
                sampleX += BLOCK_SIZE
            ) {
                for (
                    let sampleY = y;
                    sampleY < y + this.hitbox.y;
                    sampleY += BLOCK_SIZE
                ) {
                    const block = this.world.getBlockAtWorldPosition(
                        sampleX,
                        sampleY,
                        false,
                        this.dimension,
                    );
                    const definition = block && getBlock(block.blockType);
                    if (!definition || (hasBlockCollision(block) && !definition.fluid)) {
                        clear = false;
                        break;
                    }
                }
                if (!clear) break;
            }

            if (clear) return new Vector2(x, y);
        }
        return null;
    }

    hitNearbyEntities() {
        for (const entity of this.world.entities) {
            if (
                entity === this ||
                entity.dimension !== this.dimension ||
                (entity.type !== EntityTypes.Player && entity.type !== EntityTypes.Mob)
            ) {
                continue;
            }

            if (Vector2.Distance(this.position, entity.position) > 2.5 * BLOCK_SIZE)
                continue;
            entity.hit?.(2, this.position.x, 5, "Hit by a Mutant Enderman teleport");
        }
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
