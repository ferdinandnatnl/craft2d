import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { runtime } from "../../utils/runtime.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT } from "../../utils/globals.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { Blocks, doorBlockPairs } from "@2dcraft.com/shared/blocks.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import { Sounds, playRandomSoundFromArray } from "../../game/sounds.js";
import {
    createVillagerTradeOffers,
    isVillagerProfession,
    TRADING_VILLAGER_PROFESSIONS,
} from "@2dcraft.com/shared/villagerTrades.js";

const VILLAGER_TYPES = Object.freeze([
    "desert", "jungle", "plains", "savanna", "snow", "swamp", "taiga",
]);
const PROFESSION_LEVEL_TEXTURES = Object.freeze([
    null, "stone", "iron", "gold", "emerald", "diamond",
]);
const textureLayers = new Map();
const villagerTextureUrls = new Map();

function normalizeVillagerType(value) {
    if (VILLAGER_TYPES.includes(value)) return value;
    const biome = String(value?.name ?? value ?? "plains").toLowerCase();
    if (biome.includes("desert")) return "desert";
    if (biome.includes("savanna")) return "savanna";
    if (biome.includes("swamp")) return "swamp";
    if (biome.includes("jungle") || biome.includes("rainforest")) return "jungle";
    if (biome.includes("snow") || biome.includes("tundra") ||
        biome.includes("frozen") || biome.includes("ice")) return "snow";
    if (biome.includes("taiga")) return "taiga";
    return "plains";
}

function loadTextureLayer(path) {
    if (textureLayers.has(path)) return textureLayers.get(path);
    const promise = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = getSpriteUrl(`entity/villager/${path}`);
    });
    textureLayers.set(path, promise);
    return promise;
}

function composeVillagerTexture(villagerType, profession, level) {
    const layers = ["villager", `type/${villagerType}`];
    if (profession && profession !== "unemployed" && profession !== "nitwit") {
        layers.push(`profession/${profession}`);
        const rankTexture = PROFESSION_LEVEL_TEXTURES[level];
        if (rankTexture) layers.push(`profession_level/${rankTexture}`);
    }
    const key = layers.join("|");
    if (villagerTextureUrls.has(key)) return villagerTextureUrls.get(key);

    const promise = Promise.all(layers.map(loadTextureLayer)).then((images) => {
        if (images.some((image) => !image?.naturalWidth)) return null;
        const canvas = document.createElement("canvas");
        canvas.width = images[0].naturalWidth;
        canvas.height = images[0].naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.imageSmoothingEnabled = false;
        for (const image of images) {
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
        }
        return canvas.toDataURL("image/png");
    });
    villagerTextureUrls.set(key, promise);
    return promise;
}

function applyVillagerAppearance(body, villagerType, profession, level) {
    if (typeof document === "undefined" || !body?.sprite?.startsWith("villager/")) return;
    const key = `${villagerType}:${profession ?? "none"}:${level}`;
    body.villagerAppearanceKey = key;
    composeVillagerTexture(villagerType, profession, level).then((url) => {
        if (!url || body.villagerAppearanceKey !== key) return;
        const image = new Image();
        image.onload = () => {
            if (body.villagerAppearanceKey === key) body.image = image;
        };
        image.src = url;
    });
}

function professionLevelFor(tradeCount) {
    if (tradeCount >= 60) return 5;
    if (tradeCount >= 30) return 4;
    if (tradeCount >= 15) return 3;
    if (tradeCount >= 5) return 2;
    return 1;
}

function isNight() {
    return runtime.time > 3.5 && runtime.time < 6.5;
}

export class Villager extends Mob {
    static spawnSize = Object.freeze({ width: 0.6, height: 1.95 });

    constructor(world, {
        UUID,
        health = 20,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        homeX = position.x,
        body = null,
        profession = null,
        villagerType = null,
        tradeUses = [],
        tradeCount = 0,
        dimension = 0,
    } = {}) {
        const villagerBody = body ?? createVillagerBody();
        const hasVillagerAppearance = villagerBody.sprite?.startsWith("villager/");
        const resolvedProfession = hasVillagerAppearance
            ? isVillagerProfession(profession)
                ? profession
                : TRADING_VILLAGER_PROFESSIONS[
                    Math.floor(Math.random() * TRADING_VILLAGER_PROFESSIONS.length)
                ]
            : null;
        const chunkBiome = world.getChunkForX?.(position.x, dimension)?.biome;
        const resolvedVillagerType = normalizeVillagerType(villagerType ?? chunkBiome);
        const resolvedTradeCount = Number.isInteger(tradeCount)
            ? Math.max(0, Math.min(1_000_000, tradeCount))
            : 0;
        super(world, {
            UUID,
            name: "Villager",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            body: villagerBody,
            hitbox: new Vector2(0.6 * BLOCK_SIZE, 1.95 * BLOCK_SIZE),
            ai: AI.PassiveSimple,
            speed: 1,
            stepSize: 0.4,
            ambientSounds: hasVillagerAppearance ? Sounds.Villager_Idle : null,
            despawn: false,
        });
        this.homeX = homeX;
        this.hasVillagerAppearance = hasVillagerAppearance;
        this.profession = resolvedProfession;
        this.villagerType = resolvedVillagerType;
        this.tradeCount = resolvedTradeCount;
        this.professionLevel = hasVillagerAppearance && resolvedProfession &&
            resolvedProfession !== "unemployed" && resolvedProfession !== "nitwit"
            ? professionLevelFor(resolvedTradeCount)
            : 1;
        this.tradeOffers = hasVillagerAppearance
            ? createVillagerTradeOffers(resolvedProfession, tradeUses)
            : [];
        this.lastObservedWorldTime = Number.isFinite(runtime.time) ? runtime.time : 1;
        this.bedTarget = null;
        this.openedDoor = null;
        this.nextBedSearchAt = 0;
        this.sleepState = null;
        this.isSleeping = false;
        applyVillagerAppearance(
            this.body,
            this.villagerType,
            this.profession,
            this.professionLevel,
        );
    }

    update() {
        this.checkTradeRestock();
        this.updateEntity();
        if (this.sleepState) {
            this.updateSleepState();
            if (this.sleepState) return;
        }
        if (!this.noAi) this.aiUpdate();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    moveToRandomX() {
        super.moveToRandomX();
        if (Math.abs(this.position.x + this.direction * BLOCK_SIZE - this.homeX) >
            1.7 * BLOCK_SIZE) {
            this.direction = this.position.x < this.homeX ? 1 : -1;
        }
    }

    passiveWander() {
        if (this.hasVillagerAppearance && !this.isMinion &&
            this.dimension === Dimensions.Overworld && isNight()) {
            this.walkToBed();
            return;
        }
        this.closeDoorBehind();
        if (!isNight()) {
            this.bedTarget = null;
            this.nextBedSearchAt = 0;
        }

        this.timeLastMoved += runtime.deltaTime;
        if (this.timeLastMoved >= this.randomMoveTime) {
            if (!this.moving) this.moveToRandomX();
            else {
                this.moving = false;
                this.resetMoveTime();
            }
        }

        const distance = Math.abs(this.position.x - this.homeX);
        const nextDistance = Math.abs(
            this.position.x + this.direction * BLOCK_SIZE * 0.25 - this.homeX,
        );
        if (this.moving && (
            (nextDistance > 1.7 * BLOCK_SIZE && nextDistance > distance) ||
            (this.timeLastMoved > 0.2 && this.velocity.x === 0)
        )) {
            this.moving = false;
            this.resetMoveTime();
        }
        this.targetVelocity.x = this.moving && this.grounded
            ? this.direction * this.speed * BLOCK_SIZE : 0;
    }

    checkTradeRestock() {
        const time = Number(runtime.time);
        if (!Number.isFinite(time)) return;
        if (time < this.lastObservedWorldTime) {
            for (const offer of this.tradeOffers) offer.uses = 0;
        }
        this.lastObservedWorldTime = time;
    }

    findNearestBed() {
        if (!this.world?.getBlockAtWorldPosition || !Number.isFinite(this.homeX)) return null;
        const radius = 18 * BLOCK_SIZE;
        const firstX = Math.floor((this.homeX - radius) / BLOCK_SIZE) * BLOCK_SIZE;
        const lastX = Math.floor((this.homeX + radius) / BLOCK_SIZE) * BLOCK_SIZE;
        const firstY = Math.max(
            0,
            Math.floor((this.position.y - 7 * BLOCK_SIZE) / BLOCK_SIZE) * BLOCK_SIZE,
        );
        const lastY = Math.min(
            (CHUNK_HEIGHT - 1) * BLOCK_SIZE,
            Math.floor((this.position.y + this.hitbox.y + 7 * BLOCK_SIZE) /
                BLOCK_SIZE) * BLOCK_SIZE,
        );
        const beds = [];

        for (let x = firstX; x <= lastX; x += BLOCK_SIZE) {
            for (let y = firstY; y <= lastY; y += BLOCK_SIZE) {
                const bed = this.world.getBlockAtWorldPosition(
                    x,
                    y,
                    false,
                    this.dimension,
                );
                if (bed?.blockType !== Blocks.BedFoot &&
                    bed?.blockType !== Blocks.BedFootWest) continue;

                const headX = x + (bed.blockType === Blocks.BedFootWest
                    ? -BLOCK_SIZE
                    : BLOCK_SIZE);
                const head = this.world.getBlockAtWorldPosition(
                    headX,
                    y,
                    false,
                    this.dimension,
                );
                if (head?.blockType !== Blocks.BedHead) continue;

                const bedLeftX = Math.min(x, headX);
                const occupied = this.world.entities.some((entity) =>
                    entity !== this &&
                    entity.name === "Villager" &&
                    !entity.isMinion &&
                    entity.dimension === this.dimension &&
                    ((entity.bedTarget?.bedX === x && entity.bedTarget?.bedY === y) ||
                        (entity.sleepState?.bedX === x && entity.sleepState?.bedY === y)),
                );
                if (occupied) continue;

                beds.push({
                    bedX: x,
                    bedY: y,
                    bedBlockType: bed.blockType,
                    bedLeftX,
                    bedTopY: y + BLOCK_SIZE * 7 / 16,
                    headDirection: Math.sign(headX - x),
                    dimension: this.dimension,
                    distance: Math.abs(bedLeftX + BLOCK_SIZE - this.homeX) +
                        Math.abs(y - this.position.y) * 0.25,
                });
            }
        }
        beds.sort((a, b) => a.distance - b.distance);
        return beds[0] ?? null;
    }

    walkToBed() {
        if (this.sleepState) return;
        this.closeDoorBehind();
        if (this.bedTarget && !this.isBedTargetValid(this.bedTarget)) {
            this.bedTarget = null;
        }
        if (!this.bedTarget && runtime.passedTime >= this.nextBedSearchAt) {
            this.bedTarget = this.findNearestBed();
            this.nextBedSearchAt = runtime.passedTime + 3;
        }
        const target = this.bedTarget;
        if (!target) {
            this.moving = false;
            this.targetVelocity.x = 0;
            return;
        }

        const targetX = target.bedLeftX + BLOCK_SIZE - this.hitbox.x / 2;
        const targetY = target.bedTopY - this.hitbox.y;
        const deltaX = targetX - this.position.x;
        if (Math.abs(deltaX) <= BLOCK_SIZE * 0.3 &&
            Math.abs(targetY - this.position.y) <= BLOCK_SIZE * 1.25 &&
            this.grounded) {
            this.beginSleeping(target);
            return;
        }

        this.direction = Math.sign(deltaX) || this.direction;
        this.moving = true;
        this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
        this.openDoorAhead(this.direction);
    }

    isBedTargetValid(target) {
        const bed = this.world.getBlockAtWorldPosition(
            target.bedX,
            target.bedY,
            false,
            target.dimension,
        );
        const headX = target.bedLeftX === target.bedX
            ? target.bedX + BLOCK_SIZE
            : target.bedX - BLOCK_SIZE;
        const head = this.world.getBlockAtWorldPosition(
            headX,
            target.bedY,
            false,
            target.dimension,
        );
        return (bed?.blockType === Blocks.BedFoot ||
            bed?.blockType === Blocks.BedFootWest) &&
            head?.blockType === Blocks.BedHead;
    }

    openDoorAhead(direction) {
        const worldX = direction > 0
            ? this.position.x + this.hitbox.x + 1
            : this.position.x - 1;
        const yValues = [
            this.position.y + this.hitbox.y - BLOCK_SIZE * 0.2,
            this.position.y + this.hitbox.y - BLOCK_SIZE * 1.2,
        ];
        for (const worldY of yValues) {
            const block = this.world.getBlockAtWorldPosition(
                Math.floor(worldX / BLOCK_SIZE) * BLOCK_SIZE,
                Math.floor(worldY / BLOCK_SIZE) * BLOCK_SIZE,
                false,
                this.dimension,
            );
            if (!block) continue;
            const door = doorBlockPairs.find(({ lower, upper, wooden }) =>
                wooden && (block.blockType === lower || block.blockType === upper)
            );
            if (door) {
                block.setDoorOpen?.(true);
                if (!this.openedDoor) {
                    const doorPosition = block.transform.position;
                    this.openedDoor = {
                        x: doorPosition.x,
                        y: block.blockType === door.upper
                            ? doorPosition.y + BLOCK_SIZE
                            : doorPosition.y,
                        direction,
                        dimension: this.dimension,
                    };
                }
                return;
            }
        }
    }

    closeDoorBehind() {
        const openedDoor = this.openedDoor;
        if (!openedDoor) return;
        const clearedDoor = openedDoor.direction > 0
            ? this.position.x >= openedDoor.x + BLOCK_SIZE
            : this.position.x + this.hitbox.x <= openedDoor.x;
        if (!clearedDoor) return;

        const doorOccupied = this.world.entities.some((entity) => {
            if (entity === this ||
                (entity.name !== "Villager" && entity !== this.world.player) ||
                entity.dimension !== openedDoor.dimension || !entity.hitbox ||
                !entity.position) return false;
            const overlapsX = entity.position.x < openedDoor.x + BLOCK_SIZE &&
                entity.position.x + entity.hitbox.x > openedDoor.x;
            const overlapsY = entity.position.y < openedDoor.y + BLOCK_SIZE &&
                entity.position.y + entity.hitbox.y > openedDoor.y - BLOCK_SIZE;
            return overlapsX && overlapsY;
        });
        if (doorOccupied) return;

        this.world.getBlockAtWorldPosition(
            openedDoor.x,
            openedDoor.y,
            false,
            openedDoor.dimension,
        )?.setDoorOpen?.(false);
        this.openedDoor = null;
    }

    beginSleeping(target) {
        this.sleepState = {
            ...target,
            phase: "lyingDown",
            elapsed: 0,
            saved: {
                position: { x: this.position.x, y: this.position.y },
                canMove: this.canMove,
                noGravity: this.noGravity,
                noCollision: this.noCollision,
                grounded: this.grounded,
                standingOnBlockType: this.standingOnBlockType,
                direction: this.direction,
                lookDirection: this.lookDirection,
            },
        };
        this.isSleeping = true;
        this.canMove = false;
        this.noGravity = true;
        this.noCollision = true;
        this.grounded = true;
        this.direction = target.headDirection;
        this.lookDirection = target.headDirection > 0 ? 0 : 180;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.targetVelocity.x = 0;
        this.targetVelocity.y = 0;
        this.shouldAddForce.x = 0;
        this.shouldAddForce.y = 0;
        this.moving = false;
        this.updateSleepPose(0);
    }

    updateSleepPose(amount) {
        const state = this.sleepState;
        if (!state) return;
        const easedAmount = Math.max(0, Math.min(1, amount));
        const angle = easedAmount * Math.PI / 2;
        const verticalExtent = BLOCK_SIZE * (
            0.9 * Math.cos(angle) + 0.2 * Math.sin(angle)
        );
        const centerX = state.bedLeftX + BLOCK_SIZE;
        const centerY = state.bedTopY - verticalExtent;
        this.position.x = centerX - this.hitbox.x / 2;
        this.position.y = centerY - BLOCK_SIZE * 0.9;
        if (this.body) {
            this.body.sleepAmount = easedAmount;
            this.body.sleepDirection = state.headDirection;
        }
    }

    updateSleepState() {
        const state = this.sleepState;
        if (!state) return;
        if ((!this.isBedTargetValid(state) ||
            this.dimension !== Dimensions.Overworld || !isNight()) &&
            state.phase !== "wakingUp") {
            state.phase = "wakingUp";
            state.elapsed = 0;
        }

        const deltaTime = Math.max(0, Math.min(runtime.deltaTime || 0, 0.1));
        const animateSeconds = 0.35;
        state.elapsed += deltaTime;
        if (state.phase === "lyingDown") {
            const progress = Math.min(1, state.elapsed / animateSeconds);
            this.updateSleepPose(progress * progress * (3 - 2 * progress));
            if (progress >= 1) {
                state.phase = "asleep";
                state.elapsed = 0;
            }
            return;
        }
        if (state.phase === "asleep") {
            this.updateSleepPose(1);
            return;
        }

        const progress = Math.min(1, state.elapsed / animateSeconds);
        this.updateSleepPose(1 - progress * progress * (3 - 2 * progress));
        if (progress >= 1) this.wakeFromBed();
    }

    wakeFromBed() {
        const state = this.sleepState;
        if (!state) return;
        const bedStillExists = this.isBedTargetValid(state);
        this.sleepState = null;
        this.isSleeping = false;
        this.position.x = bedStillExists
            ? state.bedLeftX + BLOCK_SIZE - this.hitbox.x / 2
            : state.saved.position.x;
        this.position.y = bedStillExists
            ? state.bedTopY - this.hitbox.y
            : state.saved.position.y;
        this.noGravity = state.saved.noGravity;
        this.noCollision = state.saved.noCollision;
        this.canMove = state.saved.canMove;
        this.grounded = bedStillExists ? true : state.saved.grounded;
        this.standingOnBlockType = bedStillExists
            ? state.bedBlockType
            : state.saved.standingOnBlockType;
        this.direction = state.saved.direction;
        this.lookDirection = state.saved.lookDirection;
        if (this.body) {
            this.body.sleepAmount = 0;
            this.body.sleepDirection = 1;
        }
        this.bedTarget = null;
    }

    refreshTradeRank() {
        const nextLevel = this.profession === "unemployed" ||
            this.profession === "nitwit"
            ? 1
            : professionLevelFor(this.tradeCount);
        if (nextLevel === this.professionLevel) return;
        this.professionLevel = nextLevel;
        applyVillagerAppearance(
            this.body,
            this.villagerType,
            this.profession,
            this.professionLevel,
        );
    }

    applyMultiplayerState(state) {
        if (!state || typeof state !== "object" || !this.hasVillagerAppearance) return;
        let identityChanged = false;
        const remoteClientMob = this.isMultiplayerRemoteMob &&
            runtime.world?.isWorldAuthority === false;
        const previousLevel = this.professionLevel;
        if (isVillagerProfession(state.profession) &&
            state.profession !== this.profession) {
            this.profession = state.profession;
            identityChanged = true;
        }
        const nextType = VILLAGER_TYPES.includes(state.villagerType)
            ? state.villagerType
            : this.villagerType;
        if (nextType !== this.villagerType) {
            this.villagerType = nextType;
            identityChanged = true;
        }
        if (!remoteClientMob && Number.isInteger(state.tradeCount)) {
            this.tradeCount = Math.max(0, Math.min(1_000_000, state.tradeCount));
        }
        if (!remoteClientMob && Array.isArray(state.tradeUses)) {
            this.tradeOffers = createVillagerTradeOffers(
                this.profession,
                state.tradeUses,
            );
        } else if (identityChanged) {
            this.tradeOffers = createVillagerTradeOffers(this.profession);
        }
        this.professionLevel = this.profession === "unemployed" ||
            this.profession === "nitwit"
            ? 1
            : professionLevelFor(this.tradeCount);
        if (typeof state.isSleeping === "boolean") {
            this.isSleeping = state.isSleeping;
            this.body.sleepAmount = this.isSleeping ? 1 : 0;
            this.body.sleepDirection = this.isSleeping ? this.direction : 1;
        }
        if (identityChanged || previousLevel !== this.professionLevel) {
            applyVillagerAppearance(
                this.body,
                this.villagerType,
                this.profession,
                this.professionLevel,
            );
        }
    }

    interact(player) {
        if (this.isSleeping || !this.tradeOffers.length) {
            playRandomSoundFromArray({
                array: Sounds.Villager_No,
                positional: true,
                origin: this.position,
                range: 8,
            });
            return false;
        }
        if (player?.openVillagerTrade?.(this)) return true;
        playRandomSoundFromArray({
            array: Sounds.Villager_No,
            positional: true,
            origin: this.position,
            range: 8,
        });
        return false;
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
        playRandomSoundFromArray({
            array: Sounds.Villager_Hurt,
            positional: true,
            origin: this.position,
        });
    }

    dieEvent() {
        playRandomSoundFromArray({
            array: Sounds.Villager_Death,
            positional: true,
            origin: this.position,
        });
        this.world.removeEntity(this);
    }
}

export function createVillagerBody() {
    return new Body({
        sprite: "villager/farmer",
        parts: {
            leftLeg: new BodyPart({
                spriteCrop: { x: 4, y: 26, width: 4, height: 12 },
                offset: { x: 0, y: 80 },
                zIndex: -1,
                sways: true,
                swayPhase: Math.PI,
            }),
            rightLeg: new BodyPart({
                spriteCrop: { x: 4, y: 26, width: 4, height: 12 },
                offset: { x: 16, y: 80 },
                zIndex: -1,
                sways: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 6, y: 44, width: 8, height: 18 },
                offset: { x: 0, y: 39 },
            }),
            arms: new BodyPart({
                spriteCrop: { x: 44, y: 42, width: 8, height: 4 },
                offset: { x: 0, y: 54 },
                zIndex: 2,
            }),
            head: new BodyPart({
                spriteCrop: { x: 8, y: 8, width: 8, height: 10 },
                offset: { x: -6, y: 0 },
                zIndex: 3,
            }),
            nose: new BodyPart({
                spriteCrop: { x: 26, y: 2, width: 2, height: 4 },
                offset: { x: 3, y: 17 },
                zIndex: 4,
            }),
        },
    });
}
