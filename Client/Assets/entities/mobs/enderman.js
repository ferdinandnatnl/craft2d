import { AI, Mob } from "../mob.js";
import { createZombieBody } from "./zombie.js";
import { EntityTypes } from "../../game/entity.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";

export class Enderman extends Mob {
    constructor(world, {
        health = 40,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        body = createEndermanBody(),
    } = {}) {
        super(world, {
            name: "Enderman",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            body,
            hitbox: new Vector2(0.55 * BLOCK_SIZE, 2.6 * BLOCK_SIZE),
            ai: AI.Zombie,
            speed: 1.5,
            stepSize: 0.4,
            isHostile: true,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.EnderPearl, maxCount: 1, subtract: 1 }),
            ]),
        });
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
        if (this.attackCooldown) return;
        const player = this.entityCollision(EntityTypes.Player);
        if (!player) return;
        player.hit(6, this.position.x, 4, "Killed by Enderman");
        this.attackCooldown = 1;
    }

    hit(damage, hitFromX = 0, knockback = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitFromX, knockback);
    }

    dieEvent() {
        this.dropLoot();
        this.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }
}

export function createEndermanBody() {
    const body = createZombieBody();
    body.setSprite("enderman/enderman");
    return body;
}
