import tooloud from "./tooloud.js";
import { Blocks } from "./blocks.js";
import { CHUNK_HEIGHT, LEGACY_CHUNK_HEIGHT } from "./constants.js";
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

export function alexCaveRegionAt(worldX, seed = 0, spawnX = 0, version = 2) {
    const scale = version >= 4 ? 4 : 1;
    const spacing = ALEX_CAVE_REGION_SPACING * scale;
    const nearestCell = Math.floor(
        (worldX - spacing / 2) / spacing,
    );

    for (let cellIndex = nearestCell - 1; cellIndex <= nearestCell + 1; cellIndex++) {
        const centerHash = seedHash(seed, `alex:cave:center:${cellIndex}`) / 0x100000000;
        const centerX = cellIndex * spacing + spacing / 2 +
            (centerHash * 2 - 1) * ALEX_CAVE_CENTER_JITTER * scale;
        if (Math.abs(worldX - centerX) > ALEX_CAVE_REGION_RADIUS * scale) continue;

        const biome = ALEX_CAVE_BIOMES[
            seedHash(seed, `alex:cave:type:${cellIndex}`) % ALEX_CAVE_BIOMES.length
        ];
        const minSpawnDistance = ALEX_CAVE_MIN_SPAWN_DISTANCE[biome];
        if (Math.abs(centerX - spawnX) < minSpawnDistance * scale) continue;

        return {
            cellIndex,
            biome,
            centerX,
            radius: ALEX_CAVE_REGION_RADIUS * scale,
            minSpawnDistance: minSpawnDistance * scale,
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

function cavernForCell(index, seed, spawnX, version, layer = 0) {
    const wideWorld = version >= 4;
    const scaleX = wideWorld ? 4 : 1;
    const centerX = (index * CELL_WIDTH + CELL_WIDTH / 2 +
        perlin(index * 0.83 + 0.17, 17.37 + layer * 41, 411.41) * 90) * scaleX;
    const centerY = wideWorld
        ? Math.max(12, [119, 87, 56, 30][layer] +
            (seedHash(seed, `cave-height:${index}:${layer}`) / 0x100000000 - 0.5) * 52)
        : 24 + (CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT) +
            perlin(index * 0.71 + 0.21, 29.31, 617.37) * 20;
    const character = perlin(index * 0.77 + 0.41, 67.47, 1237.29);
    const styleNoise = perlin(index * 0.61 + 0.29, 89.23, 1657.19);
    // Project Minecraft's cheese, spaghetti, and noodle caves onto the 2D world.
    const style = wideWorld && layer >= 2 &&
        seedHash(seed, `giant:${index}:${layer}`) % 17 === 0
        ? "giant" : styleNoise > (wideWorld ? 0.35 : 0.28)
        ? "cheese"
        : styleNoise < -0.12
            ? "noodle"
            : "spaghetti";
    const radiusX = style === "giant" ? 150 + Math.abs(character) * 70
        : style === "cheese"
        ? Math.max(20, 27 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 12)
        : style === "spaghetti"
            ? Math.max(20, 29 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 12)
            : Math.max(16, 23 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 10);
    const radiusY = style === "giant" ? 48 + Math.abs(character) * 16
        : style === "cheese"
        ? Math.max(8, 12 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 6)
        : style === "spaghetti"
            ? Math.max(2.5, 3.5 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 2)
            : Math.max(1.5, 2 + perlin(index * 0.91 + 0.31, 53.29, 1031.43));
    const caveRadiusX = wideWorld && style !== "giant" ? radiusX * 2.6 : radiusX;
    const caveRadiusY = wideWorld && style !== "giant"
        ? radiusY * (style === "cheese" ? 2 : 1.6) : radiusY;
    // Regular water lakes remain available while some deeper chambers get lava.
    const lava = index % 4 !== 0 && centerY - caveRadiusY < (wideWorld ? 24 : 26 + CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT) &&
        (index % 5 === 2 || character > 0.06) &&
        perlin(index * 0.89 + 0.33, 79.11, 1531.73) > -0.15;
    const lake = wideWorld
        ? seedHash(seed, `lake:${index}:${layer}`) % 3 === 0 || lava
        : index % 4 === 0 || character > 0.06 || lava;
    // Local aquifers can fill a whole chamber. Their levels do not follow sea level.
    const flooded = version >= 3 && !lava &&
        seedHash(seed, wideWorld
            ? `aquifer:${index}:${layer}` : `aquifer:${index}`) % 7 === 0;
    return {
        cellIndex: index,
        legacy: !wideWorld,
        style,
        centerX, centerY, radiusX: caveRadiusX, radiusY: caveRadiusY,
        waterLevel: flooded ? Math.ceil(centerY + caveRadiusY + 5)
            : Math.min(lava ? 24 + (wideWorld ? 0 : CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT) : Infinity,
                Math.floor(centerY - caveRadiusY * (lava ? 0.4 : 0.25))),
        lake: lake || flooded,
        fluid: lava ? "lava" : "water",
        entrance: wideWorld
            ? layer === 0 && seedHash(seed, `entrance:${index}`) % 5 === 0
            : index % 3 === 0 ||
                perlin(index * 0.69 + 0.23, 73.31, 1429.17) > 0.38,
        active: wideWorld
            ? style === "giant" ||
                perlin(index * 0.77 + layer * 0.89, 67.47 + layer * 29, 1237.29) > -0.04
            : index % 3 === 0 || character > -0.25,
        alexRegion: alexCaveRegionAt(centerX, seed, spawnX, version),
    };
}

function deepCaveColumnAt(worldX, seed, spawnX, version) {
    const cell = Math.floor(worldX / (CELL_WIDTH * 4));
    const layers = Array.from({ length: 4 }, (_, layer) => {
        const rooms = Array.from({ length: 5 }, (_, offset) =>
            cavernForCell(cell + offset - 2, seed, spawnX, version, layer))
            .filter(room => room.active)
            .sort((a, b) => a.centerX - b.centerX);
        const left = rooms.filter(room => room.centerX <= worldX).at(-1);
        const right = rooms.find(room => room.centerX > worldX);
        const passages = [];
        if (left && right && right.cellIndex - left.cellIndex <= 1 &&
            seedHash(seed, `passage:${layer}:${left.cellIndex}`) % 5 !== 0) {
            const t = (worldX - left.centerX) / (right.centerX - left.centerX);
            passages.push({
                y: left.centerY + (right.centerY - left.centerY) * t +
                    perlin(worldX * 0.01, layer * 17, 3301) * 24 +
                    perlin(worldX * 0.031, layer * 19, 3379) * 7,
                radius: layer === 0 ? 2.1 : 3.2,
            });
        }
        return { rooms, passages };
    });
    const caverns = layers.flatMap(({ rooms }) => rooms.filter(room =>
        Math.abs(worldX - room.centerX) < room.radiusX + 9));
    const passages = layers.flatMap(layer => layer.passages);
    const shafts = [];
    for (let layer = 0; layer < 3; layer++) {
        const room = layers[layer].rooms.find(room =>
            Math.abs(worldX - room.centerX) < 8);
        const below = layers[layer + 1].rooms.find(other => room &&
            Math.abs(other.centerX - room.centerX) < CELL_WIDTH * 2);
        if (!room || !below) continue;
        const centerX = room.centerX +
            perlin(room.cellIndex * 0.63, layer * 0.37, 3401) * 15;
        const bottom = Math.min(room.centerY, below.centerY) - below.radiusY / 2;
        const top = Math.max(room.centerY, below.centerY) + room.radiusY / 2;
        if (Math.abs(worldX - centerX) < 2.6 + layer && top - bottom > 8) {
            shafts.push({ bottom, top, waterfall: seedHash(seed,
                `waterfall:${room.cellIndex}:${layer}`) % 4 === 0 });
        }
    }
    return { version: 4, caverns, passages, shafts, passage: null };
}

export function caveColumnAt(worldX, seed = 0, spawnX = 0, version = 2) {
    if (version >= 4) return deepCaveColumnAt(worldX, seed, spawnX, version);
    const cell = Math.floor(worldX / CELL_WIDTH);
    const rooms = Array.from({ length: 7 }, (_, offset) =>
        cavernForCell(cell + offset - 3, seed, spawnX, version))
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
                ? 2.3 + Math.max(0, perlin(worldX * 0.033 + 0.27, 21.19, 3491.31))
                : 1.5 + Math.max(0, perlin(worldX * 0.033 + 0.27, 21.19, 3491.31)) * 0.8,
        };
    }
    // Extend legacy worlds beneath their former bedrock without changing the
    // saved upper 110 rows or their original cave shapes.
    const deep = deepCaveColumnAt(worldX, seed, spawnX, 4);
    const lower = deep.caverns.filter(room => room.centerY < CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT)
        .map(room => ({ ...room, entrance: false }));
    const shafts = deep.shafts.slice();
    for (const room of caverns) {
        if (Math.abs(worldX - room.centerX) < 3) {
            shafts.push({ bottom: 118, top: room.centerY, waterfall: false });
        }
    }
    return { version, caverns: [...caverns, ...lower], passage,
        passages: [passage, ...deep.passages.filter(p => p.y < CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT)].filter(Boolean),
        shafts };
}

export function caveCellAt(worldX, y, surface, column = caveColumnAt(worldX)) {
    if (y <= 1 || y > surface) return "solid";

    for (const cavern of column.caverns) {
        const dx = (worldX - cavern.centerX) / cavern.radiusX;
        const sampleY = cavern.legacy ? y - (CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT) : y;
        const tunnel = cavern.style === "spaghetti" || cavern.style === "noodle";
        const bend = tunnel
            ? perlin(worldX * 0.055, cavern.centerY * 0.031, 1877) * 5 : 0;
        const dy = (y - cavern.centerY - bend) / cavern.radiusY;
        // Most rooms are bent tunnels. Occasional cheese chambers have stronger
        // roof/floor variation, leaving shelves and rock between their lobes.
        const edge = perlin(worldX * 0.075, sampleY * 0.095, 1613) * 0.15 +
            perlin(worldX * 0.029, sampleY * 0.065, 1801) * 0.11 +
            perlin(worldX * 0.13, sampleY * 0.17, 1861) * 0.045;
        const warpX = perlin(worldX * 0.035, sampleY * 0.055, 1901) * 0.1;
        const warpY = perlin(worldX * 0.065, sampleY * 0.04, 1931) * (tunnel ? 0.12 : 0.55);
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
                Math.max(0, perlin(sampleY * 0.065, cavern.centerX * 0.015, 1997)) * 0.4;
            const bend = perlin(sampleY * 0.065, cavern.centerX * 0.015, 1997) * 8;
            if (Math.abs(worldX - cavern.centerX - bend) < mouthWidth) return "air";
        }
    }

    if (y > surface - 8 || y < 4) return "solid";
    const passages = column.passages ?? (column.passage ? [column.passage] : []);
    if (passages.some(passage => Math.abs(y - passage.y) < passage.radius)) {
        return "air";
    }
    if (column.shafts) {
        for (const shaft of column.shafts) {
            if (y < shaft.bottom || y > shaft.top) continue;
            return shaft.waterfall && y >= shaft.top - 2 ? "water" : "air";
        }
    }

    // Two differently scaled ridge fields make winding passages. Their
    // intersections join chambers without placing tunnels per chunk.
    const fieldY = column.version < 4 && y >= CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT
        ? y - (CHUNK_HEIGHT - LEGACY_CHUNK_HEIGHT) : y;
    const warpX = worldX + perlin(worldX * 0.018, fieldY * 0.02, 2203) * 9;
    const warpY = fieldY + perlin(worldX * 0.021, fieldY * 0.017, 2411) * 7;
    const winding = Math.abs(perlin(warpX * 0.044, warpY * 0.059, 2617));
    const branch = Math.abs(perlin(warpX * 0.027, warpY * 0.044, 2819));
    const noodle = Math.abs(perlin(warpX * 0.071, warpY * 0.082, 3269));
    const depth = Math.max(0, Math.min(1, (surface - y) / Math.max(1, surface - 4)));
    const width = 0.014 + Math.max(0, perlin(worldX * 0.014, fieldY * 0.018, 3023)) * 0.02;
    const branchWidth = 0.008 + Math.max(0,
        perlin(worldX * 0.031, fieldY * 0.039, 3167)) * 0.012;
    const noodleWidth = 0.006 + depth * 0.008;
    return winding < width || branch < branchWidth || noodle < noodleWidth
        ? "air"
        : "solid";
}
