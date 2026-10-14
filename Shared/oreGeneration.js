import tooloud from "./tooloud.js";
import { Blocks } from "./blocks.js";
import { LEGACY_DEPTH_SHIFT, miningElevation, undergroundBiomeAt } from "./overworldGeneration.js";

const triangle = (y, low, peak, high) => y <= low || y >= high ? 0 :
    y < peak ? (y - low) / (peak - low) : (high - y) / (high - peak);
const profiles = [
    ["coal", Blocks.CoalOre, Blocks.DeepslateCoalOre],
    ["iron", Blocks.IronOre, Blocks.DeepslateIronOre],
    ["copper", Blocks.CopperOre, Blocks.DeepslateCopperOre],
    ["gold", Blocks.GoldOre, Blocks.DeepslateGoldOre],
    ["redstone", Blocks.RedstoneOre, Blocks.DeepslateRedstoneOre],
    ["diamond", Blocks.DiamondOre, Blocks.DeepslateDiamondOre],
    ["lapis", Blocks.LapisOre, Blocks.DeepslateLapisOre],
    ["emerald", Blocks.EmeraldOre, Blocks.DeepslateEmeraldOre],
];

export function oreAbundance(ore, y, mountain = false, dripstone = false) {
    switch (ore) {
        case "coal": return y > 0 ? Math.min(1, y / 96) : 0;
        case "iron": return Math.max(triangle(y, -64, 16, 72), y > 80 ? Math.min(1, (y - 80) / 152) : 0);
        case "copper": return triangle(y, 0, 48, 96) * (dripstone ? 1.7 : 1);
        case "gold": return triangle(y, -64, -16, 32) + (y < -48 ? 0.2 : 0);
        case "redstone": return y < 16 ? 0.25 + Math.max(0, -32 - y) / 40 : 0;
        case "diamond": return y < 16 ? Math.max(0, (16 - y) / 80) * 0.6 : 0;
        case "lapis": return triangle(y, -64, 0, 64);
        case "emerald": return mountain && y > -16 ? Math.min(1, (y + 16) / 200) : 0;
        default: return 0;
    }
}

export function undergroundRockAt(x, y, version = 4) {
    const transition = (version < 4 ? 30 + LEGACY_DEPTH_SHIFT : 80) +
        tooloud.Perlin.noise(x * (version >= 4 ? 0.025 : 0.09), 0, 5209) * 3;
    return y < transition ? Blocks.Deepslate : Blocks.Stone;
}

export function oreBlockAt(x, y, surface, mountain = false, exposedToAir = false, version = 4) {
    if (y <= 1 || y > surface - 4) return null;
    const elevation = miningElevation(y, version);
    const sampleY = version < 4 ? y - LEGACY_DEPTH_SHIFT : y;
    const deep = undergroundRockAt(x, y, version) === Blocks.Deepslate;
    const dripstone = undergroundBiomeAt(x, y, surface, version) === "dripstone_caves";
    // Rare long, branching deposits with a host rock and occasional raw blocks.
    const veinRegion = tooloud.Perlin.noise(x * 0.009, sampleY * 0.016, 5351);
    const vein = Math.abs(tooloud.Perlin.noise(x * 0.04, sampleY * 0.07, 5387));
    if (veinRegion > 0.27 && vein < 0.12 && elevation > -60 && elevation < 50) {
        const iron = elevation < 0;
        const richness = tooloud.Perlin.noise(x * 0.37, sampleY * 0.41, 5413);
        if (richness > 0.42) return iron ? Blocks.RawIronBlock : Blocks.RawCopperBlock;
        if (richness > 0.02) return iron ? Blocks.DeepslateIronOre : Blocks.CopperOre;
        return iron ? Blocks.Tuff : Blocks.Granite;
    }
    for (let i = 0; i < profiles.length; i++) {
        const [name, normal, deepslate] = profiles[i];
        const abundance = oreAbundance(name, elevation, mountain, dripstone);
        if (!abundance) continue;
        if (exposedToAir && ((name === "lapis" && Math.abs(elevation) > 32) ||
            (["coal", "diamond", "gold"].includes(name) &&
                tooloud.Perlin.noise(x * 0.71, sampleY * 0.67, 5501 + i * 31) > -0.15))) continue;
        const cluster = tooloud.Perlin.noise(x * 0.19, sampleY * 0.23, 5603 + i * 101);
        if (cluster > 0.68 - abundance * 0.23) return deep ? deepslate : normal;
    }
    return null;
}
