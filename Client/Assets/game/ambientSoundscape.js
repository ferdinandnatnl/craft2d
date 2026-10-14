import { seaLevelForVersion } from "@2dcraft.com/shared/overworldGeneration.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { seedHash } from "@2dcraft.com/shared/seed.js";
import { BLOCK_SIZE, TERRAIN_HEIGHT } from "../utils/globals.js";
import { runtime } from "../utils/runtime.js";
import { getDimension } from "../world/dimension.js";
import { playAmbientSound, removeAudio } from "./sounds.js";
import { getAmbientLayers } from "./ambientProfiles.js";
import { getWeatherConditions } from "../world/weatherConditions.js";

function isWaterBlock(world, x, y, dimension) {
    const block = world.getBlockAtWorldPosition(x, y, false, dimension);
    return block?.blockType === Blocks.Water;
}

export function getAmbientContext(world) {
    const player = world?.player;
    if (!player?.position || !world.generator) return null;

    const dimensionIndex = player.dimension;
    const centerX = player.position.x + player.hitbox.x / 2;
    const headY = player.position.y + BLOCK_SIZE * 0.18;
    const feetY = player.position.y + player.hitbox.y - 1;
    const blockX = centerX / BLOCK_SIZE;
    const feetBlockY = Math.floor(feetY / BLOCK_SIZE);
    const surfaceBlockY = world.generator.getTerrainHeight(blockX, dimensionIndex);
    const usesUserY = typeof world.worldToUserBlockY === "function";
    const feetUserY = usesUserY ? world.worldToUserBlockY(feetY) : null;
    const depth = usesUserY ? surfaceBlockY - feetUserY : feetBlockY - surfaceBlockY;
    const chunk = world.getChunkForX(centerX, dimensionIndex);
    const biome = chunk?.biome || world.generator.calculateChunkBiome(
        Math.floor(centerX / (BLOCK_SIZE * 16)),
        dimensionIndex,
    );
    const headBlock = world.getBlockAtWorldPosition(
        centerX,
        headY,
        false,
        dimensionIndex,
    );
    const underwater = headBlock?.blockType === Blocks.Water;
    const waterSurfaceY = (world.generator.worldgenVersion == null
        ? 60 : seaLevelForVersion(world.generator.worldgenVersion)) +
        (biome?.waterLevel ?? 10) - 10;
    const waterDepth = Math.max(0, usesUserY
        ? waterSurfaceY - feetUserY : feetBlockY - waterSurfaceY);
    const nearWater = isWaterBlock(world, centerX, feetY, dimensionIndex) ||
        isWaterBlock(world, centerX, feetY + BLOCK_SIZE, dimensionIndex);
    const dimensionName = getDimension(dimensionIndex)?.name || "Overworld";
    const underground = !underwater && depth >= 3 && headBlock?.sunLight !== true;
    const weather = getWeatherConditions(world, player, biome);

    return {
        dimension: dimensionName,
        biome,
        night: runtime.time > 3.5 && runtime.time < 6.5,
        underwater,
        deepWater: underwater && waterDepth >= 7,
        underground,
        deepCave: underground && depth >= 20,
        nearWater,
        inAir: usesUserY ? feetUserY > surfaceBlockY + 4
            : feetBlockY < surfaceBlockY - 4,
        openSky: headBlock?.sunLight === true,
        rainSound: seedHash(world.seed ?? 0, "ambient-sounds:rain") % 2
            ? "rain2"
            : "rain1",
        ...weather,
    };
}

export class AmbientSoundscape {
    constructor(world) {
        this.world = world;
        this.layers = new Map();
        this.userActivated = false;
        this.activationHandler = () => {
            this.userActivated = true;
            document.removeEventListener("pointerdown", this.activationHandler, true);
            document.removeEventListener("keydown", this.activationHandler, true);
            this.update(0);
        };
        document.addEventListener("pointerdown", this.activationHandler, {
            capture: true,
            once: true,
        });
        document.addEventListener("keydown", this.activationHandler, {
            capture: true,
            once: true,
        });
    }

    update(deltaTime = 1 / 20) {
        if (!this.userActivated) return;

        const sfxVolume = Math.max(0, Math.min(1,
            (runtime.game?.settings?.sfxVolume ?? 100) / 100));
        const desired = sfxVolume > 0
            ? getAmbientLayers(getAmbientContext(this.world))
            : [];
        const desiredIds = new Set();

        for (const profile of desired) {
            desiredIds.add(profile.id);
            let active = this.layers.get(profile.id);
            if (!active) {
                const audio = playAmbientSound(profile.sound, 0);
                if (!audio) continue;
                active = { audio, volume: 0, targetVolume: profile.volume };
                this.layers.set(profile.id, active);
            }
            active.targetVolume = profile.volume;
        }

        const elapsed = Math.max(0, Math.min(0.25,
            Number.isFinite(deltaTime) ? deltaTime : 0));
        const blend = 1 - Math.exp(-elapsed / 0.8);
        for (const [id, active] of this.layers) {
            if (!desiredIds.has(id)) active.targetVolume = 0;
            active.volume += (active.targetVolume - active.volume) * blend;
            active.audio.volume = Math.max(0, Math.min(1,
                active.volume * sfxVolume));

            if (active.targetVolume === 0 && active.volume < 0.003) {
                removeAudio(active.audio);
                this.layers.delete(id);
            }
        }
    }

    dispose() {
        document.removeEventListener("pointerdown", this.activationHandler, true);
        document.removeEventListener("keydown", this.activationHandler, true);
        for (const { audio } of this.layers.values()) removeAudio(audio);
        this.layers.clear();
    }
}
