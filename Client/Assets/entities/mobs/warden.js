import { AI, Mob } from "../mob.js";
import { EntityTypes } from "../../game/entity.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Sounds, playPositionalSound, playRandomSoundFromArray } from "../../game/sounds.js";

export class Warden extends Mob {
    constructor(world, {
        health = 250,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
    } = {}) {
        super(world, {
            name: "Warden",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            hitbox: new Vector2(1.1 * BLOCK_SIZE, 3 * BLOCK_SIZE),
            ai: AI.Zombie,
            speed: 0.85,
            stepSize: 0.4,
            isHostile: true,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.EchoShard, maxCount: 2 }),
            ]),
        });

        this.sprite = "entity/warden-art/warden.svg";
        this.img.src = getSpriteUrl(this.sprite);
        this.spriteScale = 4;
        this.voxelSprite = true;
        this.despawn = false;
        this.attackCooldownMax = 2;
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
        this.hitPlayerLogic();
    }

    hitPlayerLogic() {
        if (this.attackCooldown) return;

        const player = this.entityCollision(EntityTypes.Player);
        if (!player) return;

        player.hit(8, this.position.x, 7, `Killed by ${this.name}`);
        this.attackCooldown = this.attackCooldownMax;
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb * 0.35);
        playRandomSoundFromArray({
            array: Sounds.Zombie_Hurt,
            positional: true,
            origin: this.position,
        });
    }

    dieEvent() {
        this.dropLoot();
        playPositionalSound(this.position, "mobs/zombie/death.ogg");
        this.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    interact() {}
}
