import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { runtime } from "../../utils/runtime.js";
import { BLOCK_SIZE, GRAVITY, multiplayer } from "../../utils/globals.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { Drop } from "../drop.js";
import { InventoryItem } from "../../game/inventoryItem.js";
import { AI, Mob } from "../mob.js";
import {
    ANIMAL_BABY_AGE_TICKS,
    applyAnimalAgeScale,
    initializeBreedableAnimal,
    interactWithBreedableAnimal,
    showLoveParticles,
    tickBreedableAnimal,
} from "./animalBehavior.js";

const HORSE_COATS = [
    "white", "creamy", "chestnut", "brown", "black", "gray", "darkbrown",
];
const HORSE_MARKINGS = ["none", "white", "whitefield", "whitedots", "blackdots"];
const HORSE_ARMOR_ITEMS = new Map([
    [Items.LeatherHorseArmor, "leather"],
    [Items.CopperHorseArmor, "copper"],
    [Items.IronHorseArmor, "iron"],
    [Items.GoldHorseArmor, "gold"],
    [Items.DiamondHorseArmor, "diamond"],
    [Items.NetheriteHorseArmor, "netherite"],
]);
const HORSE_ARMOR_IDS = new Map(
    [...HORSE_ARMOR_ITEMS].map(([itemId, armor]) => [armor, itemId]),
);
const HORSE_ARMOR_POINTS = {
    leather: 3,
    copper: 4,
    iron: 5,
    gold: 7,
    diamond: 11,
    netherite: 13,
};
const BREEDING_FOOD = new Set([Items.GoldenApple, Items.GoldenCarrot]);
const HORSE_FOOD = new Map([
    [Items.Sugar, { heal: 1, temper: 3, growth: 30 }],
    [Items.Wheat, { heal: 2, temper: 3, growth: 60 }],
    [Items.Apple, { heal: 3, temper: 3, growth: 120 }],
    [Items.GoldenCarrot, { heal: 4, temper: 5, growth: 240 }],
    [Items.GoldenApple, { heal: 10, temper: 10, growth: 240 }],
]);
const HAY_BALE_FOOD = { heal: 20, temper: 0, growth: 600 };
const RIDE_HEIGHT = 1.35;
const RIDER_BACK_OFFSET = 0.4;
const JUMP_CHARGE_SECONDS = 0.9;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomChoice = (values) => values[Math.floor(Math.random() * values.length)];
const boundedStat = (value, min, max) => Number.isFinite(value)
    ? clamp(value, min, max)
    : randomRange(min, max);

function horseGenetics(first, second) {
    const averageWithWild = (key, min, max) => clamp(
        (first[key] + second[key] + randomRange(min, max)) / 3,
        min,
        max,
    );
    const inheritedCoat = Math.random() < 0.5 ? first.coat : second.coat;
    const inheritedMarkings = Math.random() < 0.5
        ? first.markings : second.markings;
    return {
        maxHealth: averageWithWild("maxHealth", 15, 30),
        movementSpeed: averageWithWild("movementSpeed", 0.1125, 0.3375),
        jumpStrength: averageWithWild("jumpStrength", 0.4, 1),
        coat: Math.random() < 0.5 ? inheritedCoat : randomChoice(HORSE_COATS),
        markings: Math.random() < 0.5
            ? inheritedMarkings : randomChoice(HORSE_MARKINGS),
    };
}

export class Horse extends Mob {
    static spawnSize = Object.freeze({ width: 1.4, height: 1.6 });

    constructor(world, {
        health = null,
        maxHealth = null,
        movementSpeed = null,
        jumpStrength = null,
        tamed = false,
        temper = 0,
        coat = null,
        markings = null,
        saddled = false,
        armorType = null,
        riderUUID = null,
        tamingTicks = 0,
        jumpCharge = 0,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        babyAgeTicks = 0,
        loveTicks = 0,
        breedingCooldown = 0,
    } = {}) {
        const horseMaxHealth = boundedStat(maxHealth, 15, 30);
        const horseHealth = Number.isFinite(health)
            ? clamp(health, 0, horseMaxHealth)
            : horseMaxHealth;

        super(world, {
            name: "Horse",
            health: horseHealth,
            noAi,
            position,
            hitbox: new Vector2(
                Horse.spawnSize.width * BLOCK_SIZE,
                Horse.spawnSize.height * BLOCK_SIZE,
            ),
            invulnerable,
            myChunkX,
            ai: AI.PassiveSimple,
            speed: 1.2,
            stepSize: 0.6,
            despawn: false,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.Leather, maxCount: 2, subtract: 2 }),
            ]),
        });

        this.isHorse = true;
        this.sprite = "entity/horse/horse.svg";
        this.img.src = getSpriteUrl(this.sprite);
        this.spriteScale = Horse.spawnSize.width * BLOCK_SIZE / 32;
        this.voxelSprite = true;
        this.maxHealth = horseMaxHealth;
        this.movementSpeed = boundedStat(movementSpeed, 0.1125, 0.3375);
        this.jumpStrength = boundedStat(jumpStrength, 0.4, 1);
        this.rideSpeed = this.movementSpeed * 43.2;
        this.maxVelocity.x = this.rideSpeed * BLOCK_SIZE;
        this.maxVelocity.y = Math.max(this.maxVelocity.y, 1400);
        this.tamed = tamed === true;
        this.temper = Number.isFinite(temper) ? clamp(temper, 0, 100) : 0;
        this.coat = HORSE_COATS.includes(coat) ? coat : randomChoice(HORSE_COATS);
        this.markings = HORSE_MARKINGS.includes(markings)
            ? markings : randomChoice(HORSE_MARKINGS);
        this.saddled = saddled === true;
        this.armorType = Object.hasOwn(HORSE_ARMOR_POINTS, armorType)
            ? armorType : null;

        this.passenger = null;
        this.riderUUID = typeof riderUUID === "string" && riderUUID.length <= 64
            ? riderUUID : null;
        this.tamingTicks = Number.isFinite(tamingTicks)
            ? clamp(Math.floor(tamingTicks), 0, 40) : 0;
        this.jumpCharge = Number.isFinite(jumpCharge) ? clamp(jumpCharge, 0, 1) : 0;
        this.jumpButtonWasDown = false;

        initializeBreedableAnimal(this, {
            babyAgeTicks,
            loveTicks,
            breedingCooldown,
            adultWidth: Horse.spawnSize.width * BLOCK_SIZE,
            adultHeight: Horse.spawnSize.height * BLOCK_SIZE,
            foodItems: BREEDING_FOOD,
        });
        this.breedingFoods = new Set([
            ...BREEDING_FOOD,
            ...HORSE_FOOD.keys(),
        ]);
    }

    update() {
        this.updateEntity();

        if (this.passenger && !this.world?.entities?.includes(this.passenger)) {
            this.passenger = null;
            this.riderUUID = null;
        }
        if (!this.passenger && this.riderUUID) {
            this.passenger = this.world?.getEntityByUUID?.(this.riderUUID) ?? null;
            if (this.passenger) this.passenger.horse = this;
            else if (this.world?.isWorldAuthority) this.riderUUID = null;
        }
        if (this.passenger) {
            if (!this.passenger.isLocal?.()) this.followRemoteRider();
            return;
        }

        this.aiUpdate();
    }

    tickUpdate() {
        this.entityTickUpdate();
        tickBreedableAnimal(this, Horse, horseGenetics);

        if (this.tamingTicks <= 0 || !this.passenger?.isLocal?.()) return;
        this.tamingTicks--;
        if (this.tamingTicks > 0) return;

        const rider = this.passenger;
        if (Math.random() * 100 < this.temper) {
            this.tamed = true;
            this.temper = 0;
            showLoveParticles(this);
            runtime.game?.chat?.message("The horse is tamed.");
        } else {
            this.temper = Math.min(100, this.temper + 5);
            rider.dismountHorse(this, true);
            runtime.game?.chat?.message("The horse bucked you off. Try again or feed it.");
        }
        this.syncHorseState();
    }

    mount(player) {
        if (!player?.isLocal?.() || player.horse || player.boat) return false;
        if (this.passenger && this.passenger !== player) return false;
        if (!player.mountHorse(this)) return false;

        this.passenger = player;
        this.riderUUID = player.UUID;
        this.tamingTicks = this.tamed ? 0 : 40;
        this.attachRider(player);
        this.syncHorseState();
        if (this.tamed && !this.saddled) {
            runtime.game?.chat?.message("Equip a saddle to control this horse.");
        }
        return true;
    }

    dismount(player, jump = false) {
        if (this.passenger !== player) return false;
        this.passenger = null;
        this.riderUUID = null;
        this.tamingTicks = 0;
        this.jumpCharge = 0;
        this.jumpButtonWasDown = false;
        player.dismountHorse(this, jump);
        this.syncHorseState();
        return true;
    }

    ride(player, direction, jumpDown, deltaTime) {
        if (player !== this.passenger || !player?.isLocal?.()) return;
        const dt = clamp(Number.isFinite(deltaTime) ? deltaTime : 0, 0, 0.1);

        if (!this.tamed || !this.saddled) {
            this.targetVelocity.x = 0;
            this.jumpCharge = 0;
            this.jumpButtonWasDown = false;
            this.attachRider(player);
            return;
        }

        this.targetVelocity.x = direction * this.rideSpeed * BLOCK_SIZE;
        if (direction) this.direction = direction;

        if (jumpDown && this.grounded) {
            this.jumpButtonWasDown = true;
            this.jumpCharge = Math.min(1, this.jumpCharge + dt / JUMP_CHARGE_SECONDS);
        } else if (this.jumpButtonWasDown) {
            if (this.grounded) {
                const height = 1.1 + ((this.jumpStrength - 0.4) / 0.6) * 4.2;
                const power = 0.4 + this.jumpCharge * 0.6;
                this.velocity.y = -Math.sqrt(2 * GRAVITY * BLOCK_SIZE * height * power);
                this.grounded = false;
            }
            this.jumpCharge = 0;
            this.jumpButtonWasDown = false;
        }

        player.direction = this.direction;
        this.attachRider(player);
    }

    attachRider(player) {
        if (!player) return;
        const direction = this.direction < 0 ? -1 : 1;
        player.position.x = this.position.x +
            (this.hitbox.x - player.hitbox.x) / 2 -
            direction * RIDER_BACK_OFFSET * BLOCK_SIZE;
        player.position.y = this.position.y + this.hitbox.y -
            RIDE_HEIGHT * BLOCK_SIZE - player.hitbox.y;
        player.direction = this.direction;
        player.velocity = new Vector2();
        player.targetVelocity = new Vector2();
    }

    followRemoteRider() {
        const rider = this.passenger;
        if (!rider || rider.dimension !== this.dimension) return;
        const direction = rider.direction < 0 ? -1 : 1;
        this.position.x = rider.position.x + rider.hitbox.x / 2 +
            direction * RIDER_BACK_OFFSET * BLOCK_SIZE - this.hitbox.x / 2;
        this.position.y = rider.position.y + rider.hitbox.y +
            RIDE_HEIGHT * BLOCK_SIZE - this.hitbox.y;
        this.direction = rider.direction < 0 ? -1 : 1;
    }

    interact(player, item) {
        if (!player?.isLocal?.()) return false;
        const itemId = item?.itemId;

        if (this.passenger === player && itemId == null && item?.blockId == null) {
            this.dismount(player);
            return true;
        }

        if (itemId === Items.Saddle) {
            if (!this.tamed) {
                runtime.game?.chat?.message("Tame the horse before saddling it.");
                return true;
            }
            if (this.saddled) return true;
            this.saddled = true;
            consumeHeldItem(player);
            this.syncHorseState();
            return true;
        }

        const armorType = HORSE_ARMOR_ITEMS.get(itemId);
        if (armorType) {
            if (!this.tamed) {
                runtime.game?.chat?.message("Tame the horse before equipping armor.");
                return true;
            }
            if (this.armorType) {
                runtime.game?.chat?.message("Remove the horse's armor first.");
                return true;
            }
            this.armorType = armorType;
            consumeHeldItem(player);
            this.syncHorseState();
            return true;
        }

        if (itemId === Items.Shears && !this.passenger &&
            (this.saddled || this.armorType)) {
            const removeArmor = Boolean(this.armorType);
            const removedItem = this.armorType
                ? HORSE_ARMOR_IDS.get(this.armorType)
                : Items.Saddle;
            if (removeArmor) this.armorType = null;
            else this.saddled = false;
            const count = player.inventory.addItem(new InventoryItem({
                itemId: removedItem,
                count: 1,
            }));
            if (count > 0) {
                this.world.summonEntity(
                    Drop,
                    new Vector2(this.position.x + this.hitbox.x / 2, this.position.y),
                    { itemId: removedItem, count },
                    multiplayer,
                );
            }
            player.reduceDurability();
            this.syncHorseState();
            return true;
        }

        const food = item?.blockId === Blocks.HayBale
            ? HAY_BALE_FOOD
            : HORSE_FOOD.get(itemId);
        if (food) return this.feed(player, itemId, food);

        if (itemId != null || item?.blockId != null) return false;
        return this.mount(player);
    }

    feed(player, itemId, food) {
        if (this.isBaby) {
            consumeHeldItem(player);
            this.babyAgeTicks = Math.max(
                0,
                this.babyAgeTicks - Math.max(1, Math.min(food.growth, Math.ceil(this.babyAgeTicks / 10))),
            );
            applyAnimalAgeScale(this);
            this.syncHorseState();
            return true;
        }

        if (BREEDING_FOOD.has(itemId) && this.tamed && this.health >= this.maxHealth) {
            interactWithBreedableAnimal(this, player, player.holdItem, BREEDING_FOOD);
            this.syncHorseState();
            return true;
        }

        const healthToRestore = Math.min(food.heal, this.maxHealth - this.health);
        if (healthToRestore > 0 || !this.tamed) {
            consumeHeldItem(player);
            if (healthToRestore > 0) this.addHealth(healthToRestore);
            this.temper = Math.min(100, this.temper + food.temper);
            this.syncHorseState();
        }
        return true;
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !Number.isFinite(damage) || damage <= 0) return;
        const armor = HORSE_ARMOR_POINTS[this.armorType] ?? 0;
        const reducedDamage = Math.max(0.5, damage * (1 - armor * 0.04));
        if (!this.damage(reducedDamage)) return;
        this.knockBack(hitfromX, kb);
    }

    syncHorseState() {
        if (!multiplayer || !runtime.server?.send) return;
        runtime.server.send({
            type: "entityRPC",
            sender: this.UUID,
            message: {
                method: "applyHorseState",
                args: [this.getHorseState()],
            },
        });
    }

    getHorseState() {
        return {
            maxHealth: this.maxHealth,
            movementSpeed: this.movementSpeed,
            jumpStrength: this.jumpStrength,
            tamed: this.tamed,
            temper: this.temper,
            coat: this.coat,
            markings: this.markings,
            saddled: this.saddled,
            armorType: this.armorType,
            riderUUID: this.riderUUID,
            tamingTicks: this.tamingTicks,
            jumpCharge: this.jumpCharge,
        };
    }

    applyHorseState(state = {}) {
        if (!state || typeof state !== "object") return;
        if (Number.isFinite(state.maxHealth)) {
            this.maxHealth = clamp(state.maxHealth, 15, 30);
            this.health = Math.min(this.health, this.maxHealth);
        }
        if (Number.isFinite(state.movementSpeed)) {
            this.movementSpeed = clamp(state.movementSpeed, 0.1125, 0.3375);
            this.rideSpeed = this.movementSpeed * 43.2;
            this.maxVelocity.x = this.rideSpeed * BLOCK_SIZE;
        }
        if (Number.isFinite(state.jumpStrength)) {
            this.jumpStrength = clamp(state.jumpStrength, 0.4, 1);
        }
        if (typeof state.tamed === "boolean") this.tamed = state.tamed;
        if (Number.isFinite(state.temper)) this.temper = clamp(state.temper, 0, 100);
        if (Object.hasOwn(state, "coat")) {
            this.coat = HORSE_COATS.includes(state.coat) ? state.coat : "brown";
        }
        if (Object.hasOwn(state, "markings")) {
            this.markings = HORSE_MARKINGS.includes(state.markings)
                ? state.markings : "none";
        }
        if (typeof state.saddled === "boolean") this.saddled = state.saddled;
        if (Object.hasOwn(state, "armorType")) {
            this.armorType = Object.hasOwn(HORSE_ARMOR_POINTS, state.armorType)
                ? state.armorType : null;
        }
        if (Object.hasOwn(state, "riderUUID")) {
            this.riderUUID = typeof state.riderUUID === "string" &&
                state.riderUUID.length <= 64 ? state.riderUUID : null;
        }
        if (Number.isFinite(state.tamingTicks)) {
            this.tamingTicks = clamp(Math.floor(state.tamingTicks), 0, 40);
        }
        if (Number.isFinite(state.jumpCharge)) this.jumpCharge = clamp(state.jumpCharge, 0, 1);
    }

    applyMultiplayerState(state) {
        this.applyHorseState(state);
    }

    dieEvent() {
        if (this.passenger) this.dismount(this.passenger);
        this.dropLoot();
        if (runtime.GAMERULES?.doMobLoot !== false) {
            const equipment = [
                ...(this.saddled ? [Items.Saddle] : []),
                ...(this.armorType ? [HORSE_ARMOR_IDS.get(this.armorType)] : []),
            ];
            for (const itemId of equipment) {
                this.world.summonEntity(
                    Drop,
                    new Vector2(this.position.x + this.hitbox.x / 2, this.position.y),
                    { itemId, count: 1 },
                    multiplayer,
                );
            }
        }
        this.world.removeEntity(this);
    }
}

function consumeHeldItem(player) {
    if (!player.abilities?.instaBuild) player.removeFromCurrentSlot();
}
