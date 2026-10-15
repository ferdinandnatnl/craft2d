import { runtime } from "../utils/runtime.js";
import { EntityTypes } from "../game/entity.js";
import { Entities } from "../entities/entities.js";
import { Mob } from "../entities/mob.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_WIDTH } from "../utils/globals.js";

const MAX_SYNCED_MOBS = 512;
const SYNCED_MOB_FIELDS = [
    "babyAgeTicks",
    "loveTicks",
    "breedingCooldown",
    "breedingOwnerUUID",
    "maxHealth",
    "movementSpeed",
    "jumpStrength",
    "temper",
    "coat",
    "markings",
    "saddled",
    "armorType",
    "riderUUID",
    "tamingTicks",
    "jumpCharge",
    "hasWool",
    "woolTimer",
    "layEggTimer",
    "catfishSize",
    "swimPhase",
    "tamed",
    "ownerUUID",
    "sitting",
    "command",
    "hasEgg",
    "variant",
    "attackPoseKind",
    "attackPoseDuration",
    "attackPoseUntil",
    "powered",
    "fuseTimer",
    "chargeTicks",
    "state",
    "moving",
    "attackCooldown",
    "attackCooldownMax",
    "flightTime",
    "fire",
    "air",
    "poisonTicks",
    "poisonAmplifier",
    "poisonDamageTicks",
];

function getMobEntityName(entity) {
    const name = entity.entityTypeName || entity.constructor?.name || entity.name;
    return typeof name === "string" ? name.replaceAll(" ", "") : "";
}

function copySyncFields(entity) {
    const fields = {};
    for (const key of SYNCED_MOB_FIELDS) {
        const value = entity[key];
        if (
            typeof value === "boolean" ||
            (typeof value === "string" && value.length <= 64) ||
            (typeof value === "number" && Number.isFinite(value))
        ) {
            fields[key] = value;
        }
    }
    if (entity.name === "Villager" && Array.isArray(entity.tradeOffers)) {
        fields.profession = entity.profession;
        fields.villagerType = entity.villagerType;
        fields.tradeCount = entity.tradeCount;
        fields.isSleeping = entity.isSleeping;
        fields.tradeUses = entity.tradeOffers
            .slice(0, 3)
            .map((offer) => offer.uses);
    }
    return fields;
}

export function buildWorldSnapshot(world = runtime.world) {
    if (!world) return null;
    const mobs = world.entities
        .filter((entity) =>
            entity.type === EntityTypes.Mob &&
            !entity.isMinion &&
            entity.health > 0 &&
            Number.isFinite(entity.position?.x) &&
            Number.isFinite(entity.position?.y) &&
            Number.isInteger(entity.dimension) &&
            Entities[getMobEntityName(entity)],
        )
        .slice(-MAX_SYNCED_MOBS)
        .map((entity) => ({
            UUID: entity.UUID,
            entity: getMobEntityName(entity),
            position: { x: entity.position.x, y: entity.position.y },
            dimension: entity.dimension,
            health: entity.health,
            direction: entity.direction < 0 ? -1 : 1,
            velocity: {
                x: Number.isFinite(entity.velocity?.x) ? entity.velocity.x : 0,
                y: Number.isFinite(entity.velocity?.y) ? entity.velocity.y : 0,
            },
            myChunkX: Number.isFinite(entity.myChunkX)
                ? entity.myChunkX
                : Math.floor(entity.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) *
                  CHUNK_WIDTH * BLOCK_SIZE,
            fields: copySyncFields(entity),
        }));

    return {
        time: Number.isFinite(runtime.time) ? runtime.time : 1,
        mobs,
    };
}

function isValidMobState(state) {
    return state &&
        typeof state.UUID === "string" && state.UUID.length > 0 && state.UUID.length <= 64 &&
        typeof state.entity === "string" &&
        (Entities[state.entity]?.prototype instanceof Mob ||
            state.entity === "EnderDragon") &&
        Number.isFinite(state.position?.x) && Number.isFinite(state.position?.y) &&
        Number.isInteger(state.dimension) && state.dimension >= 0 && state.dimension <= 2 &&
        Number.isFinite(state.health) && state.health > 0 && state.health <= 10_000;
}

export function applyWorldSnapshot(snapshot) {
    const world = runtime.world;
    if (!world || !snapshot || !Array.isArray(snapshot.mobs)) return;

    if (Number.isFinite(snapshot.time)) {
        runtime.time = Math.max(0, Math.min(8, snapshot.time));
    }

    const seen = new Set();
    for (const state of snapshot.mobs.slice(0, MAX_SYNCED_MOBS)) {
        if (!isValidMobState(state) || seen.has(state.UUID)) continue;
        seen.add(state.UUID);

        let entity = world.getEntityByUUID(state.UUID);
        if (entity && entity.type !== EntityTypes.Mob) continue;
        if (!entity) {
            const props = {
                dimension: state.dimension,
                health: state.health,
                myChunkX: Number.isFinite(state.myChunkX) ? state.myChunkX : null,
                direction: state.direction < 0 ? -1 : 1,
                ...(state.velocity ? { velocity: new Vector2(
                    Number.isFinite(state.velocity.x) ? state.velocity.x : 0,
                    Number.isFinite(state.velocity.y) ? state.velocity.y : 0,
                ) } : {}),
                ...(state.fields && typeof state.fields === "object"
                    ? state.fields
                    : {}),
            };
            entity = world.summonEntity(
                Entities[state.entity],
                new Vector2(state.position.x, state.position.y),
                props,
                false,
                state.UUID,
            );
        }

        entity.position = new Vector2(state.position.x, state.position.y);
        entity.dimension = state.dimension;
        entity.health = state.health;
        entity.direction = state.direction < 0 ? -1 : 1;
        entity.myChunkX = Number.isFinite(state.myChunkX) ? state.myChunkX : null;
        if (state.velocity && entity.velocity) {
            entity.velocity.x = Number.isFinite(state.velocity.x) ? state.velocity.x : 0;
            entity.velocity.y = Number.isFinite(state.velocity.y) ? state.velocity.y : 0;
        }
        if (state.fields && typeof state.fields === "object") {
            for (const key of SYNCED_MOB_FIELDS) {
                const value = state.fields[key];
                if (
                    typeof value === "boolean" ||
                    (typeof value === "string" && value.length <= 64) ||
                    (typeof value === "number" && Number.isFinite(value))
                ) {
                    entity[key] = value;
                }
            }
            entity.applyMultiplayerState?.(state.fields);
        }
        entity.multiplayerWorldEntity = true;
        entity.isMultiplayerRemoteMob = !world.isWorldAuthority && !entity.isMinion;

        if (Number.isFinite(entity.myChunkX)) {
            const chunk = world.getDimensionChunks(entity.dimension)?.get(entity.myChunkX);
            if (chunk && !chunk.entities.includes(entity)) chunk.entities.push(entity);
        }
    }

    if (!world.isWorldAuthority) {
        for (const entity of [...world.entities]) {
            if (
                entity.multiplayerWorldEntity &&
                entity.type === EntityTypes.Mob &&
                !entity.isMinion &&
                !seen.has(entity.UUID)
            ) {
                world.removeEntity(entity);
            }
        }
    }
}
