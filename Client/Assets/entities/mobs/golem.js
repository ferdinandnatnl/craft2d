import { runtime } from "../../utils/runtime.js";
import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";

class Golem extends Mob {
    constructor(world, { name, health, hitbox, body, lootTable, ...options }) {
        super(world, {
            name,
            health,
            hitbox,
            body,
            lootTable,
            ai: AI.PassiveSimple,
            speed: 0.7,
            stepSize: 0.5,
            ...options,
        });
        this.despawn = false;
        this.entityTypeName = this.constructor.name;
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
    }

    dropLoot() {
        if (!this.lootTable || !runtime.GAMERULES.doMobLoot) return;

        for (const item of this.lootTable.getRandomLoot()) {
            this.world.spawnDrop(
                new Vector2(
                    this.position.x + randomRange(-this.hitbox.x, this.hitbox.x),
                    this.position.y + this.hitbox.y,
                ),
                {
                    blockId: item.blockId,
                    itemId: item.itemId,
                    count: item.count,
                },
            );
        }
    }

    dieEvent() {
        this.dropLoot();
        this.world.removeEntity(this, multiplayer);
    }

    interact() {}
}

export class IronGolem extends Golem {
    static spawnSize = Object.freeze({ width: 1.4, height: 2.7 });

    constructor(world, options = {}) {
        super(world, {
            name: "Iron Golem",
            health: 100,
            hitbox: new Vector2(1.4 * BLOCK_SIZE, 2.7 * BLOCK_SIZE),
            body: options.body ?? createIronGolemBody(),
            lootTable: new LootTable([
                new LootItem({ itemId: Items.IronIngot, maxCount: 5, subtract: 2 }),
            ]),
            ...options,
        });
        this.attackCooldown = 0;
        this.attackCooldownMax = 1.5;
    }

    update() {
        super.update();
        this.fightNearbyHostiles();
    }

    fightNearbyHostiles() {
        if (this.noAi || this.health <= 0) return;

        const detectionRange = 10 * BLOCK_SIZE;
        const ownCenterX = this.position.x + this.hitbox.x / 2;
        const ownCenterY = this.position.y + this.hitbox.y / 2;
        let target = null;
        let targetOffsetX = 0;
        let nearestDistance = detectionRange;

        for (const entity of this.world.entities) {
            if (
                entity === this ||
                entity.dimension !== this.dimension ||
                entity.isHostile !== true ||
                entity.health <= 0
            ) continue;

            const offsetX = entity.position.x + entity.hitbox.x / 2 - ownCenterX;
            const offsetY = entity.position.y + entity.hitbox.y / 2 - ownCenterY;
            const distance = Math.hypot(offsetX, offsetY);
            if (distance > nearestDistance) continue;

            target = entity;
            targetOffsetX = offsetX;
            nearestDistance = distance;
        }

        if (!target) {
            if (this.chasingHostile) {
                this.chasingHostile = false;
                this.moving = false;
                this.targetVelocity.x = 0;
                this.resetMoveTime();
            }
            return;
        }

        this.chasingHostile = true;

        if (targetOffsetX !== 0) this.direction = Math.sign(targetOffsetX);

        const attackReach = (this.hitbox.x + target.hitbox.x) / 2 + BLOCK_SIZE * 0.15;
        const verticalOverlap =
            this.position.y < target.position.y + target.hitbox.y &&
            this.position.y + this.hitbox.y > target.position.y;

        if (Math.abs(targetOffsetX) <= attackReach && verticalOverlap) {
            this.targetVelocity.x = 0;
            if (!this.attackCooldown) {
                target.hit(20, ownCenterX, 8, `Hit by ${this.name}`, this);
                this.attackCooldown = this.attackCooldownMax;
            }
            return;
        }

        if (Math.abs(targetOffsetX) > attackReach) {
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
        } else {
            this.targetVelocity.x = 0;
        }

        if (this.grounded && this.velocity.x === 0) this.jump();
    }

    interact(player, item) {
        if (item?.itemId !== Items.IronIngot || this.health >= this.maxHealth)
            return;
        this.health = Math.min(this.maxHealth, this.health + 25);
        if (!player.abilities.instaBuild) player.removeFromCurrentSlot();
    }
}

export class SnowGolem extends Golem {
    static spawnSize = Object.freeze({ width: 0.8, height: 1.9 });

    constructor(world, options = {}) {
        super(world, {
            name: "Snow Golem",
            health: 4,
            hitbox: new Vector2(0.8 * BLOCK_SIZE, 1.9 * BLOCK_SIZE),
            body: options.body ?? createSnowGolemBody(),
            lootTable: new LootTable([
                new LootItem({ itemId: Items.Snowball, maxCount: 15, subtract: 15 }),
            ]),
            ...options,
        });
    }
}

function createGolemBody(sprite, width, height, hitbox) {
    return new Body({
        sprite,
        parts: {
            body: new BodyPart({
                spriteCrop: { x: 0, y: 0, width, height },
                offset: {
                    x: (hitbox.x / 4) * (64 / BLOCK_SIZE),
                    y: (height * BLOCK_SIZE) / 32,
                },
            }),
        },
    });
}

export function createIronGolemBody() {
    const hitbox = new Vector2(1.4 * BLOCK_SIZE, 2.7 * BLOCK_SIZE);
    return createGolemBody("golem/iron_golem.svg", 32, 48, hitbox);
}

export function createSnowGolemBody() {
    const hitbox = new Vector2(0.8 * BLOCK_SIZE, 1.9 * BLOCK_SIZE);
    return createGolemBody("golem/snow_golem.svg", 16, 32, hitbox);
}
