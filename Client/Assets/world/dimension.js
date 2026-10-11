import { runtime } from "../utils/runtime.js";
import { entityRegistry } from "../entities/entityRegistry.js";
import { ORE_THRESHOLDS, multiplayer } from "../utils/globals.js";
import { Noise } from "@2dcraft.com/shared/noise.js";
import { EndBiomes, NetherBiomes, OverworldBiomes } from "@2dcraft.com/shared/biome.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { END_SHRINE_X, endEntryWorldY, endExitPortalWorldY } from "@2dcraft.com/shared/endProgression.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT } from "../utils/globals.js";
import {
    Dimensions,
    activeDimension,
    dimensions,
    getDimension,
    getDimensionChunks,
    setActiveDimension,
    setDimensions,
} from "./dimensionState.js";

export {
    Dimensions,
    activeDimension,
    dimensions,
    getDimension,
    getDimensionChunks,
};

export class Dimension {
    constructor({
        name,
        biomeSet,
        backgroundGradient = {
            dayColor: "#74B3FF", // Daytime top color (light blue)
            nightColor: "#000000", // Nighttime top color (dark blue)
            sunsetColor: "#D47147", // Sunset bottom color
            midnightColor: "#001848", // Midnight bottom color
        },
        noiseMaps = {
            grass: new Noise(550, 0.2, 1),
            structure: new Noise(500, 1, 10),
            temperature: new Noise(60, 1, 0.5),
            wetness: new Noise(60, 1, 0.5),
            tree: new Noise(50, 10, 5),
            cave: new Noise(55, 10, 5),
            mountains: new Noise(20, 1, 0.5),
            continentalness: new Noise(6, 18, 0),
            erosion: new Noise(12, 12, 0),
            peaks: new Noise(22, 20, 0),
            heightDetail: new Noise(55, 6, 0),
            ores: {},
        },

        baseLightLevel = null,
        alwaysDay = false,

        bedrockRoof = false,
        fastLava = false,
        noWater = false,
    }) {
        this.name = name;

        this.chunks = new Map();
        this.pendingBlocks = new Map();

        this.biomeSet = biomeSet;

        this.backgroundGradient = backgroundGradient;

        this.noiseMaps = noiseMaps;

        this.alwaysDay = alwaysDay;

        this.baseLightLevel = baseLightLevel;
        this.bedrockRoof = bedrockRoof;

        this.fastLava = fastLava;
        this.noWater = noWater;
    }
}

setDimensions([
    new Dimension({
        name: "Overworld",
        biomeSet: OverworldBiomes,
        noiseMaps: {
            grass: new Noise(550, 0.2, 1),
            structure: new Noise(500, 1, 10),
            temperature: new Noise(60, 1, 0.5),
            wetness: new Noise(60, 1, 0.5),
            tree: new Noise(50, 10, 5),
            cave: new Noise(55, 10, 5),
            mountains: new Noise(20, 1, 0.5),
            continentalness: new Noise(6, 18, 0),
            erosion: new Noise(12, 12, 0),
            peaks: new Noise(22, 20, 0),
            heightDetail: new Noise(55, 6, 0),
            ores: {
                coal: {
                    block: Blocks.CoalOre,
                    noise: new Noise(100, 5.3, 5),
                    threshold: ORE_THRESHOLDS.coal,
                },
                iron: {
                    block: Blocks.IronOre,
                    noise: new Noise(100, 5, 5),
                    threshold: ORE_THRESHOLDS.iron,
                },
                diamond: {
                    block: Blocks.DiamondOre,
                    noise: new Noise(100, 6.8, 5),
                    threshold: ORE_THRESHOLDS.diamond,
                    depth: 25,
                },
                redstone: {
                    block: Blocks.RedstoneOre,
                    noise: new Noise(100, 6.5, 5),
                    threshold: ORE_THRESHOLDS.redstone,
                    depth: 30,
                },
                gold: {
                    block: Blocks.GoldOre,
                    noise: new Noise(100, 6.5, 5),
                    threshold: ORE_THRESHOLDS.gold,
                    depth: 25,
                },
                gravel: {
                    block: Blocks.Gravel,
                    noise: new Noise(100, 5.5, 5),
                    threshold: ORE_THRESHOLDS.coal,
                },
                sand: {
                    block: Blocks.Sand,
                    noise: new Noise(100, 6, 5),
                    threshold: ORE_THRESHOLDS.sand,
                },
                dirt: {
                    block: Blocks.Dirt,
                    noise: new Noise(100, 6, 5),
                    threshold: ORE_THRESHOLDS.dirt,
                },
            },
        },
    }),
    new Dimension({
        name: "Nether",
        biomeSet: NetherBiomes,
        backgroundGradient: {
            dayColor: "#521605",
            nightColor: "#000000",
            sunsetColor: "#b3441c",
            midnightColor: "#000000",
        },
        alwaysDay: true,
        noiseMaps: {
            grass: new Noise(550, 0.2, 1),
            structure: new Noise(500, 1, 10),
            temperature: new Noise(60, 1, 0.5),
            wetness: new Noise(60, 1, 0.5),
            tree: new Noise(100, 10, 5),
            mountains: new Noise(20, 1, 0.5),
            cave: new Noise(20, 80, 5),
            continentalness: new Noise(6, 18, 0),
            erosion: new Noise(12, 12, 0),
            peaks: new Noise(22, 20, 0),
            heightDetail: new Noise(55, 6, 0),
            ores: {
                quartz: {
                    block: Blocks.QuartzOre,
                    noise: new Noise(100, 7, 5),
                    threshold: ORE_THRESHOLDS.quartz,
                },
                glowstone: {
                    block: Blocks.Glowstone,
                    noise: new Noise(100, 7, 5),
                    threshold: ORE_THRESHOLDS.glowstone,
                },
                lavaPockets: {
                    block: Blocks.Lava,
                    noise: new Noise(100, 7, 5),
                    threshold: ORE_THRESHOLDS.lavaPockets,
                },
            },
        },
        baseLightLevel: 5,
        bedrockRoof: true,
        fastLava: true,
        noWater: true,
    }),
    new Dimension({
        name: "The End",
        biomeSet: EndBiomes,
        backgroundGradient: {
            dayColor: "#15101f",
            nightColor: "#08060e",
            sunsetColor: "#15101f",
            midnightColor: "#08060e",
        },
        alwaysDay: true,
        baseLightLevel: 12,
        noWater: true,
    }),
]);

export function gotoDimension(dimension) {
    if (dimension === activeDimension) return;

    if (runtime.world.player) runtime.world.player.dimension = dimension;

    if (multiplayer) {
        runtime.server.send({
            type: "playerDimension",
            message: {
                player: runtime.world.player.UUID,
                dimension: dimension,
            },
        });
    }

    runtime.world.chunks_in_render_distance = new Map();

    runtime.world.entities = runtime.world.entities.filter((entity) => {
        return entity.type === entityRegistry.EntityTypes?.Player;
    });

    setActiveDimension(dimension);
    if (dimension === Dimensions.End) ensureEnderDragon();
}

export function ensureEnderDragon() {
    if (activeDimension !== Dimensions.End || !runtime.world?.player) return;
    if (runtime.world.entities.some(entity => entity.name === "Ender Dragon" &&
        entity.dimension === Dimensions.End)) return;
    const exitY = endExitPortalWorldY();
    const center = runtime.world.getBlockAtWorldPosition(0, exitY, false, Dimensions.End);
    if (!center || center.blockType === Blocks.EndPortal) return;
    const Dragon = entityRegistry.Entities?.EnderDragon;
    if (Dragon) runtime.world.summonEntity(Dragon,
        new Vector2(12 * BLOCK_SIZE, 39 * BLOCK_SIZE));
}

export async function enterEnd() {
    const newChunks = await runtime.world.prepareEndDimension();
    if (activeDimension !== Dimensions.End) gotoDimension(Dimensions.End);
    const player = runtime.world.player;
    if (player) {
        player.position = new Vector2(-8 * BLOCK_SIZE,
            endEntryWorldY(-8));
        player.velocity = new Vector2();
        player.portalCooldown = player.maxPortalCooldown;
        player.cameThroughPortal = true;
    }
    for (const x of newChunks) {
        runtime.world.generator.postProcessChunk(
            runtime.world.getChunkForX(x, Dimensions.End));
    }
    if (multiplayer) {
        for (const x of newChunks) await runtime.world.uploadChunkToServer(x, Dimensions.End);
    }
    ensureEnderDragon();
}

export function leaveEnd() {
    if (activeDimension !== Dimensions.End) return;
    const returnX = (END_SHRINE_X - 4) * BLOCK_SIZE;
    const returnY = (CHUNK_HEIGHT -
        runtime.world.generator.getTerrainHeight(END_SHRINE_X - 4, Dimensions.Overworld) - 3) * BLOCK_SIZE;
    gotoDimension(Dimensions.Overworld);
    if (runtime.world.player) {
        runtime.world.player.position = new Vector2(returnX, returnY);
        runtime.world.player.velocity = new Vector2();
        runtime.world.player.cameThroughPortal = true;
        runtime.world.player.portalCooldown = runtime.world.player.maxPortalCooldown;
    }
}
