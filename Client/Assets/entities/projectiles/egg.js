import { Projectile } from "../projectile.js";
import { Chicken } from "../mobs/chicken.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";

export class EggProjectile extends Projectile {
    constructor(
        world,
        {
            position = new Vector2(),
            velocity = new Vector2(15 * BLOCK_SIZE, -15 * BLOCK_SIZE),
        } = {},
    ) {
        super(world, {
            name: "EggProjectile",
            position,
            sprite: getSpriteUrl("items/egg"),
            damage: 0,
            velocity,
            hitbox: new Vector2(BLOCK_SIZE / 3, BLOCK_SIZE / 3),
            scale: 2,
            drag: 0,
        });
        this.voxelSprite = true;
        this.didBreak = false;
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        if (this.didBreak) return;
        this.didBreak = true;
        if (Math.random() < 1 / 8) {
            const count = Math.random() < 1 / 32 ? 4 : 1;
            const dimension = this.dimension;
            const chunk = this.world.getChunkForX(this.position.x, dimension);
            if (chunk) {
                for (let index = 0; index < count; index++) {
                    const chick = this.world.summonEntity(
                        Chicken,
                        new Vector2(
                            this.position.x + index * BLOCK_SIZE / 5,
                            this.position.y,
                        ),
                        {
                            myChunkX: chunk.x,
                            babyAgeTicks: 24_000,
                            dimension,
                        },
                        multiplayer,
                    );
                    chick.dimension = dimension;
                    if (!chunk.entities.includes(chick)) chunk.entities.push(chick);
                }
            }
        }
        this.world.removeEntity(this);
    }
}
