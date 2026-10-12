import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { runtime } from "../../utils/runtime.js";

const AQUATIC_SPECIES = Object.freeze({
    Cod: {
        sprite: "aquatic/cod_live.png",
        tailSprite: "aquatic/cod_live_tail.png",
        spriteCrop: { x: 0, y: 0, width: 17, height: 6 },
        tailRotationOriginX: -17,
        health: 3,
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.5),
        itemId: Items.RawCod,
    },
    Salmon: {
        sprite: "aquatic/salmon_live.png",
        tailSprite: "aquatic/salmon_live_tail.png",
        spriteCrop: { x: 0, y: 0, width: 25, height: 7 },
        tailRotationOriginX: -17,
        health: 3,
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.5),
        itemId: Items.RawSalmon,
    },
    Pufferfish: {
        sprite: "aquatic/pufferfish_live.png",
        spriteCrop: { x: 0, y: 0, width: 9, height: 10 },
        health: 3,
        hitbox: new Vector2(BLOCK_SIZE * 0.7, BLOCK_SIZE * 0.7),
        itemId: Items.Pufferfish,
    },
    TropicalFish: {
        sprite: "aquatic/tropical_fish_live.png",
        tailSprite: "aquatic/tropical_fish_live_tail.png",
        spriteCrop: { x: 0, y: 0, width: 10, height: 7 },
        tailRotationOriginX: -13,
        health: 3,
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.5),
        itemId: Items.TropicalFish,
    },
    Squid: {
        sprite: "aquatic/squid_live.png",
        spriteCrop: { x: 0, y: 0, width: 20, height: 33 },
        health: 10,
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.9),
        itemId: Items.InkSack,
        maxDrop: 3,
    },
    Catfish: {
        sprite: "alexsmobs/catfish_small.png",
        spriteCrop: { x: 22, y: 14, width: 14, height: 6 },
        health: 10,
        hitbox: new Vector2(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.6),
        itemId: Items.RawCatfish,
    },
});

export class AquaticMob extends Mob {
    static spawnInWater = true;

    constructor(
        world,
        {
            species = "Cod",
            health,
            noAi = false,
            position = new Vector2(),
            invulnerable = false,
            myChunkX = 0,
            UUID,
            despawn = true,
        } = {},
    ) {
        const definition = AQUATIC_SPECIES[species] || AQUATIC_SPECIES.Cod;
        super(world, {
            name: species === "TropicalFish" ? "Tropical Fish" : species,
            health: health ?? definition.health,
            noAi,
            position,
            invulnerable,
            UUID,
            hitbox: definition.hitbox,
            body: createAquaticBody(definition),
            myChunkX,
            ai: AI.PassiveSimple,
            speed: species === "Squid" ? 0.7 : 1,
            noGravity: true,
            float: false,
            canDrown: false,
            despawn,
            lootTable: new LootTable([
                new LootItem({
                    itemId: definition.itemId,
                    maxCount: definition.maxDrop || 1,
                    subtract: definition.maxDrop ? definition.maxDrop - 1 : 0,
                }),
            ]),
        });

        this.isAquatic = true;
        this.fishingLootItemId = definition.itemId;
        this.targetPosition = null;
        this.targetTimer = 0;
        this.swimSpeed = this.speed * BLOCK_SIZE;
        this.swimPhase = randomRange(0, Math.PI * 2);
        // Aquatic mobs steer their own velocity. Generic entity drag cancels
        // these small swim impulses before physics can move them.
        this.drag = 0;
    }

    update() {
        this.swimLogic();
        this.updateEntity();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    swimLogic() {
        const deltaTime = Math.min(runtimeDeltaTime(), 0.1);
        this.swimPhase = (this.swimPhase + deltaTime * 10) % (Math.PI * 2);
        if (this.body?.parts.body) {
            this.body.parts.body.rotation = Math.sin(this.swimPhase) *
                (this.name === "Pufferfish" ? 4 : 2.5);
        }
        if (this.body?.parts.tail) {
            this.body.parts.tail.rotation = Math.sin(this.swimPhase * 1.8) *
                (this.name === "Squid" ? 10 : this.name === "Pufferfish" ? 22 : 28);
        }

        if (this.noAi) {
            this.velocity.x *= 0.9;
            this.velocity.y *= 0.9;
            return;
        }

        this.targetTimer -= runtimeDeltaTime();
        if (
            this.targetTimer <= 0 ||
            !this.targetPosition ||
            !this.isWaterPosition(this.targetPosition)
        ) {
            this.targetPosition = this.findSwimTarget();
            this.targetTimer = randomRange(2, 6);
        }

        if (!this.targetPosition) {
            this.velocity.x *= 0.92;
            this.velocity.y *= 0.92;
            return;
        }

        const center = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        );
        const deltaX = this.targetPosition.x - center.x;
        const deltaY = this.targetPosition.y - center.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < BLOCK_SIZE * 0.12) {
            this.targetPosition = null;
            this.velocity.x *= 0.8;
            this.velocity.y *= 0.8;
            return;
        }

        const targetX = (deltaX / distance) * this.swimSpeed;
        const targetY = (deltaY / distance) * this.swimSpeed * 0.7;
        const acceleration = BLOCK_SIZE * 3 * deltaTime;
        this.velocity.x = approach(this.velocity.x, targetX, acceleration);
        this.velocity.y = approach(this.velocity.y, targetY, acceleration);
        if (Math.abs(this.velocity.x) > 1) this.direction = Math.sign(this.velocity.x);
    }

    findSwimTarget() {
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        for (let attempt = 0; attempt < 12; attempt++) {
            const candidate = new Vector2(
                centerX + randomRange(-4, 5) * BLOCK_SIZE,
                centerY + randomRange(-2, 3) * BLOCK_SIZE,
            );
            if (this.isWaterPosition(candidate)) return candidate;
        }
        return null;
    }

    isWaterPosition(position) {
        const inset = Math.min(BLOCK_SIZE * 0.15, this.hitbox.x / 4);
        const points = [
            [position.x - this.hitbox.x / 2 + inset, position.y - this.hitbox.y / 2 + inset],
            [position.x + this.hitbox.x / 2 - inset, position.y - this.hitbox.y / 2 + inset],
            [position.x - this.hitbox.x / 2 + inset, position.y + this.hitbox.y / 2 - inset],
            [position.x + this.hitbox.x / 2 - inset, position.y + this.hitbox.y / 2 - inset],
        ];
        return points.every(([x, y]) =>
            this.world.getBlockAtWorldPosition(x, y, false, this.dimension)
                ?.blockType === Blocks.Water,
        );
    }

    getFishingLoot() {
        return this.lootTable.getRandomLoot()[0] || null;
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
    }

    dieEvent() {
        this.dropLoot();
        this.world.removeEntity(this);
    }

    interact() {}
}

export class Cod extends AquaticMob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.5 });

    constructor(world, props = {}) { super(world, { ...props, species: "Cod" }); }
}

export class Salmon extends AquaticMob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.5 });

    constructor(world, props = {}) { super(world, { ...props, species: "Salmon" }); }
}

export class Pufferfish extends AquaticMob {
    static spawnSize = Object.freeze({ width: 0.7, height: 0.7 });

    constructor(world, props = {}) { super(world, { ...props, species: "Pufferfish" }); }
}

export class TropicalFish extends AquaticMob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.5 });

    constructor(world, props = {}) { super(world, { ...props, species: "TropicalFish" }); }
}

export class Squid extends AquaticMob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.9 });

    constructor(world, props = {}) { super(world, { ...props, species: "Squid" }); }
}

function createAquaticBody({
    sprite,
    tailSprite,
    spriteCrop,
    hitbox,
    tailRotationOriginX = -12,
}) {
    const centerOffset = {
        x: (hitbox.x / 4 / BLOCK_SIZE) * 64,
        y: (hitbox.y / 2 / BLOCK_SIZE) * 64,
    };

    return new Body({
        sprite,
        parts: {
            ...(tailSprite ? {
                tail: new BodyPart({
                    spriteCrop,
                    ownSpriteMap: tailSprite,
                    offset: centerOffset,
                    rotationOrigin: { x: tailRotationOriginX, y: 0 },
                    flip: true,
                    zIndex: -1,
                }),
            } : {}),
            body: new BodyPart({
                spriteCrop,
                ownSpriteMap: sprite,
                offset: centerOffset,
                flip: true,
                zIndex: 1,
            }),
        },
    });
}

function approach(value, target, amount) {
    if (value < target) return Math.min(target, value + amount);
    return Math.max(target, value - amount);
}

function runtimeDeltaTime() {
    return runtime.deltaTime || 0.05;
}
