import { EntityTypes } from "../../game/entity.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { runtime } from "../../utils/runtime.js";
import { PARTICLE } from "../../world/particle.js";
import { createParticleEmitter } from "../../world/particleEmitter.js";

export const ANIMAL_BABY_AGE_TICKS = 24_000;
const BREEDING_LOVE_TICKS = 6_000;
const BREEDING_COOLDOWN_TICKS = 6_000;
const BREEDING_DISTANCE = 4 * BLOCK_SIZE;

export function initializeBreedableAnimal(
    animal,
    {
        babyAgeTicks = 0,
        loveTicks = 0,
        breedingCooldown = 0,
        adultWidth,
        adultHeight,
        foodItems = new Set(),
    } = {},
) {
    animal.babyAgeTicks = clampTicks(babyAgeTicks, ANIMAL_BABY_AGE_TICKS);
    animal.loveTicks = clampTicks(loveTicks, BREEDING_LOVE_TICKS);
    animal.breedingCooldown = clampTicks(breedingCooldown, BREEDING_COOLDOWN_TICKS);
    animal.breedingOwnerUUID = null;
    animal.breedingFoods = foodItems;
    animal.adultHitbox = new Vector2(adultWidth, adultHeight);
    animal.adultBodyRenderScale = animal.body?.renderScale ?? 1;
    animal.appliedBabyScale = null;
    applyAnimalAgeScale(animal);
}

export function followAnimalFood(animal) {
    if (animal.noAi || !animal.breedingFoods?.size) return false;
    const player = animal.world?.entities?.find((candidate) =>
        candidate.type === EntityTypes.Player &&
        candidate.dimension === animal.dimension &&
        candidate.abilities?.hasHealth &&
        animal.breedingFoods.has(candidate.holdItem?.itemId) &&
        animalDistance(animal, candidate) <= 8 * BLOCK_SIZE,
    );
    if (!player) return false;

    const animalCenter = animal.position.x + animal.hitbox.x / 2;
    const playerCenter = player.position.x + player.hitbox.x / 2;
    if (Math.abs(playerCenter - animalCenter) <= BLOCK_SIZE / 3) {
        animal.targetVelocity.x = 0;
        animal.moving = false;
        return true;
    }

    animal.direction = playerCenter < animalCenter ? -1 : 1;
    animal.targetVelocity.x = animal.direction * animal.speed * BLOCK_SIZE;
    animal.moving = true;
    return true;
}

export function interactWithBreedableAnimal(animal, player, item, foodItems) {
    if (!item || !foodItems.has(item.itemId)) return false;

    if (animal.isBaby) {
        if (!player?.abilities?.instaBuild) player?.removeFromCurrentSlot?.();
        animal.babyAgeTicks = Math.max(
            0,
            animal.babyAgeTicks - Math.max(1, Math.ceil(animal.babyAgeTicks / 10)),
        );
        applyAnimalAgeScale(animal);
        syncBreedableAnimalState(animal);
        return true;
    }

    if (animal.loveTicks > 0 || animal.breedingCooldown > 0) return true;
    if (!player?.abilities?.instaBuild) player?.removeFromCurrentSlot?.();
    animal.loveTicks = BREEDING_LOVE_TICKS;
    animal.breedingOwnerUUID = player?.UUID ?? null;
    showLoveParticles(animal);
    syncBreedableAnimalState(animal);
    return true;
}

export function tickBreedableAnimal(animal, AnimalType) {
    if (animal.babyAgeTicks > 0) {
        animal.babyAgeTicks--;
        applyAnimalAgeScale(animal);
    }
    if (animal.loveTicks > 0) animal.loveTicks--;
    if (animal.breedingCooldown > 0) animal.breedingCooldown--;
    if (animal.isBaby || animal.loveTicks <= 0 || animal.breedingCooldown > 0) return;

    const partner = animal.world?.entities?.find((candidate) =>
        candidate !== animal &&
        candidate.name === animal.name &&
        candidate.type === EntityTypes.Mob &&
        candidate.dimension === animal.dimension &&
        candidate.health > 0 &&
        !candidate.isBaby &&
        candidate.loveTicks > 0 &&
        candidate.breedingCooldown <= 0 &&
        animalDistance(animal, candidate) <= BREEDING_DISTANCE,
    );
    if (!partner) return;

    animal.loveTicks = 0;
    partner.loveTicks = 0;
    animal.breedingCooldown = BREEDING_COOLDOWN_TICKS;
    partner.breedingCooldown = BREEDING_COOLDOWN_TICKS;
    const ownerUUID = breedingAuthority(animal, partner);
    animal.breedingOwnerUUID = null;
    partner.breedingOwnerUUID = null;
    if (multiplayer && ownerUUID !== animal.world?.player?.UUID) return;

    syncBreedableAnimalState(animal);
    syncBreedableAnimalState(partner);

    const chunk = animal.world.getChunkForX(animal.position.x, animal.dimension);
    if (!chunk) return;
    const centerX = (animal.position.x + animal.hitbox.x / 2 +
        partner.position.x + partner.hitbox.x / 2) / 2;
    const feetY = Math.min(
        animal.position.y + animal.hitbox.y,
        partner.position.y + partner.hitbox.y,
    );
    const adultWidth = AnimalType.spawnSize.width * BLOCK_SIZE;
    const adultHeight = AnimalType.spawnSize.height * BLOCK_SIZE;
    const baby = animal.world.summonEntity(
        AnimalType,
        new Vector2(centerX - adultWidth / 2, feetY - adultHeight),
        {
            myChunkX: chunk.x,
            babyAgeTicks: ANIMAL_BABY_AGE_TICKS,
            dimension: animal.dimension,
            ...(animal.name === "Chicken"
                ? { layEggTimer: randomRange(6_000, 12_000) }
                : {}),
        },
        multiplayer,
    );
    baby.dimension = animal.dimension;
    const babyChunk = animal.world.getChunkForX(baby.position.x, baby.dimension);
    if (babyChunk && !babyChunk.entities.includes(baby)) babyChunk.entities.push(baby);
}

export function applyBreedableAnimalState(animal, state = {}) {
    if (!state || typeof state !== "object") return;
    if (Number.isFinite(state.babyAgeTicks)) {
        animal.babyAgeTicks = clampTicks(state.babyAgeTicks, ANIMAL_BABY_AGE_TICKS);
        applyAnimalAgeScale(animal);
    }
    if (Number.isFinite(state.loveTicks)) {
        animal.loveTicks = clampTicks(state.loveTicks, BREEDING_LOVE_TICKS);
    }
    if (Number.isFinite(state.breedingCooldown)) {
        animal.breedingCooldown = clampTicks(state.breedingCooldown, BREEDING_COOLDOWN_TICKS);
    }
    animal.breedingOwnerUUID = typeof state.breedingOwnerUUID === "string"
        ? state.breedingOwnerUUID.slice(0, 64)
        : null;
}

export function getBreedableAnimalSaveData(animal) {
    return {
        UUID: animal.UUID,
        type: animal.name,
        position: { x: animal.position.x, y: animal.position.y },
        health: animal.health,
        dimension: animal.dimension,
        babyAgeTicks: animal.babyAgeTicks,
        loveTicks: animal.loveTicks,
        breedingCooldown: animal.breedingCooldown,
        breedingOwnerUUID: animal.breedingOwnerUUID,
        ...(animal.name === "Sheep"
            ? { hasWool: animal.hasWool, woolTimer: animal.woolTimer }
            : {}),
        ...(animal.name === "Chicken" ? { layEggTimer: animal.layEggTimer } : {}),
    };
}

export function syncBreedableAnimalState(animal) {
    if (!multiplayer || !runtime.server?.send) return;
    runtime.server.send({
        type: "entityRPC",
        sender: animal.UUID,
        message: {
            method: "syncBreedableAnimalState",
            args: [{
                babyAgeTicks: animal.babyAgeTicks,
                loveTicks: animal.loveTicks,
                breedingCooldown: animal.breedingCooldown,
                breedingOwnerUUID: animal.breedingOwnerUUID,
            }],
        },
    });
}

function applyAnimalAgeScale(animal) {
    const scale = animal.isBaby ? 0.5 : 1;
    if (animal.appliedBabyScale === scale) return;
    animal.appliedBabyScale = scale;

    const centerX = animal.position.x + animal.hitbox.x / 2;
    const feetY = animal.position.y + animal.hitbox.y;
    animal.hitbox.x = animal.adultHitbox.x * scale;
    animal.hitbox.y = animal.adultHitbox.y * scale;
    animal.position.x = centerX - animal.hitbox.x / 2;
    animal.position.y = feetY - animal.hitbox.y;
    if (animal.body) animal.body.renderScale = animal.adultBodyRenderScale * scale;
}

function animalDistance(first, second) {
    return Vector2.Distance(
        new Vector2(
            first.position.x + first.hitbox.x / 2,
            first.position.y + first.hitbox.y / 2,
        ),
        new Vector2(
            second.position.x + second.hitbox.x / 2,
            second.position.y + second.hitbox.y / 2,
        ),
    );
}

function breedingAuthority(first, second) {
    const candidates = [first.breedingOwnerUUID, second.breedingOwnerUUID]
        .filter((uuid) => typeof uuid === "string" &&
            first.world?.entities?.some((entity) =>
                entity.type === EntityTypes.Player && entity.UUID === uuid,
            ))
        .sort();
    return candidates[0] ?? null;
}

function clampTicks(value, max) {
    return Math.max(0, Math.min(max, Math.floor(value || 0)));
}

function showLoveParticles(animal) {
    createParticleEmitter({
        x: animal.position.x + animal.hitbox.x / 2,
        y: animal.position.y - BLOCK_SIZE * 0.2,
        type: PARTICLE.Heart,
        maxParticles: 3,
        speed: 0.5,
        direction: -90,
        fadeOutTime: 1_000,
        color: "#ff6b8c",
        randomScale: true,
        range: 2,
        lighting: false,
        scale: 10,
    }).emitAndDie();
}
