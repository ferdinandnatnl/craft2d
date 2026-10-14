import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { playPositionalSound } from "../../game/sounds.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import {
    initializeBreedableAnimal,
    interactWithBreedableAnimal,
    tickBreedableAnimal,
} from "./animalBehavior.js";

const BREEDING_FOOD = new Set([Items.Seeds, Items.PumpkinSeeds]);

export class Chicken extends Mob {
    static spawnSize = Object.freeze({ width: 0.5, height: 0.7 });

    constructor(
        world,
        {
            health = 4,
            noAi = false,
            position = new Vector2(),
            invulnerable = false,
            myChunkX = 0,
            babyAgeTicks = 0,
            loveTicks = 0,
            breedingCooldown = 0,
            layEggTimer = randomRange(6_000, 12_000),
            body = createChickenBody(),
        } = {},
    ) {
        super(world, {
            name: "Chicken",
            health,
            position,
            hitbox: new Vector2(
                Chicken.spawnSize.width * BLOCK_SIZE,
                Chicken.spawnSize.height * BLOCK_SIZE,
            ),
            invulnerable,
            body,
            noAi,
            myChunkX,
            ai: AI.PassiveSimple,
            speed: 1.2,
            stepSize: 0.3,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.RawChicken, maxCount: 1 }),
                new LootItem({ itemId: Items.Feather, maxCount: 2, subtract: 1 }),
            ]),
        });

        initializeBreedableAnimal(this, {
            babyAgeTicks,
            loveTicks,
            breedingCooldown,
            adultWidth: Chicken.spawnSize.width * BLOCK_SIZE,
            adultHeight: Chicken.spawnSize.height * BLOCK_SIZE,
            foodItems: BREEDING_FOOD,
        });
        this.layEggTimer = Math.max(0, Math.min(12_000, Math.floor(layEggTimer)));
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
    }

    tickUpdate() {
        this.entityTickUpdate();
        tickBreedableAnimal(this, Chicken);
        if (this.isBaby) return;

        if (this.layEggTimer > 0) this.layEggTimer--;
        if (this.layEggTimer > 0) return;
        this.layEggTimer = randomRange(6_000, 12_000);
        this.world.spawnDrop(
            new Vector2(this.position.x + this.hitbox.x / 2, this.position.y + this.hitbox.y),
            { itemId: Items.Egg, count: 1 },
        );
        playPositionalSound(this.position, "misc/pop.ogg", 4, 0.25);
    }

    interact(player, item) {
        return interactWithBreedableAnimal(this, player, item, BREEDING_FOOD);
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
    }

    dieEvent() {
        if (!this.isBaby) this.dropLoot();
        this.world.removeEntity(this);
    }
}

export function createChickenBody() {
    return new Body({
        sprite: "chicken/chicken.png",
        renderScale: 0.5,
        parts: {
            body: new BodyPart({
                spriteCrop: { x: 0, y: 0, width: 8, height: 11 },
                ownSpriteMap: "chicken/chicken.svg",
                flip: true,
            }),
        },
    });
}
