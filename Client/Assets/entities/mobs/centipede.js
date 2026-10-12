import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { EntityTypes } from "../../game/entity.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Vector2, randomRange } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { Sounds, playRandomSoundFromArray } from "../../game/sounds.js";

const MAX_SEGMENTS = 8;
const SEGMENT_SPACING = BLOCK_SIZE * 0.84;
const FOLLOW_RANGE = BLOCK_SIZE * 32;
const ARMOR_POINTS = 6;

export class Centipede extends Mob {
    static spawnSize = Object.freeze({ width: 0.9, height: 0.9 });

    static randomSegmentCount(random = Math.random) {
        return Math.floor(random() * 4) + 5;
    }

    constructor(world, {
        health = 35,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        UUID,
        segmentCount = Centipede.randomSegmentCount(),
        segmentTrail = null,
    } = {}) {
        const body = createCentipedeBody();
        super(world, {
            name: "Centipede",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            UUID,
            hitbox: new Vector2(
                Centipede.spawnSize.width * BLOCK_SIZE,
                Centipede.spawnSize.height * BLOCK_SIZE,
            ),
            body,
            ai: AI.PassiveSimple,
            speed: 1.4,
            stepSize: 0.38,
            footstepSounds: Sounds.Centipede_Walk,
            isHostile: true,
            lootTable: new LootTable([
                new LootItem({ itemId: Items.CentipedeLeg, maxCount: 2, subtract: 2 }),
            ]),
        });

        this.entityTypeName = "Centipede";
        this.isCentipede = true;
        this.armorPoints = ARMOR_POINTS;
        this.segmentCount = clampSegmentCount(segmentCount);
        this.attackCooldown = 0;
        this.currentTarget = null;
        this.fleeLightTicks = 0;
        this.shelterTarget = null;
        this.walkPhase = 0;
        this.segmentTrail = normalizeTrail(segmentTrail) ||
            createInitialTrail(this.center(), this.direction, this.segmentCount);
        this.segmentPositions = [];
        this.updateSegmentChain();
    }

    update() {
        const dt = Math.max(0, Math.min(runtime.deltaTime || 0, 0.1));
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.fleeLightTicks = Math.max(0, this.fleeLightTicks - dt * 20);
        this.walkPhase += Math.hypot(this.velocity.x, this.velocity.y) * dt / BLOCK_SIZE;

        if (!this.noAi) {
            this.currentTarget = this.findTarget(this.currentTarget);
            if (this.currentTarget) {
                this.shelterTarget = null;
                this.moveToward(this.currentTarget);
                this.tryAttack(this.currentTarget);
            } else if (!this.fleeFromLight()) {
                this.passiveWander();
            }
        }

        this.updateEntity();
        this.updateSegmentChain();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    findTarget(current = null) {
        if (current && this.isTargetValid(current)) return current;
        const candidates = new Set(this.world?.entities || []);
        if (this.world?.player) candidates.add(this.world.player);
        return [...candidates]
            .filter(entity => this.isTargetValid(entity))
            .sort((a, b) => this.distanceTo(a) - this.distanceTo(b))[0] || null;
    }

    isTargetValid(entity) {
        if (!entity || entity === this || entity.health <= 0 ||
            entity.dimension !== this.dimension) return false;
        if (entity.type === EntityTypes.Player) {
            return entity.abilities?.hasHealth === true && this.distanceTo(entity) <= FOLLOW_RANGE;
        }
        const type = entity.entityTypeName || entity.name;
        return (type === "Villager" || type === "Cockroach" || entity.isCockroach) &&
            this.distanceTo(entity) <= FOLLOW_RANGE;
    }

    moveToward(target) {
        const ownCenter = this.center();
        const targetCenter = entityCenter(target);
        const dx = targetCenter.x - ownCenter.x;
        const dy = targetCenter.y - ownCenter.y;
        this.direction = dx < 0 ? -1 : 1;

        if (Math.abs(dx) <= BLOCK_SIZE * 0.8 && Math.abs(dy) <= BLOCK_SIZE) {
            this.targetVelocity.x = 0;
        } else {
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
        }
        if (dy < -BLOCK_SIZE * 0.35 && this.grounded) this.jump();
    }

    tryAttack(target) {
        if (this.attackCooldown > 0) return false;
        const ownCenter = this.center();
        const targetCenter = entityCenter(target);
        if (Math.hypot(targetCenter.x - ownCenter.x, targetCenter.y - ownCenter.y) >
            BLOCK_SIZE * 1.1) return false;

        const healthBefore = target.health;
        target.hit?.(8, ownCenter.x, 1, "Bitten by a Centipede", this);
        if (target.health < healthBefore) {
            const difficulty = this.world?.difficulty || "normal";
            const poisonTicks = difficulty === "hard"
                ? 20 * 20
                : difficulty === "normal" ? 10 * 20 : 3 * 20;
            target.applyPoison?.(poisonTicks, 1);
            playRandomSoundFromArray({
                array: Sounds.Centipede_Attack,
                positional: true,
                origin: this.position,
            });
        }
        this.attackCooldown = 1.2;
        this.attackPoseUntil = runtime.passedTime + 0.35;
        return true;
    }

    fleeFromLight() {
        if (this.fleeLightTicks > 0) return this.moveTowardShelter();
        else {
            this.fleeLightTicks = 75;
            if ((this.getLightLevel() ?? 0) >= 5) {
                this.shelterTarget = this.findDarkShelter();
            }
        }
        return this.moveTowardShelter();
    }

    moveTowardShelter() {
        if (!this.shelterTarget) return false;
        const center = this.center();
        const dx = this.shelterTarget.x - center.x;
        const dy = this.shelterTarget.y - center.y;
        if (Math.hypot(dx, dy) < BLOCK_SIZE * 0.5) {
            this.shelterTarget = null;
            this.targetVelocity.x = 0;
            return true;
        }
        this.direction = dx < 0 ? -1 : 1;
        this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
        if (dy < -BLOCK_SIZE && this.grounded) this.jump();
        return true;
    }

    findDarkShelter() {
        const origin = this.center();
        for (let attempt = 0; attempt < 10; attempt++) {
            const x = origin.x + randomRange(-10, 11) * BLOCK_SIZE;
            const y = origin.y + randomRange(-3, 4) * BLOCK_SIZE;
            const block = this.world?.getBlockAtWorldPosition?.(x, y, false, this.dimension);
            if ((block?.lightLevel ?? 0) < 5 && block?.blockType === Blocks.Air) {
                return new Vector2(x, y);
            }
        }
        return null;
    }

    hit(damage, hitfromX = 0, kb = 0, cause = null, attacker = null) {
        if (this.health <= 0 || this.invulnerable || cause === "In wall" ||
            !Number.isFinite(damage) || damage <= 0) return false;
        const armorReduction = Math.min(
            20,
            Math.max(ARMOR_POINTS / 5, ARMOR_POINTS - damage / 2),
        ) / 25;
        if (!this.damage(damage * (1 - armorReduction), attacker)) return false;
        if (attacker && attacker !== this && this.isTargetValid(attacker)) {
            this.currentTarget = attacker;
        }
        this.knockBack(hitfromX, kb);
        playRandomSoundFromArray({
            array: Sounds.Centipede_Hurt,
            positional: true,
            origin: this.position,
        });
        return true;
    }

    dieEvent() {
        this.dropLoot();
        playRandomSoundFromArray({
            array: Sounds.Centipede_Hurt,
            positional: true,
            origin: this.position,
        });
        this.world?.removeEntity?.(this);
    }

    center() {
        return new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        );
    }

    distanceTo(entity) {
        const center = entityCenter(entity);
        const own = this.center();
        return Math.hypot(center.x - own.x, center.y - own.y);
    }

    updateSegmentChain() {
        const center = this.center();
        const last = this.segmentTrail[0];
        if (!last || Math.hypot(center.x - last.x, center.y - last.y) >= 2) {
            this.segmentTrail.unshift({ x: center.x, y: center.y });
        }
        const maxTrail = Math.ceil(this.segmentCount * 0.84 * 16) + 8;
        this.segmentTrail.length = Math.min(this.segmentTrail.length, maxTrail);
        this.segmentPositions = followCentipedeTrail(
            this.segmentTrail,
            this.segmentCount,
        );
    }

    createSaveData() {
        return {
            UUID: this.UUID,
            position: { x: this.position.x, y: this.position.y },
            dimension: this.dimension,
            health: this.health,
            segmentCount: this.segmentCount,
            segmentTrail: this.segmentTrail.slice(0, 128),
        };
    }
}

export function followCentipedeTrail(trail, segmentCount) {
    if (!Array.isArray(trail) || !trail.length) return [];
    const points = trail.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (!points.length) return [];
    return Array.from({ length: clampSegmentCount(segmentCount) }, (_, index) => {
        const distance = (index + 1) * SEGMENT_SPACING;
        const point = pointAlongTrail(points, distance);
        const front = pointAlongTrail(points, Math.max(0, distance - BLOCK_SIZE * 0.08));
        const back = pointAlongTrail(points, distance + BLOCK_SIZE * 0.08);
        return {
            ...point,
            angle: Math.atan2(front.y - back.y, front.x - back.x),
        };
    });
}

function pointAlongTrail(points, distance) {
    let remaining = distance;
    for (let index = 0; index < points.length - 1; index++) {
        const from = points[index];
        const to = points[index + 1];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length <= 0) continue;
        if (remaining <= length) {
            const amount = remaining / length;
            return {
                x: from.x + (to.x - from.x) * amount,
                y: from.y + (to.y - from.y) * amount,
            };
        }
        remaining -= length;
    }
    return { ...points.at(-1) };
}

function createCentipedeBody() {
    return new Body({
        sprite: "alexsmobs/cave_centipede.png",
        renderScale: 8,
        parts: {
            body: new BodyPart({
                spriteCrop: { x: 0, y: 62, width: 14, height: 7 },
                offset: { x: 0, y: 36 },
                flip: true,
                zIndex: 1,
            }),
        },
    });
}

function createInitialTrail(center, direction, segmentCount) {
    const interval = BLOCK_SIZE * 0.1;
    const count = Math.ceil(segmentCount * 0.84 / 0.1) + 4;
    return Array.from({ length: count }, (_, index) => ({
        x: center.x - direction * interval * index,
        y: center.y,
    }));
}

function normalizeTrail(trail) {
    if (!Array.isArray(trail)) return null;
    const points = trail
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .slice(0, 80)
        .map(({ x, y }) => ({ x, y }));
    return points.length ? points : null;
}

function clampSegmentCount(count) {
    return Math.max(5, Math.min(MAX_SEGMENTS, Math.floor(Number(count) || 5)));
}

function entityCenter(entity) {
    return new Vector2(
        entity.position.x + entity.hitbox.x / 2,
        entity.position.y + entity.hitbox.y / 2,
    );
}
