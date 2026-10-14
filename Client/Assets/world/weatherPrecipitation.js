import { createSeededRandom, seedHash } from "@2dcraft.com/shared/seed.js";
import { ctx } from "../utils/drawHelpers.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import { runtime } from "../utils/runtime.js";
import { getBlock } from "./block.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";
import {
    getPrecipitationKind,
    getWeatherConditions,
} from "./weatherConditions.js";

const MAX_PARTICLES = 220;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class WeatherPrecipitationEmitter {
    constructor(world) {
        this.world = world;
        this.seed = String(world.seed ?? 0);
        this.random = createSeededRandom(this.seed, "weather:precipitation");
        this.particles = [];
    }

    setSeed(seed) {
        const nextSeed = String(seed ?? 0);
        if (nextSeed === this.seed) return;
        this.seed = nextSeed;
        this.random = createSeededRandom(this.seed, "weather:precipitation");
        this.clear();
    }

    clear() {
        this.particles.length = 0;
    }

    update() {
        const player = this.world.player;
        if (!player || player.dimension !== Dimensions.Overworld) {
            this.clear();
            return;
        }

        const centerX = player.position.x + player.hitbox.x / 2;
        const biome = player
            ? this.world.getChunkForX(
                centerX,
                player.dimension,
            )?.biome
            : null;
        const headBlock = this.world.getBlockAtWorldPosition(
            centerX,
            player.position.y + BLOCK_SIZE * 0.18,
            false,
            player.dimension,
        );
        const conditions = getWeatherConditions(this.world, player, biome);
        const kind = getPrecipitationKind(
            conditions,
            player.dimension,
            headBlock?.sunLight === true,
        );
        const deltaTime = clamp(Number(runtime.deltaTime) || 0, 0, 0.1);
        const camera = runtime.camera;
        const width = ctx?.canvas?.width || 0;
        const height = ctx?.canvas?.height || 0;

        if (kind && camera && width > 0 && height > 0) {
            const density = kind === "snow" ? 90 : 150;
            const targetCount = Math.min(
                MAX_PARTICLES,
                Math.ceil(density * conditions.rainLevel),
            );
            while (this.particles.length < targetCount) {
                this.spawn(kind, conditions.rainLevel, camera, width, height);
            }
        }

        const windX = this.windX(conditions);
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const particle = this.particles[index];
            particle.age += deltaTime;
            particle.x += (particle.vx + windX * particle.windFactor) * deltaTime;
            particle.y += particle.vy * deltaTime;

            const block = this.world.getBlockAtWorldPosition(
                particle.x,
                particle.y,
                false,
                Dimensions.Overworld,
            );
            const definition = block && getBlock(block.blockType);
            const hitSolid = definition && !definition.air &&
                !definition.transparent && !definition.fluid;
            if (hitSolid || particle.age >= particle.lifetime ||
                (camera && particle.y > camera.y + height + 32)) {
                this.particles.splice(index, 1);
            }
        }
    }

    spawn(kind, intensity, camera, width, height) {
        const snow = kind === "snow";
        const rainSpeed = 650 + this.random() * 400;
        this.particles.push({
            kind,
            x: camera.x + this.random() * width,
            y: camera.y - this.random() * Math.min(160, height * 0.15),
            vx: snow ? (this.random() - 0.5) * 24 : (this.random() - 0.5) * 36,
            vy: snow ? 55 + this.random() * 100 : rainSpeed,
            windFactor: snow ? 1.5 : 0.65,
            size: snow ? 1.5 + this.random() * 2.5 : 1,
            length: 12 + this.random() * 15,
            alpha: clamp(0.25 + intensity * 0.5, 0, 0.75),
            age: 0,
            lifetime: snow ? 8 : 2.2,
        });
    }

    windX(conditions) {
        const phase = seedHash(this.seed, "weather:wind") / 4294967296 * Math.PI * 2;
        const time = Number(runtime.passedTime) || 0;
        const strength = 14 + conditions.rainLevel * 24 + conditions.thunderLevel * 30;
        return Math.sin(time * 0.37 + phase) * strength +
            Math.sin(time * 0.13 + phase * 1.7) * strength * 0.35;
    }

    draw(camera) {
        if (!ctx || !camera || this.particles.length === 0) return;
        ctx.save();
        ctx.lineWidth = 1;
        for (const particle of this.particles) {
            ctx.globalAlpha = particle.alpha;
            const x = particle.x - camera.x;
            const y = particle.y - camera.y;
            if (particle.kind === "snow") {
                ctx.fillStyle = "#f4f8ff";
                ctx.fillRect(x, y, particle.size, particle.size);
            } else {
                ctx.strokeStyle = "rgba(188, 211, 235, 0.8)";
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - particle.vx * 0.015, y + particle.length);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}
