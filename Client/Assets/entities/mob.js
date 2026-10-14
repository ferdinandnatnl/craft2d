import { runtime } from "../utils/runtime.js";
import { Drop } from "./drop.js";
import { Entity, EntityTypes } from "../game/entity.js";
import { playRandomSoundFromArray } from "../game/sounds.js";
import { Vector2, caculateDirection, randomRange } from "../utils/classes.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import {
    applyBreedableAnimalState,
    followAnimalFood,
} from "./mobs/animalBehavior.js";

export class Mob extends Entity {
    constructor(
        world,
        {
            name = "Mob",
            health = 10,
            noAi = false,
            noGravity = false,
            position = new Vector2(),
            hitbox = new Vector2(1, 1),
            invulnerable = false,
            type = EntityTypes.Mob,
            float = true,
            ai,
            speed = 2,
            body = null,
            stepSize = 1,
            footstepSounds = null,
            ambientSounds = null,
            ambientSoundRange = { min: 5, max: 20 },
            lootTable = null,
            myChunkX = 0,
            UUID,
            burnInSunlight = false,
            isHostile = false,
            canSwim = true,
            canDrown = true,
            despawn = true,
        } = {},
    ) {
        super(world, {
            name: name,
            position: position,
            hitbox: hitbox,
            noGravity: noGravity,
            float: float,
            canSwim: canSwim,
            canDrown: canDrown,
            despawn: despawn,
            invulnerable: invulnerable,
            type: type,
            body: body,
            direction: -1,
            forceDirection: true,
            stepSize: stepSize,
            footstepSounds: footstepSounds,
            direction: randomRange(0, 2) ? 1 : -1,
            maxVelocity: new Vector2(speed * BLOCK_SIZE * 1.5, 1000),
            myChunkX: myChunkX,
            UUID,
        });

        this.health = health;
        this.maxHealth = health;
        this.noAi = noAi;
        this.speed = speed;
        this.ai = ai;
        this.timeLastMoved = 0;
        this.ambientSounds = ambientSounds;
        this.ambientSoundCounter = 0;
        this.ambientSoundRange = ambientSoundRange;
        this.ambientSoundTarget = randomRange(
            this.ambientSoundRange.min,
            this.ambientSoundRange.max,
        );
        this.randomMoveTime = randomRange(0, ai.moveTimeRange.max / 2);
        this.moving = false;

        this.lootTable = lootTable;

        this.state = aiState.Wander;

        this.attackCooldown = 1;

        this.attackCooldownMax = 1;

        this.retaliationTarget = null;
        this.retaliationUntil = 0;

        this.burnInSunlight = burnInSunlight;
        this.isHostile = isHostile;
    }

    get isBaby() {
        return (this.babyAgeTicks ?? 0) > 0;
    }

    syncBreedableAnimalState(state) {
        applyBreedableAnimalState(this, state);
    }

    aiUpdate() {
        if (this.isHostile && this.world.difficulty === "peaceful") {
            this.world.removeEntity(this);
            return;
        }

        if (!followAnimalFood(this)) {
            switch (this.state) {
                case aiState.Wander:
                    this.passiveWander();
                    break;
                case aiState.Agression:
                    this.agressionWalk();
            }
        }

        if (this.burnInSunlight) {
            if (this.getSunLight() && this.getLightLevel() >= 14) {
                this.fire = 100;
            }
        }

        if (this.ai.agressionLevel === Agression.Agressive)
            this.agressionBehaviour();

        this.attackRetaliationTarget();

        this.ambientLogic();

        this.attackCooldownLogic();

        this.getOutOfBlocks();
    }

    getOutOfBlocks() {
        const collidingWith = this.isCollidingWithBlockType();
        if (
            this.filterBlocksByProperty(collidingWith, "collision").length >
                0 &&
            this.filterBlocksByProperty(collidingWith, "fluid").length === 0
        ) {
            this.position.y -= BLOCK_SIZE;
        }
    }

    attackCooldownLogic() {
        if (this.attackCooldown > 0) this.attackCooldown -= runtime.deltaTime;

        if (this.attackCooldown < 0) this.attackCooldown = 0;
    }

    agressionBehaviour() {
        if (this.getAgressionTarget()) {
            this.state = aiState.Agression;
            return;
        }

        if (!this.world.player) return;
        if (!this.world.player.abilities.hasHealth) {
            this.state = aiState.Wander;
            return;
        }

        if (
            Math.abs(
                Vector2.Distance(this.position, this.world.player.position),
            ) <= this.ai.agressionArea
        ) {
            this.state = aiState.Agression;
            return;
        }

        this.state = aiState.Wander;
    }

    agressionWalk() {
        const target = this.getAgressionTarget() ?? this.world.player;
        if (!target || (target.type === EntityTypes.Player &&
            !target.abilities.hasHealth)) return;

        this.direction = caculateDirection(
            this.position,
            target.position,
        );

        if (this.velocity.x === 0) {
            this.jump();
        }

        if (
            Math.abs(
                Vector2.XDistance(this.position, target.position),
            ) <
            BLOCK_SIZE / 4
        ) {
            this.targetVelocity.x = 0;
            return;
        }

        this.targetVelocity.x =
            (this.direction < 0 ? -this.speed : this.speed) * BLOCK_SIZE;
    }

    getAgressionTarget() {
        return this.getRetaliationTarget();
    }

    getRetaliationTarget() {
        const target = this.retaliationTarget;
        if (
            !target ||
            runtime.passedTime > this.retaliationUntil ||
            target.health <= 0 ||
            target.type !== EntityTypes.Mob ||
            target.dimension !== this.dimension ||
            !this.world.entities.includes(target)
        ) {
            this.retaliationTarget = null;
            return null;
        }

        const distance = Vector2.Distance(
            new Vector2(
                this.position.x + this.hitbox.x / 2,
                this.position.y + this.hitbox.y / 2,
            ),
            new Vector2(
                target.position.x + target.hitbox.x / 2,
                target.position.y + target.hitbox.y / 2,
            ),
        );
        const aggressionRange = this.ai?.agressionArea ?? 0;
        if (distance > aggressionRange) {
            this.retaliationTarget = null;
            return null;
        }

        return target;
    }

    attackRetaliationTarget() {
        if (!this.isHostile || this.noAi || this.attackCooldown > 0) return;
        const target = this.getAgressionTarget();
        if (!target) return;

        const overlaps =
            this.position.x < target.position.x + target.hitbox.x &&
            this.position.x + this.hitbox.x > target.position.x &&
            this.position.y < target.position.y + target.hitbox.y &&
            this.position.y + this.hitbox.y > target.position.y;
        if (!overlaps) return;

        target.hit(4, this.position.x + this.hitbox.x / 2, 3, undefined, this);
        this.attackPoseUntil = runtime.passedTime + 0.4;
        this.attackCooldown = this.attackCooldownMax;
    }

    ambientLogic() {
        if (!this.ambientSounds) return;

        if (this.ambientSoundCounter >= this.ambientSoundTarget) {
            this.ambientSoundCounter = 0;
            this.ambientSoundTarget = randomRange(
                this.ambientSoundRange.min,
                this.ambientSoundRange.max,
            );

            playRandomSoundFromArray({
                array: this.ambientSounds,
                positional: true,
                origin: this.position,
                range: 7,
            });
        }

        this.ambientSoundCounter += runtime.deltaTime;
    }

    passiveWander() {
        this.timeLastMoved += runtime.deltaTime;

        if (this.timeLastMoved >= this.randomMoveTime) {
            if (!this.moving) this.moveToRandomX();
            else {
                this.moving = false;
                this.resetMoveTime();
            }
        }

        //game.chat.message(`${this.timeLastMoved} - ${this.randomMoveTime}`);

        if (this.moving) {
            if (
                this.velocity.x === 0 &&
                this.moving &&
                this.timeLastMoved > 0.2
            ) {
                this.jump();
            }

            this.targetVelocity.x =
                (this.direction < 0 ? -this.speed : this.speed) * BLOCK_SIZE;
        }
    }

    dropLoot() {
        if (!this.lootTable) return;
        if (!runtime.GAMERULES.doMobLoot) return;

        const loot = this.lootTable.getRandomLoot();

        loot.forEach((item) => {
            this.world.summonEntity(
                Drop,
                new Vector2(
                    this.position.x +
                        randomRange(-this.hitbox.x, this.hitbox.x),
                    this.position.y,
                ),
                {
                    blockId: item.blockId,
                    itemId: item.itemId,
                    count: item.count,
                },
            );
        });
    }

    jump() {
        if (!this.grounded) return;

        this.velocity.y = -8 * BLOCK_SIZE;
    }

    resetMoveTime() {
        this.timeLastMoved = 0;
        this.randomMoveTime = randomRange(
            this.ai.moveTimeRange.min,
            this.ai.moveTimeRange.max,
        );
    }

    moveToRandomX() {
        this.moving = true;
        this.direction = randomRange(0, 2) == 1 ? 1 : -1;
        this.resetMoveTime();
    }
}

export class aiType {
    constructor({
        moveTimeRange = { min: 1, max: 10 },
        agressionLevel = Agression.Passive,
        agressionArea = 0,
    } = {}) {
        this.moveTimeRange = moveTimeRange;
        this.agressionLevel = agressionLevel;
        this.agressionArea = agressionArea * BLOCK_SIZE;
    }
}

export const Agression = Object.freeze({
    Passive: 0,
    Agressive: 1,
    Neutral: 2,
});

export const aiState = Object.freeze({
    Wander: 0,
    Agression: 1,
});

export const AI = Object.freeze({
    PassiveSimple: new aiType({
        moveTimeRange: { min: 3, max: 7 },
    }),
    Zombie: new aiType({
        moveTimeRange: { min: 3, max: 7 },
        agressionLevel: Agression.Agressive,
        agressionArea: 11,
    }),
});
