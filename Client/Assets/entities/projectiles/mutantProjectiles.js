import { Projectile } from "../projectile.js";
import { EntityTypes } from "../../game/entity.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { runtime } from "../../utils/runtime.js";

function overlaps(a, b) {
    return a.position.x < b.position.x + b.hitbox.x &&
        a.position.x + a.hitbox.x > b.position.x &&
        a.position.y < b.position.y + b.hitbox.y &&
        a.position.y + a.hitbox.y > b.position.y;
}

export class MutantBoneArrow extends Projectile {
    constructor(world, { position = new Vector2(), velocity = new Vector2() } = {}) {
        super(world, {
            name: "Mutant Arrow",
            position,
            sprite: getSpriteUrl("entity/mutantbeasts/mutant_arrow"),
            scale: 1.5,
            velocity,
            drag: 0,
            damage: 8,
            hitbox: new Vector2(BLOCK_SIZE / 5, BLOCK_SIZE / 5),
        });
        this.entityTypeName = "MutantBoneArrow";
        this.trail = [];
        this.expiresAt = runtime.passedTime + 4;
    }

    update() {
        const previous = { x: this.position.x, y: this.position.y };
        this.updateEntity();
        const player = !this.wasColliding && this.entityCollision(EntityTypes.Player);
        if (player?.abilities.hasHealth) {
            player.hit(this.damage, this.position.x, 2, "Shot by a Mutant Skeleton");
            this.dieEvent();
        } else if (this.wasColliding || runtime.passedTime >= this.expiresAt) {
            this.dieEvent();
        }
        this.trail.unshift(previous);
        if (this.trail.length > 8) this.trail.length = 8;
    }

    draw(ctx) {
        const camera = runtime.camera;
        if (camera && this.trail.length) {
            ctx.save();
            ctx.lineCap = "round";
            ctx.lineWidth = Math.max(2, BLOCK_SIZE / 20);
            let tip = { x: this.position.x, y: this.position.y };
            for (let i = 0; i < this.trail.length; i++) {
                const point = this.trail[i];
                ctx.strokeStyle = `rgba(198, 226, 245, ${0.45 * (1 - i / this.trail.length)})`;
                ctx.beginPath();
                ctx.moveTo(tip.x - camera.x, tip.y - camera.y);
                ctx.lineTo(point.x - camera.x, point.y - camera.y);
                ctx.stroke();
                tip = point;
            }
            ctx.restore();
        }
        super.draw(ctx);
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        this.world.removeEntity(this);
    }
}

export class MutantIceShard extends Projectile {
    constructor(world, { position = new Vector2(), velocity = new Vector2(), ownerUUID = null } = {}) {
        super(world, {
            name: "Mutant Ice Chunk",
            position,
            sprite: getSpriteUrl("blocks/ice"),
            scale: 2.5,
            velocity,
            drag: 0,
            damage: 6,
            hitbox: new Vector2(BLOCK_SIZE / 2, BLOCK_SIZE / 2),
        });
        this.entityTypeName = "MutantIceShard";
        this.ownerUUID = ownerUUID;
        this.expiresAt = runtime.passedTime + 4;
    }

    update() {
        this.updateEntity();
        const target = !this.wasColliding && this.world.entities.find(entity =>
            entity !== this && entity.UUID !== this.ownerUUID &&
            entity.dimension === this.dimension && entity.type === EntityTypes.Mob &&
            entity.isHostile && entity.health > 0 && overlaps(this, entity));
        if (target) {
            target.hit(this.damage, this.position.x, 3);
            this.dieEvent();
        } else if (this.wasColliding || runtime.passedTime >= this.expiresAt) {
            this.dieEvent();
        }
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        this.world.removeEntity(this);
    }
}
