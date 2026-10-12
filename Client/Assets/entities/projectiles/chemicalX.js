import { EntityTypes } from "../../game/entity.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { Projectile } from "../projectile.js";
import {
    MutantCreeper,
    MutantEnderman,
    MutantSkeleton,
    MutantSnowGolem,
    MutantZombie,
    SpiderPig,
} from "../mobs/mutants.js";

const MUTATIONS = Object.freeze({
    Zombie: MutantZombie,
    Creeper: MutantCreeper,
    Skeleton: MutantSkeleton,
    Enderman: MutantEnderman,
    SnowGolem: MutantSnowGolem,
    Pig: SpiderPig,
});

export class ChemicalX extends Projectile {
    constructor(world, { position = new Vector2(), velocity = new Vector2() } = {}) {
        super(world, {
            name: "Chemical X",
            position,
            sprite: getSpriteUrl("items/mutantbeasts/chemical_x"),
            scale: 2,
            velocity,
            drag: 0,
            damage: 0,
            hitbox: new Vector2(BLOCK_SIZE / 3, BLOCK_SIZE / 3),
        });
        this.entityTypeName = "ChemicalX";
    }

    update() {
        this.updateEntity();

        const directHit = this.entityCollision(EntityTypes.Mob);
        if (directHit) {
            this.transform(directHit);
            this.dieEvent();
            return;
        }

        if (this.wasColliding) {
            this.infectNearbyMob();
            this.dieEvent();
        }
    }

    infectNearbyMob() {
        const candidates = this.world.entities.filter((entity) =>
            entity !== this &&
            entity.type === EntityTypes.Mob &&
            entity.dimension === this.dimension &&
            this.getMutantType(entity) &&
            Vector2.Distance(this.position, entity.position) <= 4 * BLOCK_SIZE,
        );
        if (!candidates.length) return;

        const target = candidates[Math.floor(Math.random() * candidates.length)];
        if (Math.random() < 0.5) this.transform(target);
        else target.hit?.(1000, this.position.x, 0, "Killed by Chemical X");
    }

    getMutantType(entity) {
        return MUTATIONS[entity.entityTypeName ?? entity.constructor.name] ?? null;
    }

    transform(target) {
        const EntityType = this.getMutantType(target);
        if (!EntityType) return false;

        const position = new Vector2(target.position.x, target.position.y);
        const dimension = target.dimension;
        const myChunkX = target.myChunkX;
        this.world.removeEntity(target, multiplayer);
        const mutant = this.world.summonEntity(
            EntityType,
            position,
            { myChunkX, dimension },
            multiplayer,
        );

        if (myChunkX !== null) {
            const chunk = this.world.getDimensionChunks(dimension).get(myChunkX);
            if (chunk && !chunk.entities.includes(mutant)) chunk.entities.push(mutant);
        }
        return true;
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        this.world.removeEntity(this);
    }
}
