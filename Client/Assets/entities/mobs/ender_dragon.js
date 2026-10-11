import { Entity, EntityTypes } from "../../game/entity.js";
import { Body, BodyPart } from "../../game/body.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { camera, ctx } from "../../utils/renderer.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { runtime } from "../../utils/runtime.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import { endExitPortalWorldY } from "@2dcraft.com/shared/endProgression.js";

export class EnderDragon extends Entity {
    constructor(world, { position = new Vector2(12 * BLOCK_SIZE, 39 * BLOCK_SIZE),
        UUID, health = 100 } = {}) {
        super(world, {
            UUID,
            name: "Ender Dragon",
            position,
            hitbox: new Vector2(4 * BLOCK_SIZE, 2 * BLOCK_SIZE),
            type: EntityTypes.Mob,
            noGravity: true,
            noCollision: true,
            canBurn: false,
            canDrown: false,
            despawn: false,
            dimension: Dimensions.End,
            body: new Body({
                sprite: "dragon/ender_dragon",
                parts: { body: new BodyPart({ spriteCrop: { x: 0, y: 0, width: 64, height: 32 } }) },
            }),
        });
        this.health = health;
        this.maxHealth = 100;
        this.flightTime = 0;
        this.attackCooldown = 0;
        this.img.src = getSpriteUrl("entity/dragon/ender_dragon");
    }

    update() {
        const exitY = endExitPortalWorldY();
        if (this.world.getBlockAtWorldPosition(0, exitY, false, Dimensions.End)
            ?.blockType === Blocks.EndPortal) {
            this.world.removeEntity(this);
            return;
        }
        this.hurtCooldownLogic();
        if (this.world.difficulty === "peaceful") return;
        const dt = Math.min(runtime.deltaTime || 0, 0.1);
        this.flightTime += dt;
        const player = this.world.player;
        if (!player || player.dimension !== Dimensions.End || player.isDead) return;

        // Circle the island, then dive close enough for the player to strike.
        const diving = this.flightTime % 8 > 5;
        const targetX = diving ? player.position.x - 1.5 * BLOCK_SIZE :
            Math.sin(this.flightTime * 0.65) * 19 * BLOCK_SIZE;
        const targetY = diving ? player.position.y - BLOCK_SIZE :
            (39 + Math.sin(this.flightTime * 1.2) * 4) * BLOCK_SIZE;
        this.position.x += Math.max(-1, Math.min(1, (targetX - this.position.x) / BLOCK_SIZE)) * 6 * BLOCK_SIZE * dt;
        this.position.y += Math.max(-1, Math.min(1, (targetY - this.position.y) / BLOCK_SIZE)) * 5 * BLOCK_SIZE * dt;
        this.direction = targetX < this.position.x ? -1 : 1;
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        if (diving && !this.attackCooldown) {
            const touching = this.entityCollision(EntityTypes.Player);
            if (touching) {
                touching.hit(8, this.position.x, 5, "Killed by Ender Dragon");
                this.attackCooldown = 1.5;
            }
        }
    }

    drawEntity(ctx) {
        if (!this.img.complete || !this.img.naturalWidth) return;
        const x = this.position.x - camera.x;
        const y = this.position.y - camera.y;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (this.direction < 0) {
            ctx.translate(x + this.hitbox.x, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this.img, 0, y, this.hitbox.x, this.hitbox.y);
        } else {
            ctx.drawImage(this.img, x, y, this.hitbox.x, this.hitbox.y);
        }
        ctx.restore();

        ctx.fillStyle = "#1a1026";
        ctx.fillRect(x, y - 14, this.hitbox.x, 7);
        ctx.fillStyle = "#bc5ad3";
        ctx.fillRect(x + 1, y - 13,
            (this.hitbox.x - 2) * Math.max(0, this.health / this.maxHealth), 5);
    }

    drawOverride() {
        const width = Math.min(360, ctx.canvas.width * 0.52);
        const x = (ctx.canvas.width - width) / 2;
        ctx.save();
        ctx.fillStyle = "#171020";
        ctx.fillRect(x, 18, width, 12);
        ctx.fillStyle = "#ad53c2";
        ctx.fillRect(x + 2, 20,
            (width - 4) * Math.max(0, this.health / this.maxHealth), 8);
        ctx.fillStyle = "#f2eaf7";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Ender Dragon", ctx.canvas.width / 2, 47);
        ctx.restore();
    }

    hit(damage) {
        if (!this.health) return;
        this.damage(damage);
    }

    dieEvent() {
        const y = endExitPortalWorldY();
        this.world.setBlockTypeAtPosition(0, y, Blocks.EndPortal,
            false, Dimensions.End, null, false);
        const portal = this.world.getBlockAtWorldPosition(0, y, false, Dimensions.End);
        if (portal) this.world.serverPlaceBlock(portal.chunkX, portal.x,
            portal.y, Blocks.EndPortal, false, Dimensions.End);
        runtime.game.chat.message("The Ender Dragon is defeated. The return portal has opened at the island center.");
        this.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }
}
