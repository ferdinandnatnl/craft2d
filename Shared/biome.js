import { WATER_LEVEL } from "./constants.js";
import { Noise, NoisePresets } from "./noise.js";
import { Blocks } from "./blocks.js";
import { Trees } from "./trees.js";

export class Biome {
    constructor({
        name,
        heightNoise = new Noise(),
        topLayer = Blocks.GrassBlock,
        secondLayer = Blocks.Dirt,
        firstLayerWidth = 1,
        secondLayerWidth = 3,
        treeType = [Trees.Oak],
        grassType = [Blocks.Grass, Blocks.TallGrass],
        treeThreshold = 55,
        minTemp = 0,
        maxTemp = 60,
        minWet = 60,
        maxWet = 0,
        minMount = 0,
        maxMount = 60,
        waterLevel = WATER_LEVEL,
        mobs = BiomeMobs.CommonMobs,
        googlies = BiomeMobs.Googlies,
        maxMobs = 4,

        fluidType = Blocks.Water,

        baseBlock = Blocks.Stone,

        waterSandType = Blocks.Sand,

        fullChunk = false,
    } = {}) {
        this.name = name;
        this.heightNoise = heightNoise;
        this.topLayer = topLayer;
        this.secondLayer = secondLayer;
        this.firstLayerWidth = firstLayerWidth;
        this.secondLayerWidth = secondLayerWidth;
        this.treeType = treeType;
        this.grassType = grassType;
        this.treeThreshold = treeThreshold;
        this.minTemp = minTemp;
        this.maxTemp = maxTemp;
        this.minWet = minWet;
        this.maxWet = maxWet;
        this.minMount = minMount;
        this.maxMount = maxMount;
        this.waterLevel = waterLevel;
        this.mobs = mobs;
        this.googlies = googlies;
        this.maxMobs = maxMobs;

        this.baseBlock = baseBlock;

        this.fluidType = fluidType;
        this.fullChunk = fullChunk;

        this.waterSandType = waterSandType;
    }
}

export const BiomeMobs = Object.freeze({
    CommonMobs: ["Pig", "Cow", "Sheep", "Chicken"],
    Googlies: ["Zombie", "Zombie", "Skeleton", "Creeper", "Enderman"],
});

export const OverworldBiomes = Object.freeze({
    Plains: new Biome({
        name: "Plains",
        heightNoise: NoisePresets.Flat,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak, Trees.Birch],
        grassType: [
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.FlowerDandelion,
            Blocks.FlowerTulipWhite,
        ],
        treeThreshold: 7,
        minTemp: 0.25,
        maxTemp: 0.65,
        minWet: 0.15,
        maxWet: 0.6,
        minMount: 0,
        maxMount: 0.45,
    }),
    Desert: new Biome({
        name: "Desert",
        heightNoise: NoisePresets.Flat,
        mobs: [],
        googlies: ["Husk", "Husk", "Skeleton", "Creeper"],
        topLayer: Blocks.Sand,
        secondLayer: Blocks.SandStone,
        firstLayerWidth: 2,
        treeType: [Trees.Cactus],
        grassType: [Blocks.DeadBush],
        treeThreshold: 7.3,
        minTemp: 0.65,
        maxTemp: 1,
        minWet: 0,
        maxWet: 0.35,
        minMount: 0,
        maxMount: 0.45,
    }),
    Tundra: new Biome({
        name: "Snowy Taiga",
        heightNoise: NoisePresets.Flat,
        topLayer: Blocks.SnowedGrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Spruce],
        grassType: [],
        treeThreshold: 7,
        minTemp: 0,
        maxTemp: 0.25,
        minWet: 0.32,
        maxWet: 0.78,
        minMount: 0.15,
        maxMount: 0.6,
    }),
    Taiga: new Biome({
        name: "Taiga",
        heightNoise: NoisePresets.Flat,
        topLayer: Blocks.Podzol,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Spruce, Trees.BigSpruce],
        grassType: [Blocks.Grass, Blocks.TallGrass, Blocks.Fern],
        treeThreshold: 6.5,
        minTemp: 0.2,
        maxTemp: 0.4,
        minWet: 0.35,
        maxWet: 0.75,
        minMount: 0,
        maxMount: 0.6,
    }),
    Shrubland: new Biome({
        name: "Windswept Forest",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak, Trees.Birch],
        grassType: [Blocks.Grass, Blocks.TallGrass],
        treeThreshold: 7,
        minTemp: 0.45,
        maxTemp: 0.85,
        minWet: 0.1,
        maxWet: 0.4,
        minMount: 0.55,
        maxMount: 0.85,
    }),
    Savanna: new Biome({
        name: "Savanna",
        heightNoise: NoisePresets.Flat,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Acacia],
        grassType: [Blocks.Grass, Blocks.TallGrass, Blocks.DeadBush],
        treeThreshold: 7,
        minTemp: 0.55,
        maxTemp: 0.85,
        minWet: 0.2,
        maxWet: 0.5,
        minMount: 0,
        maxMount: 0.45,
    }),
    Forest: new Biome({
        name: "Forest",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak, Trees.Oak, Trees.Birch],
        grassType: [
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.FlowerRose,
            Blocks.FlowerBlueOrchid,
            Blocks.FlowerDaisy,
            Blocks.FlowerRose,
        ],
        treeThreshold: 6,
        minTemp: 0.3,
        maxTemp: 0.55,
        minWet: 0.45,
        maxWet: 0.75,
        minMount: 0,
        maxMount: 0.45,
    }),
    SeasonalForest: new Biome({
        name: "Flower Forest",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak],
        grassType: [
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.FlowerAllium,
            Blocks.FlowerBlueOrchid,
            Blocks.FlowerDaisy,
            Blocks.FlowerDandelion,
            Blocks.FlowerRose,
            Blocks.FlowerTulipOrange,
            Blocks.FlowerTulipPink,
            Blocks.FlowerTulipRed,
            Blocks.FlowerTulipWhite,
            Blocks.FlowerSyringa,
            Blocks.FlowerRose,
        ],
        treeThreshold: 6.5,
        minTemp: 0.5,
        maxTemp: 0.75,
        minWet: 0.35,
        maxWet: 0.65,
        minMount: 0,
        maxMount: 0.45,
    }),
    Swamp: new Biome({
        name: "Swamp",
        heightNoise: NoisePresets.Flat,
        mobs: ["Pig", "Cow", "Sheep", "Chicken", "Crocodile", "Caiman"],
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak],
        grassType: [Blocks.Grass, Blocks.TallGrass],
        treeThreshold: 7,
        minTemp: 0.3,
        maxTemp: 0.7,
        minWet: 0.75,
        maxWet: 1,
        minMount: 0,
        maxMount: 0.35,
        waterLevel: 12,
        googlies: ["Zombie", "Drowned", "Drowned", "Skeleton", "Creeper"],
    }),
    RainForest: new Biome({
        name: "Jungle",
        heightNoise: NoisePresets.LowHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.BigJungle, Trees.Jungle],
        grassType: [Blocks.Grass, Blocks.TallGrass],
        treeThreshold: 7,
        minTemp: 0.65,
        maxTemp: 0.95,
        minWet: 0.8,
        maxWet: 1,
        minMount: 0,
        maxMount: 0.5,
    }),
    Mountain: new Biome({
        name: "Stony Peaks",
        heightNoise: NoisePresets.Mountains,
        topLayer: Blocks.Stone,
        secondLayer: Blocks.Stone,
        treeType: [],
        grassType: [Blocks.Grass, Blocks.TallGrass],
        treeThreshold: 6,
        minTemp: 0,
        maxTemp: 1,
        minWet: 0,
        maxWet: 1,
        minMount: 0.9,
        maxMount: 1,
    }),
    FrozenPeaks: new Biome({
        name: "Frozen Peaks", topLayer: Blocks.SnowBlock, secondLayer: Blocks.IceBlock,
        treeType: [], grassType: [], mobs: [], treeThreshold: Infinity,
        minTemp: 0, maxTemp: 0.2, minMount: 0.8, maxMount: 1,
    }),
    JaggedPeaks: new Biome({
        name: "Jagged Peaks", topLayer: Blocks.SnowBlock, secondLayer: Blocks.Stone,
        treeType: [], grassType: [], mobs: [], treeThreshold: Infinity,
        minTemp: 0, maxTemp: 0.24, minMount: 0.8, maxMount: 1,
    }),
    SnowySlopes: new Biome({
        name: "Snowy Slopes", topLayer: Blocks.SnowBlock, secondLayer: Blocks.SnowBlock,
        firstLayerWidth: 2, treeType: [], grassType: [], mobs: [],
        treeThreshold: Infinity, minTemp: 0, maxTemp: 0.24,
        minMount: 0.6, maxMount: 0.9,
    }),
    SnowyPlains: new Biome({
        name: "Snowy Plains",
        heightNoise: NoisePresets.Flat,
        topLayer: Blocks.SnowedGrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [],
        grassType: [],
        treeThreshold: Infinity,
        minTemp: 0,
        maxTemp: 0.14,
        minWet: 0,
        maxWet: 0.3,
        minMount: 0,
        maxMount: 0.36,
    }),
    BirchForest: new Biome({
        name: "Birch Forest",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Birch],
        grassType: [Blocks.Grass, Blocks.TallGrass, Blocks.FlowerDaisy],
        treeThreshold: 6.3,
        minTemp: 0.34,
        maxTemp: 0.55,
        minWet: 0.58,
        maxWet: 0.82,
        minMount: 0,
        maxMount: 0.44,
    }),
    DarkForest: new Biome({
        name: "Dark Forest",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Oak, Trees.Oak, Trees.Birch],
        grassType: [Blocks.Grass, Blocks.TallGrass, Blocks.Fern],
        treeThreshold: 4.8,
        minTemp: 0.28,
        maxTemp: 0.55,
        minWet: 0.72,
        maxWet: 1,
        minMount: 0,
        maxMount: 0.45,
    }),
    Meadow: new Biome({
        name: "Meadow",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [],
        grassType: [
            Blocks.Grass,
            Blocks.TallGrass,
            Blocks.FlowerDandelion,
            Blocks.FlowerDaisy,
            Blocks.FlowerAllium,
            Blocks.FlowerTulipPink,
        ],
        treeThreshold: Infinity,
        minTemp: 0.42,
        maxTemp: 0.58,
        minWet: 0.5,
        maxWet: 0.68,
        minMount: 0.58,
        maxMount: 0.72,
    }),
    Grove: new Biome({
        name: "Grove",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.SnowedGrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Spruce],
        grassType: [Blocks.Fern],
        treeThreshold: 6.8,
        minTemp: 0,
        maxTemp: 0.24,
        minWet: 0.22,
        maxWet: 0.64,
        minMount: 0.62,
        maxMount: 0.9,
    }),
    OldGrowthTaiga: new Biome({
        name: "Old Growth Taiga",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.Podzol,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.BigSpruce, Trees.BigSpruce, Trees.Spruce],
        grassType: [Blocks.Fern, Blocks.TallGrass],
        treeThreshold: 5.8,
        minTemp: 0.18,
        maxTemp: 0.4,
        minWet: 0.58,
        maxWet: 0.86,
        minMount: 0,
        maxMount: 0.58,
    }),
    WindsweptSavanna: new Biome({
        name: "Windswept Savanna",
        heightNoise: NoisePresets.Mountains,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Acacia],
        grassType: [Blocks.Grass, Blocks.TallGrass, Blocks.DeadBush],
        treeThreshold: 7.4,
        minTemp: 0.66,
        maxTemp: 0.92,
        minWet: 0.08,
        maxWet: 0.35,
        minMount: 0.6,
        maxMount: 0.9,
    }),
    CherryBlossom: new Biome({
        name: "Cherry Grove",
        heightNoise: NoisePresets.SmallHills,
        topLayer: Blocks.GrassBlock,
        secondLayer: Blocks.Dirt,
        treeType: [Trees.Cherry],
        grassType: [
            Blocks.Grass,
            Blocks.FlowerTulipPink,
            Blocks.FlowerSyringa,
            Blocks.FlowerPeony,
        ],
        treeThreshold: 7,
        minTemp: 0.3,
        maxTemp: 0.5,
        minWet: 0.3,
        maxWet: 0.8,
        minMount: 0.55,
        maxMount: 0.9,
    }),
});

export const NetherBiomes = Object.freeze({
    NetherWastes: new Biome({
        name: "Nether Wastes",
        topLayer: Blocks.Netherrack,
        secondLayer: Blocks.Netherrack,
        firstLayerWidth: 3,
        secondLayerWidth: 5,
        treeType: [],
        grassType: [],
        treeThreshold: Infinity,
        minTemp: 0,
        maxTemp: 1,
        minWet: 0,
        maxWet: 1,
        minMount: 0,
        maxMount: 1,
        waterLevel: 5,
        mobs: [],
        googlies: ["WitherSkeleton", "WitherSkeleton", "Blaze"],
        maxMobs: 4,

        baseBlock: Blocks.Netherrack,
        fullChunk: true,

        fluidType: Blocks.Lava,

        waterSandType: Blocks.SoulSand,
    }),
});

export const EndBiomes = Object.freeze({
    EndIsland: new Biome({
        name: "The End",
        topLayer: Blocks.EndStone,
        secondLayer: Blocks.EndStone,
        baseBlock: Blocks.EndStone,
        treeType: [],
        grassType: [],
        mobs: [],
        googlies: ["Enderman"],
        maxMobs: 2,
        waterLevel: -110,
        minTemp: 0,
        maxTemp: 1,
        minWet: 0,
        maxWet: 1,
        minMount: 0,
        maxMount: 1,
    }),
});

export const AllBiomes = Object.freeze({
    ...OverworldBiomes,
    ...NetherBiomes,
    ...EndBiomes,
});

/** Accept both biome keys and display names stored by older world saves. */
export function resolveBiome(biomeSet, savedBiome) {
    const name = typeof savedBiome === "string"
        ? savedBiome : savedBiome?.name;
    const vanillaName = {
        Tundra: "Snowy Taiga",
        Shrubland: "Windswept Forest",
        "Seasonal Forest": "Flower Forest",
        "Rain Forest": "Jungle",
        Mountain: "Stony Peaks",
        "Cherry Blossom": "Cherry Grove",
    }[name] ?? name;
    return biomeSet[name] ??
        Object.values(biomeSet).find((biome) => biome.name === vanillaName) ??
        null;
}

export const ClimateOverworldBiomes = Object.freeze(Object.fromEntries(
    Object.entries(OverworldBiomes).filter(([key]) =>
        !["FrozenPeaks", "JaggedPeaks", "SnowySlopes"].includes(key)),
));

export const LowlandOverworldBiomes = Object.freeze(Object.fromEntries(
    Object.entries(ClimateOverworldBiomes).filter(([key]) =>
        !["Mountain", "Meadow", "Grove"].includes(key)),
));
