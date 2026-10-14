import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import { SimpleSprite, Transform, Vector2 } from "../utils/classes.js";
import { ctx } from "../utils/drawHelpers.js";
import { runtime } from "../utils/runtime.js";
import { getBlock } from "./block.js";
import {
    advanceFallingLeafMotion,
    getFallingLeafProfile,
    getFallingLeafSpawnChance,
    normalizeFallingLeavesSettings,
    shouldSpawnFallingLeaf,
} from "./fallingLeafPhysics.js";

const SPAWN_RADIUS = BLOCK_SIZE * 28;
const SPAWN_CHECKS_PER_SECOND = 12;
const LEAF_CACHE_REFRESH_SECONDS = 0.2;
const PARTICLE_FADE_SECONDS = 0.8;
const randomBetween = (random, min, max) => min + random() * (max - min);

export class FallingLeafParticle {
    constructor({ x, y, blockType, profile, settings, dimension, random = Math.random }) {
        this.blockType = blockType;
        this.dimension = dimension;
        this.profile = profile;
        this.size = BLOCK_SIZE * (settings.leafSize / 50) * (profile.kind === "cherry" ? 0.5 : 1);
        this.size *= randomBetween(random, 0.7, 1.4);
        this.x = x;
        this.y = y;
        this.vx = randomBetween(random, -5, 5);
        this.vy = randomBetween(random, -2, 4);
        this.gravity = profile.gravity * randomBetween(random, 0.85, 1.15);
        this.windCoefficient = profile.wind * randomBetween(random, 0.8, 1.2);
        this.rotation = random() * Math.PI * 2;
        this.rotationSpeed = (random() < 0.5 ? -1 : 1) *
            randomBetween(random, 0.1, profile.spin) * Math.PI * 2;
        this.age = 0;
        this.lifespan = settings.leafLifespan / 20;
        this.alpha = 1;
        this.grounded = false;
        this.inWater = false;
        this.waterSurface = null;
        this.dead = false;
        const texturePath = profile.sprite.startsWith("blocks/")
            ? profile.sprite
            : `blocks/${profile.sprite}`;
        this.sprite = new SimpleSprite({
            sprite: texturePath,
            transform: new Transform(new Vector2(), new Vector2(this.size, this.size)),
        });
    }

    update(world, deltaSeconds, windX) {
        const dt = Math.max(0, Number(deltaSeconds) || 0);
        this.age += dt;
        if (this.age >= this.lifespan) return false;

        if (this.inWater && Number.isFinite(this.waterSurface)) {
            const targetY = this.waterSurface - this.size / 2;
            this.vy += (targetY - this.y) * 1.4 * dt;
            this.vy *= Math.pow(0.2, dt);
            this.vx *= Math.pow(0.55, dt);
        }

        const next = advanceFallingLeafMotion(this, dt, windX);
        this.vx = next.vx;
        this.vy = next.vy;

        if (!this.resolveMovement(world, next)) return false;

        if (!this.grounded) this.rotation += this.rotationSpeed * dt;
        this.alpha = Math.min(1, Math.max(0, (this.lifespan - this.age) / PARTICLE_FADE_SECONDS));
        return this.alpha > 0;
    }

    resolveMovement(world, next) {
        if (this.inWater && Number.isFinite(this.waterSurface)) {
            const waterBelow = world.getBlockAtWorldPosition(
                this.x,
                this.waterSurface + 1,
                false,
                this.dimension,
            );
            if (!waterBelow || !getBlock(waterBelow.blockType).fluid) {
                this.inWater = false;
                this.waterSurface = null;
            }
        }

        if (this.grounded) {
            const below = world.getBlockAtWorldPosition(
                this.x,
                this.y + this.size / 2 + 1,
                false,
                this.dimension,
            );
            const definition = below && getBlock(below.blockType);
            if (!definition?.collision || definition.fluid) this.grounded = false;
            else return true;
        }

        const side = next.x >= this.x ? 1 : -1;
        const sideBlock = world.getBlockAtWorldPosition(
            next.x + side * this.size / 2,
            this.y,
            false,
            this.dimension,
        );
        if (sideBlock && getBlock(sideBlock.blockType).fluid) {
            this.x = next.x;
            if (this.handleFluid(world, sideBlock)) return !this.dead;
        }
        const sideDefinition = sideBlock && getBlock(sideBlock.blockType);
        if (sideDefinition?.collision && !sideDefinition.fluid) this.vx = 0;
        else this.x = next.x;

        const movingDown = next.y >= this.y;
        const verticalProbe = movingDown
            ? next.y + this.size / 2
            : next.y - this.size / 2;
        const verticalBlock = world.getBlockAtWorldPosition(
            this.x,
            verticalProbe,
            false,
            this.dimension,
        );
        if (verticalBlock && this.handleFluid(world, verticalBlock)) return !this.dead;

        const verticalDefinition = verticalBlock && getBlock(verticalBlock.blockType);
        if (!verticalDefinition?.collision || verticalDefinition.fluid) {
            this.y = next.y;
            return true;
        }

        if (movingDown) {
            this.y = verticalBlock.transform.position.y - this.size / 2;
            this.grounded = true;
            this.vx = 0;
            this.vy = 0;
        } else {
            this.y = verticalBlock.transform.position.y + BLOCK_SIZE + this.size / 2;
            this.vy = 0;
        }
        return true;
    }

    handleFluid(world, block) {
        const definition = getBlock(block.blockType);
        if (!definition.fluid) return false;
        if (block.blockType === Blocks.Lava) {
            this.dead = true;
            return true;
        }

        const cutoff = Number.isFinite(block.cutoff) ? block.cutoff : 0;
        this.inWater = true;
        this.waterSurface = block.transform.position.y + cutoff * BLOCK_SIZE;
        this.y = Math.min(this.y, this.waterSurface - this.size / 2);
        this.vy = Math.min(0, this.vy);
        return true;
    }

    draw(camera) {
        if (!ctx || !this.sprite.img || this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.imageSmoothingEnabled = false;
        ctx.translate(this.x - camera.x, this.y - camera.y);
        ctx.rotate(this.rotation);
        ctx.drawImage(this.sprite.img, -this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

export class FallingLeavesEmitter {
    constructor(world, { settings = {}, random = Math.random } = {}) {
        this.world = world;
        this.settings = normalizeFallingLeavesSettings(settings);
        this.random = random;
        this.particles = [];
        this.leavesByChunk = new Map();
        this.scanCursor = 0;
        this.scanElapsed = 0;
        this.spawnAccumulator = 0;
    }

    setSettings(settings) {
        this.settings = normalizeFallingLeavesSettings({ ...this.settings, ...settings });
        if (!this.settings.enabled) this.particles.length = 0;
    }

    update() {
        const dt = Math.max(0, Number(runtime.deltaTime) || 0);
        const player = this.world.player;
        if (!this.settings.enabled) {
            this.particles.length = 0;
            this.leavesByChunk.clear();
            return;
        }
        this.refreshLeafCache(dt, player);
        this.updateParticles(dt, player);

        if (!this.settings.enabled || !player) return;
        const candidates = this.getNearbyLeaves(player);
        if (candidates.length === 0) {
            this.spawnAccumulator = 0;
            return;
        }
        if (this.particles.length >= this.settings.maxParticles) {
            this.spawnAccumulator = 0;
            return;
        }

        this.spawnAccumulator = Math.min(
            SPAWN_CHECKS_PER_SECOND,
            this.spawnAccumulator + dt * SPAWN_CHECKS_PER_SECOND,
        );
        while (this.spawnAccumulator >= 1 && this.particles.length < this.settings.maxParticles) {
            this.spawnAccumulator -= 1;
            const leaf = candidates[Math.floor(this.random() * candidates.length)];
            const definition = getBlock(leaf.blockType);
            if (!shouldSpawnFallingLeaf(
                leaf.blockType,
                this.random(),
                this.settings,
                definition,
            )) continue;
            this.spawnLeaf(leaf, false);
        }
    }

    refreshLeafCache(dt, player) {
        if (!player) {
            this.leavesByChunk.clear();
            this.scanCursor = 0;
            return;
        }

        const chunks = [...this.world.chunks_in_render_distance.values()]
            .filter(chunk => chunk.dimension === player.dimension);
        const activeKeys = new Set(chunks.map(chunk => `${chunk.dimension}:${chunk.x}`));
        for (const key of this.leavesByChunk.keys()) {
            if (!activeKeys.has(key)) this.leavesByChunk.delete(key);
        }

        if (chunks.length === 0) return;
        this.scanElapsed += dt;
        if (this.scanElapsed < LEAF_CACHE_REFRESH_SECONDS) return;
        this.scanElapsed = 0;

        const chunk = chunks[this.scanCursor % chunks.length];
        this.scanCursor = (this.scanCursor + 1) % chunks.length;
        const leaves = [];
        for (const row of chunk.blocks) {
            for (const block of row) {
                if (!block) continue;
                const profile = getFallingLeafProfile(block.blockType, getBlock(block.blockType));
                if (!profile) continue;
                leaves.push({
                    x: block.transform.position.x + BLOCK_SIZE / 2,
                    y: block.transform.position.y + BLOCK_SIZE / 2,
                    blockType: block.blockType,
                    dimension: chunk.dimension,
                });
            }
        }
        this.leavesByChunk.set(`${chunk.dimension}:${chunk.x}`, leaves);
    }

    getNearbyLeaves(player) {
        const playerX = player.position.x + player.hitbox.x / 2;
        const playerY = player.position.y + player.hitbox.y / 2;
        const radiusSquared = SPAWN_RADIUS * SPAWN_RADIUS;
        const leaves = [];
        for (const chunkLeaves of this.leavesByChunk.values()) {
            for (const leaf of chunkLeaves) {
                const dx = leaf.x - playerX;
                const dy = leaf.y - playerY;
                if (dx * dx + dy * dy <= radiusSquared) leaves.push(leaf);
            }
        }
        return leaves;
    }

    spawnLeaf(leaf, breaking = false) {
        if (!this.settings.enabled || this.particles.length >= this.settings.maxParticles) return false;
        const definition = getBlock(leaf.blockType);
        const profile = getFallingLeafProfile(leaf.blockType, definition);
        if (!profile) return false;

        const size = BLOCK_SIZE * (this.settings.leafSize / 50);
        const x = leaf.x + (breaking ? 0 : randomBetween(this.random, -size, size));
        const y = leaf.y + (breaking ? 0 : randomBetween(this.random, -size, size));
        this.particles.push(new FallingLeafParticle({
            x,
            y,
            blockType: leaf.blockType,
            profile,
            settings: this.settings,
            dimension: leaf.dimension,
            random: this.random,
        }));
        return true;
    }

    spawnFromBlock(block) {
        if (!this.settings.enabled || !this.settings.leavesOnBlockHit || block.wall) return;
        const profile = getFallingLeafProfile(block.blockType, getBlock(block.blockType));
        if (!profile) return;

        const center = {
            x: block.transform.position.x + BLOCK_SIZE / 2,
            y: block.transform.position.y + BLOCK_SIZE / 2,
            blockType: block.blockType,
            dimension: block.dimensionIndex,
        };
        const count = 5 + Math.floor(this.random() * 4);
        for (let i = 0; i < count; i++) this.spawnLeaf(center, true);
    }

    updateParticles(dt, player) {
        const wind = this.settings.windEnabled && player?.dimension === 0
            ? this.getWindX(runtime.passedTime || 0)
            : 0;
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const particle = this.particles[index];
            const distance = player && particle.dimension === player.dimension
                ? Math.hypot(particle.x - player.position.x, particle.y - player.position.y)
                : 0;
            if (distance > SPAWN_RADIUS * 1.5 || !particle.update(this.world, dt, wind)) {
                this.particles.splice(index, 1);
            }
        }
    }

    getWindX(time) {
        let seed = 2166136261;
        for (const character of String(this.world.seed ?? 0)) {
            seed ^= character.charCodeAt(0);
            seed = Math.imul(seed, 16777619);
        }
        const phase = ((seed >>> 0) % 997) / 997 * Math.PI * 2;
        return Math.sin(time * 0.37 + phase) * 12 + Math.sin(time * 0.13 + phase * 1.7) * 5;
    }

    draw(camera) {
        const dimension = this.world.player?.dimension;
        for (const particle of this.particles) {
            if (particle.dimension === dimension) particle.draw(camera);
        }
    }
}
