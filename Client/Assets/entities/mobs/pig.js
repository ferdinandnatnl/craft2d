import { runtime } from "../../utils/runtime.js";
import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Sounds, playPositionalSound, playRandomSoundFromArray } from "../../game/sounds.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import {
    initializeBreedableAnimal,
    interactWithBreedableAnimal,
    tickBreedableAnimal,
} from "./animalBehavior.js";

const BREEDING_FOOD = new Set([Items.Carrot, Items.Potato]);

export class Pig extends Mob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.8 });

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
            body = createPigBody(),
        } = {},
    ) {
        super(world, {
            name: "Pig",
            health: health,
            position: position,
            hitbox: new Vector2(0.9 * BLOCK_SIZE, 0.8 * BLOCK_SIZE),
            invulnerable: invulnerable,
            footstepSounds: Sounds.Pig_Step,
            body: body,
            noAi: noAi,
            ai: AI.PassiveSimple,
            myChunkX: myChunkX,
            speed: 1.4,
            stepSize: 0.4,
            ambientSounds: Sounds.Pig_Say,
            lootTable: new LootTable([
                new LootItem({
                    itemId: Items.RawPorkchop,
                    maxCount: 2,
                    subtract: 1,
                }),
            ]),
        });

        initializeBreedableAnimal(this, {
            babyAgeTicks,
            loveTicks,
            breedingCooldown,
            adultWidth: Pig.spawnSize.width * BLOCK_SIZE,
            adultHeight: Pig.spawnSize.height * BLOCK_SIZE,
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
            array: Sounds.Pig_Say,
            positional: true,
            origin: this.position,
        });
    }

    dieEvent() {
        if (!this.isBaby) this.dropLoot();
        playPositionalSound(this.position, "mobs/pig/death.ogg");
        runtime.world.removeEntity(this);
    }

    tickUpdate() {
        this.entityTickUpdate();
        tickBreedableAnimal(this, Pig);
    }

    interact(player, item) {
        return interactWithBreedableAnimal(this, player, item, BREEDING_FOOD);
    }
}

export function createPigBody() {
    return new Body({
        sprite: "pig/pig",
        flipCorrection: 3,
        parts: {
            head: new BodyPart({
                spriteCrop: { x: 0, y: 8, width: 8, height: 8 },
                offset: { x: 45, y: -8 },
                flipOrigin: { x: -65, y: 0 },
                zIndex: 0,
                flip: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 47, y: 16, width: 9, height: 16 },
                spriteRotation: -90,
                offset: { x: -9, y: 24 },
                flipOrigin: { x: 44, y: 0 },
                zIndex: 2,
                flip: true,
            }),
            back_back_leg: new BodyPart({
                spriteCrop: { x: 0, y: 20, width: 4, height: 6 },
                offset: { x: -15, y: 31 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 4,
                zIndex: -1,
            }),
            back_leg: new BodyPart({
                spriteCrop: { x: 8, y: 20, width: 4, height: 6 },
                offset: { x: -15, y: 31 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 4,
                zIndex: 1,
            }),
            front_back_leg: new BodyPart({
                spriteCrop: { x: 0, y: 20, width: 4, height: 6 },
                offset: { x: 30, y: 31 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 4,
                zIndex: -1,
            }),
            front_leg: new BodyPart({
                spriteCrop: { x: 8, y: 20, width: 4, height: 6 },
                offset: { x: 30, y: 31 },
                rotationOrigin: { x: 4, y: 0 },
                sways: true,
                swayIntensity: 4,
                zIndex: 1,
            }),
        },
    });
}
