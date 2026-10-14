import tooloud from "./tooloud.js";
import { Blocks } from "./blocks.js";
import { seedHash } from "./seed.js";

// All coordinates are world blocks. The seeded noise has no chunk-local state,
// so a chamber and its passages have the same shape on either side of a seam.
const perlin = tooloud.Perlin.noise;
const CELL_WIDTH = 160;
const ALEX_CAVE_REGION_SPACING = 1200;
const ALEX_CAVE_REGION_RADIUS = 300;
const ALEX_CAVE_CENTER_JITTER = 45;

export const ALEX_CAVE_BIOMES = Object.freeze([
    "magnetic_caves",
    "primordial_caves",
    "toxic_caves",
    "abyssal_chasm",
    "forlorn_hollows",
    "candy_cavity",
]);

const ALEX_CAVE_MIN_SPAWN_DISTANCE = Object.freeze({
    magnetic_caves: 400,
    primordial_caves: 450,
    toxic_caves: 650,
    abyssal_chasm: 400,
    forlorn_hollows: 650,
    candy_cavity: 500,
});

const ALEX_CAVE_CLIMATE = Object.freeze({
    magnetic_caves: { continentalness: [0.6, 1], depth: [0.2, 1] },
    primordial_caves: { continentalness: [0.4, 1], depth: [0.15, 1.5] },
    toxic_caves: { continentalness: [0.5, 1], depth: [0.3, 1.5] },
    abyssal_chasm: {
        continentalness: [-0.95, -0.65],
        temperature: [-1, 0.5],
        depth: [0.2, 1.5],
    },
    forlorn_hollows: { continentalness: [0.6, 1], depth: [0.3, 1.5] },
    candy_cavity: { continentalness: [0.5, 1], depth: [0.15, 1.5] },
});

export function alexCaveRegionAt(worldX, seed = 0, spawnX = 0) {
    const nearestCell = Math.floor(
        (worldX - ALEX_CAVE_REGION_SPACING / 2) / ALEX_CAVE_REGION_SPACING,
    );

    for (let cellIndex = nearestCell - 1; cellIndex <= nearestCell + 1; cellIndex++) {
        const centerHash = seedHash(seed, `alex:cave:center:${cellIndex}`) / 0x100000000;
        const centerX = cellIndex * ALEX_CAVE_REGION_SPACING +
            ALEX_CAVE_REGION_SPACING / 2 +
            (centerHash * 2 - 1) * ALEX_CAVE_CENTER_JITTER;
        if (Math.abs(worldX - centerX) > ALEX_CAVE_REGION_RADIUS) continue;

        const biome = ALEX_CAVE_BIOMES[
            seedHash(seed, `alex:cave:type:${cellIndex}`) % ALEX_CAVE_BIOMES.length
        ];
        const minSpawnDistance = ALEX_CAVE_MIN_SPAWN_DISTANCE[biome];
        if (Math.abs(centerX - spawnX) < minSpawnDistance) continue;

        return {
            cellIndex,
            biome,
            centerX,
            radius: ALEX_CAVE_REGION_RADIUS,
            minSpawnDistance,
        };
    }

    return null;
}

export function alexCaveBiomeIsSuitable(biome, climate) {
    const limits = ALEX_CAVE_CLIMATE[biome];
    if (!limits || !climate) return false;
    return Object.entries(limits).every(([field, [min, max]]) =>
        Number.isFinite(climate[field]) && climate[field] >= min && climate[field] <= max,
    );
}

export function alexCaveBiomeWallAt(worldX, y, cavern) {
    if (!cavern || y <= 1) return false;
    const dx = (worldX - cavern.centerX) / cavern.radiusX;
    const dy = (y - cavern.centerY) / cavern.radiusY;
    const distance = dx * dx + dy * dy;
    return distance >= 0.72 && distance <= 1.28;
}

export function alexCaveAccentBlock(biome, seed, worldX, y) {
    const patchX = Math.floor(worldX / 3);
    const patchY = Math.floor(y / 2);
    const roll = seedHash(seed, `alex:cave:wall:${biome}:${patchX}:${patchY}`) % 100;

    switch (biome) {
        case "magnetic_caves":
            if (roll < 12) return Blocks.IronOre;
            if (roll < 17) return Blocks.GoldOre;
            break;
        case "primordial_caves":
            if (roll < 18) return Blocks.MossyCobblestone;
            if (roll < 30) return Blocks.MossyStoneBricks;
            if (roll < 33) return Blocks.GoldOre;
            break;
        case "toxic_caves":
            if (roll < 10) return Blocks.LimeWool;
            if (roll < 14) return Blocks.GreenWool;
            if (roll < 17) return Blocks.RedstoneOre;
            break;
        case "abyssal_chasm":
            if (roll < 12) return Blocks.Sand;
            if (roll < 17) return Blocks.BlueWool;
            break;
        case "forlorn_hollows":
            if (roll < 14) return Blocks.Sculk;
            if (roll < 24) return Blocks.MossyStoneBricks;
            break;
        case "candy_cavity":
            if (roll < 13) return Blocks.PinkWool;
            if (roll < 23) return Blocks.MagentaWool;
            if (roll < 33) return Blocks.YellowWool;
            if (roll < 39) return Blocks.WhiteWool;
            break;
        default:
            break;
    }
    return null;
}

function cavernForCell(index, seed, spawnX) {
    const centerX = index * CELL_WIDTH + CELL_WIDTH / 2 +
        perlin(index * 0.83 + 0.17, 17.37, 411.41) * 90;
    const centerY = 24 + perlin(index * 0.71 + 0.21, 29.31, 617.37) * 20;
    const character = perlin(index * 0.77 + 0.41, 67.47, 1237.29);
    const styleNoise = perlin(index * 0.61 + 0.29, 89.23, 1657.19);
    // Project Minecraft's cheese, spaghetti, and noodle caves onto the 2D world.
    const style = index % 3 === 0 || styleNoise > 0.32
        ? "cheese"
        : styleNoise < -0.32
            ? "noodle"
            : "spaghetti";
    const radiusX = style === "cheese"
        ? Math.max(48, 58 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 26)
        : style === "spaghetti"
            ? Math.max(34, 43 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 19)
            : Math.max(22, 28 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 12);
    const radiusY = style === "cheese"
        ? Math.max(18, 24 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 10)
        : style === "spaghetti"
            ? Math.max(12, 17 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 8)
            : Math.max(8, 11 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 5);
    // Regular water lakes remain available while some deeper chambers get lava.
    const lava = index % 4 !== 0 && centerY - radiusY < 18 &&
        (index % 5 === 2 || character > 0.06) &&
        perlin(index * 0.89 + 0.33, 79.11, 1531.73) > -0.15;
    const lake = index % 4 === 0 || character > 0.06 || lava;
    return {
        cellIndex: index,
        style,
        centerX, centerY, radiusX, radiusY,
        waterLevel: Math.floor(centerY - radiusY * (lava ? 0.68 : 0.42)),
        lake,
        fluid: lava ? "lava" : "water",
        entrance: index % 3 === 0 || perlin(index * 0.69 + 0.23, 73.31, 1429.17) > 0.38,
        active: index % 3 === 0 || character > -0.25,
        alexRegion: alexCaveRegionAt(centerX, seed, spawnX),
    };
}

export function caveColumnAt(worldX, seed = 0, spawnX = 0) {
    const cell = Math.floor(worldX / CELL_WIDTH);
    const rooms = Array.from({ length: 7 }, (_, offset) =>
        cavernForCell(cell + offset - 3, seed, spawnX))
        .filter(cavern => cavern.active)
        .sort((a, b) => a.centerX - b.centerX);
    const caverns = rooms.filter(cavern =>
        Math.abs(worldX - cavern.centerX) < cavern.radiusX + 9);
    const left = rooms.filter(room => room.centerX <= worldX).at(-1);
    const right = rooms.find(room => room.centerX > worldX);
    let passage = null;
    if (left && right) {
        const t = (worldX - left.centerX) / (right.centerX - left.centerX);
        passage = {
            y: left.centerY + (right.centerY - left.centerY) * t +
                perlin(worldX * 0.021 + 0.13, 13.37, 3301.41) * 10 +
                perlin(worldX * 0.049 + 0.27, 21.19, 3491.31) * 3,
            radius: perlin(worldX * 0.014 + 0.23, 33.71, 3677.29) > 0.18
                ? 3.8 + Math.max(0, perlin(worldX * 0.033 + 0.27, 21.19, 3491.31)) * 1.8
                : 1.8 + Math.max(0, perlin(worldX * 0.033 + 0.27, 21.19, 3491.31)) * 1.2,
        };
    }
    return { caverns, passage };
}

export function caveCellAt(worldX, y, surface, column = caveColumnAt(worldX)) {
    if (y <= 1 || y > surface) return "solid";

    for (const cavern of column.caverns) {
        const dx = (worldX - cavern.centerX) / cavern.radiusX;
        const dy = (y - cavern.centerY) / cavern.radiusY;
        // Broad chambers with an uneven roof, shelves, and a sloped floor.
        const edge = perlin(worldX * 0.075, y * 0.095, 1613) * 0.15 +
            perlin(worldX * 0.029, y * 0.065, 1801) * 0.11 +
            perlin(worldX * 0.13, y * 0.17, 1861) * 0.045;
        const warpX = perlin(worldX * 0.035, y * 0.055, 1901) * 0.1;
        const warpY = perlin(worldX * 0.025, y * 0.04, 1931) * 0.12;
        if (y <= surface - 8 && (dx + warpX) ** 2 + (dy + warpY) ** 2 < 1 + edge) {
            const fillsWithWater = cavern.alexBiome === "abyssal_chasm" ||
                (cavern.lake && cavern.fluid === "water");
            if (fillsWithWater && y <= cavern.waterLevel) return "water";
            if (cavern.lake && cavern.fluid === "lava" && y <= cavern.waterLevel) {
                return "lava";
            }
            return "air";
        }

        // Only some large caverns have a narrow, winding surface fissure.
        if (cavern.entrance && y >= cavern.centerY && y <= surface) {
            const entranceProgress = Math.max(0, Math.min(1,
                (y - cavern.centerY) / Math.max(1, surface - cavern.centerY)));
            const mouthWidth = 1.2 + entranceProgress * 0.5 +
                Math.max(0, perlin(y * 0.065, cavern.centerX * 0.015, 1997)) * 0.4;
            const bend = perlin(y * 0.065, cavern.centerX * 0.015, 1997) * 8;
            if (Math.abs(worldX - cavern.centerX - bend) < mouthWidth) return "air";
        }
    }

    if (y > surface - 8 || y < 4) return "solid";
    if (column.passage && Math.abs(y - column.passage.y) < column.passage.radius) {
        return "air";
    }

    // Two differently scaled ridge fields make winding passages. Their
    // intersections join chambers without placing tunnels per chunk.
    const warpX = worldX + perlin(worldX * 0.018, y * 0.02, 2203) * 9;
    const warpY = y + perlin(worldX * 0.021, y * 0.017, 2411) * 7;
    const winding = Math.abs(perlin(warpX * 0.044, warpY * 0.059, 2617));
    const branch = Math.abs(perlin(warpX * 0.027, warpY * 0.044, 2819));
    const noodle = Math.abs(perlin(warpX * 0.071, warpY * 0.082, 3269));
    const depth = Math.max(0, Math.min(1, (surface - y) / Math.max(1, surface - 4)));
    const width = 0.014 + Math.max(0, perlin(worldX * 0.014, y * 0.018, 3023)) * 0.02;
    const branchWidth = 0.008 + Math.max(0,
        perlin(worldX * 0.031, y * 0.039, 3167)) * 0.012;
    const noodleWidth = 0.006 + depth * 0.008;
    return winding < width || branch < branchWidth || noodle < noodleWidth
        ? "air"
        : "solid";
}
