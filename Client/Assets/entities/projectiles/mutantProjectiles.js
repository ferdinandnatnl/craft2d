import { Projectile } from "../projectile.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { runtime } from "../../utils/runtime.js";

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
    }

    update() {
        const previous = { x: this.position.x, y: this.position.y };
        super.update();
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
    constructor(world, { position = new Vector2(), velocity = new Vector2() } = {}) {
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
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        this.world.removeEntity(this);
    }
}
