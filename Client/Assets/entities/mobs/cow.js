import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Sounds, playRandomSoundFromArray } from "../../game/sounds.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import {
    initializeBreedableAnimal,
    interactWithBreedableAnimal,
    tickBreedableAnimal,
} from "./animalBehavior.js";

const BREEDING_FOOD = new Set([Items.Wheat]);

export class Cow extends Mob {
    static spawnSize = Object.freeze({ width: 0.9, height: 1 });

    constructor(
        world,
        {
            health = 10,
            noAi = false,
            position = new Vector2(),
            invulnerable = false,
            myChunkX = 0,
            babyAgeTicks = 0,
            loveTicks = 0,
            breedingCooldown = 0,
            body = createCowBody(),
        } = {},
    ) {
        super(world, {
            name: "Cow",
            health: health,
            position: position,
            hitbox: new Vector2(0.9 * BLOCK_SIZE, 1 * BLOCK_SIZE),
            invulnerable: invulnerable,
            footstepSounds: Sounds.Cow_Step,
            body: body,
            noAi: noAi,
            myChunkX: myChunkX,
            ai: AI.PassiveSimple,
            speed: 1.2,
            stepSize: 0.4,
            ambientSounds: Sounds.Cow_Say,
            lootTable: new LootTable([
                new LootItem({
                    itemId: Items.RawBeef,
                    maxCount: 2,
                    subtract: 1,
                }),
                new LootItem({
                    itemId: Items.Leather,
                    maxCount: 3,
                    subtract: 6,
                }),
            ]),
        });

        initializeBreedableAnimal(this, {
            babyAgeTicks,
            loveTicks,
            breedingCooldown,
            adultWidth: Cow.spawnSize.width * BLOCK_SIZE,
            adultHeight: Cow.spawnSize.height * BLOCK_SIZE,
            foodItems: BREEDING_FOOD,
        });
    }

    update() {
        this.updateEntity();
        this.aiUpdate();
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health) return;
        if (!this.damage(damage)) return;

        this.knockBack(hitfromX, kb);
        playRandomSoundFromArray({
            array: Sounds.Cow_Hurt,
            positional: true,
            origin: this.position,
        });
    }

    dieEvent() {
        if (!this.isBaby) this.dropLoot();
        playRandomSoundFromArray({
            array: Sounds.Cow_Say,
            positional: true,
            origin: this.position,
        });
        this.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
        tickBreedableAnimal(this, Cow);
    }

    interact(player, item) {
        return interactWithBreedableAnimal(this, player, item, BREEDING_FOOD);
    }
}

export function createCowBody() {
    return new Body({
        sprite: "cow/cow",
        parts: {
            head: new BodyPart({
                spriteCrop: { x: 0, y: 6, width: 6, height: 8 },
                offset: { x: 52, y: -18 },
                flipOrigin: { x: -76, y: 0 },
                zIndex: 0,
                flip: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 40, y: 14, width: 9, height: 18 },
                spriteRotation: -90,
                offset: { x: -13, y: 18 },
                flipOrigin: { x: 55, y: 0 },
                zIndex: 2,
                flip: true,
            }),
            back_back_leg: new BodyPart({
                spriteCrop: { x: 4, y: 20, width: 4, height: 12 },
                offset: { x: -18, y: 22 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 3,
                zIndex: -1,
            }),
            back_leg: new BodyPart({
                spriteCrop: { x: 0, y: 20, width: 4, height: 12 },
                offset: { x: -18, y: 22 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 3,
                zIndex: 1,
            }),
            front_back_leg: new BodyPart({
                spriteCrop: { x: 8, y: 20, width: 4, height: 12 },
                offset: { x: 35, y: 22 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 3,
                zIndex: -1,
            }),
            front_leg: new BodyPart({
                spriteCrop: { x: 4, y: 20, width: 4, height: 12 },
                offset: { x: 35, y: 22 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 3,
                zIndex: 1,
            }),
        },
    });
}
