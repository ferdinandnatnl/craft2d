import { Entity, EntityTypes } from "../game/entity.js";
import { runtime } from "../utils/runtime.js";
import { Vector2, randomRange } from "../utils/classes.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { Sounds, playRandomSoundFromArray } from "../game/sounds.js";
import { camera } from "../utils/renderer.js";

export class FishingBobber extends Entity {
    constructor(world, { position = new Vector2(), owner } = {}) {
        super(world, {
            name: "Fishing Bobber",
            position,
            hitbox: new Vector2(BLOCK_SIZE * 0.14, BLOCK_SIZE * 0.14),
            type: EntityTypes.Projectile,
            noGravity: true,
            canSwim: false,
            canDrown: false,
            despawn: false,
            color: "#d94a39",
        });

        this.owner = owner;
        this.dimension = owner?.dimension ?? this.dimension;
        this.anchorY = position.y;
        this.biteTimer = randomRange(4, 11);
        this.lifeTimer = 0;
        this.biting = false;
        this.active = true;
    }

    update() {
        if (!this.active) return;
        if (!this.owner || this.owner.isDead || this.owner.dimension !== this.dimension) {
            this.remove();
            return;
        }

        const deltaTime = Math.min(runtime.deltaTime || 0.05, 0.1);
        this.lifeTimer += deltaTime;
        if (this.lifeTimer >= 45) {
            this.remove();
            return;
        }

        if (!this.biting) {
            this.biteTimer -= deltaTime;
            if (this.biteTimer <= 0) this.startBite();
        }

        const bob = Math.sin(this.lifeTimer * 4) * BLOCK_SIZE * 0.025;
        this.position.y = this.anchorY + bob + (this.biting ? BLOCK_SIZE * 0.12 : 0);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    startBite() {
        this.biting = true;
        playRandomSoundFromArray({
            array: Sounds.Water_Enter,
            positional: true,
            origin: this.position,
            volume: 0.35,
        });
    }

    getCatch() {
        if (!this.biting) return null;

        const nearbyAquatic = this.world.entities
            .filter((entity) =>
                entity.isAquatic &&
                entity.dimension === this.dimension &&
                entity.health > 0,
            )
            .map((entity) => ({
                entity,
                distance: Vector2.Distance(
                    new Vector2(
                        entity.position.x + entity.hitbox.x / 2,
                        entity.position.y + entity.hitbox.y / 2,
                    ),
                    this.position,
                ),
            }))
            .filter(({ distance }) => distance <= BLOCK_SIZE * 2.5)
            .sort((a, b) => a.distance - b.distance);

        const nearby = nearbyAquatic[0]?.entity;
        if (nearby) {
            const loot = nearby.getFishingLoot?.();
            this.world.removeEntity(nearby);
            if (loot) return { itemId: loot.itemId, count: loot.count };
        }

        const roll = randomRange(0, 100);
        if (roll < 45) return { itemId: Items.RawCod, count: 1 };
        if (roll < 70) return { itemId: Items.RawSalmon, count: 1 };
        if (roll < 82) return { itemId: Items.TropicalFish, count: 1 };
        if (roll < 88) return { itemId: Items.Pufferfish, count: 1 };
        if (roll < 95) return { itemId: Items.String, count: 1 };
        return { itemId: Items.InkSack, count: randomRange(1, 3) };
    }

    remove() {
        if (!this.active) return;
        this.active = false;
        if (this.owner?.fishingBobber === this) this.owner.fishingBobber = null;
        this.world.removeEntity(this);
    }

    draw(ctx) {
        if (!this.active || !this.owner) return;

        const startX = this.owner.position.x + this.owner.hitbox.x / 2 - camera.x;
        const startY = this.owner.position.y + this.owner.hitbox.y * 0.35 - camera.y;
        const endX = this.position.x - camera.x;
        const endY = this.position.y - camera.y;

        ctx.save();
        ctx.strokeStyle = "rgba(52, 43, 35, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(
            (startX + endX) / 2,
            (startY + endY) / 2 + BLOCK_SIZE * 0.12,
            endX,
            endY,
        );
        ctx.stroke();

        ctx.fillStyle = this.biting ? "#f4e7c5" : "#df4938";
        ctx.beginPath();
        ctx.arc(endX, endY, BLOCK_SIZE * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f4e7c5";
        ctx.fillRect(endX - BLOCK_SIZE * 0.065, endY, BLOCK_SIZE * 0.13, BLOCK_SIZE * 0.035);
        ctx.restore();
    }
}
