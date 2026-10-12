import { Entity, EntityTypes } from "../game/entity.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import { getSpriteUrl } from "../utils/texturePackLoader.js";

export class Minecart extends Entity {
    constructor(world, {
        position = new Vector2(),
        myChunkX = null,
        variant = "normal",
    } = {}) {
        const sprite = variant === "chest" ? "minecart_chest" : "minecart_normal";
        super(world, {
            name: "Minecart",
            position,
            hitbox: new Vector2(0.9 * BLOCK_SIZE, 0.8 * BLOCK_SIZE),
            noGravity: true,
            noCollision: true,
            canDrown: false,
            despawn: false,
            type: EntityTypes.Entity,
            sprite: getSpriteUrl(`items/${sprite}`),
            spriteScale: 3.2,
            myChunkX,
        });

        this.variant = variant;
        this.voxelSprite = true;
    }

    update() {
        this.updateEntity();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    hit() {}
}
