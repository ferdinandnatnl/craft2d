import { AI, Mob } from "../mob.js";
import { createZombieBody } from "./zombie.js";
import { EntityTypes } from "../../game/entity.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";

export class Blaze extends Mob {
    static spawnSize = Object.freeze({ width: 0.65, height: 1.8 });

    constructor(world, {
        health = 20,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        body = createBlazeBody(),
    } = {}) {
        super(world, {
            name: "Blaze",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            body,
            hitbox: new Vector2(0.65 * BLOCK_SIZE, 1.8 * BLOCK_SIZE),
            ai: AI.Zombie,
            speed: 1.1,
            stepSize: 0.4,
            isHostile: true,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.BlazeRod, maxCount: 1, subtract: 1 }),
            ]),
        });
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
        if (this.attackCooldown) return;
        const player = this.entityCollision(EntityTypes.Player);
        if (!player) return;
        player.hit(4, this.position.x, 3, "Killed by Blaze");
        player.fire = Math.max(player.fire, 60);
        this.attackCooldown = 1.5;
    }

    hit(damage, hitFromX = 0, knockback = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
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

export function createBlazeBody() {
    const body = createZombieBody();
    body.setSprite("blaze/blaze");
    return body;
}
