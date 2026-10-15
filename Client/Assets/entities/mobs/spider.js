import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { EntityTypes } from "../../game/entity.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { daylightFactor } from "../../utils/daylight.js";

export class Spider extends Mob {
    static spawnSize = Object.freeze({ width: 1.4, height: 0.9 });

    constructor(world, {
        health = 16,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        UUID,
        body = createSpiderBody(),
    } = {}) {
        super(world, {
            name: "Spider",
            health,
            position,
            hitbox: new Vector2(
                Spider.spawnSize.width * BLOCK_SIZE,
                Spider.spawnSize.height * BLOCK_SIZE,
            ),
            invulnerable,
            body,
            noAi,
            ai: AI.Zombie,
            speed: 1.2,
            stepSize: 0.5,
            myChunkX,
            UUID,
            isHostile: true,
            lootTable: new LootTable([
                new LootItem({
                    itemId: Items.String,
                    maxCount: 2,
                    subtract: 2,
                }),
            ]),
        });

        this.entityTypeName = "Spider";
        this.isSpider = true;
        this.attackCooldownMax = 1.25;
        this.playerRetaliationUntil = 0;
        this.aggressiveNow = false;
    }

    update() {
        this.aggressiveNow = this.isAggressiveAtCurrentLight();
        this.ai = this.aggressiveNow ? AI.Zombie : AI.PassiveSimple;
        this.updateEntity();
        this.aiUpdate();
        this.hitPlayerLogic();
    }

    isAggressiveAtCurrentLight() {
        if (runtime.passedTime < this.playerRetaliationUntil) return true;

        const daylight = daylightFactor(runtime.time) > 0.45 && this.getSunLight();
        const blockLight = this.getLightLevel();
        return !daylight && (blockLight == null || blockLight <= 8);
    }

    hitPlayerLogic() {
        if (!this.aggressiveNow || this.attackCooldown > 0) return;

        const player = this.entityCollision(EntityTypes.Player);
        if (!player || !player.abilities.hasHealth) return;

        player.hit(
            3,
            this.position.x + this.hitbox.x / 2,
            2,
            "Killed by Spider",
            this,
        );
        this.attackCooldown = this.attackCooldownMax;
    }

    hit(damage, hitfromX = 0, knockback = 0, _cause = null, attacker = null) {
        if (!this.health || !this.damage(damage, attacker)) return;
        if (attacker?.type === EntityTypes.Player) {
            this.playerRetaliationUntil = runtime.passedTime + 8;
        }
        this.knockBack(hitfromX, knockback);
    }

    dieEvent() {
        this.dropLoot();
        this.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }
}

export function createSpiderBody() {
    return new Body({
        sprite: "spider/spider.svg",
        renderScale: 1.4,
        parts: {
            spider: new BodyPart({
                spriteCrop: { x: 0, y: 0, width: 128, height: 64 },
                offset: { x: 16, y: 20.5 },
                flip: true,
            }),
        },
    });
}
