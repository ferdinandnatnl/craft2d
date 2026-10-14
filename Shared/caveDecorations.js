import tooloud from "./tooloud.js";
import { Blocks } from "./blocks.js";
import { undergroundBiomeAt } from "./overworldGeneration.js";

// Sample the unmodified cave mask, including neighboring chunks. Decorations
// must not depend on generation order or on earlier decorations in this column.
export function caveDecorationAt(x, y, surface, sample, version = 4) {
    const biome = undergroundBiomeAt(x, y, surface, version);
    if (!biome) return null;
    const cell = sample(x, y);
    const above = sample(x, y + 1);
    const below = sample(x, y - 1);
    const patch = tooloud.Perlin.noise(x * 0.08, y * 0.1, 4903);
    if (cell === "solid") {
        if (above === "solid" && below === "solid") return null;
        if (biome === "lush_caves") {
            if (above === "water") return patch > 0.05 ? Blocks.Clay : null;
            return patch > 0.08 ? Blocks.MossBlock : null;
        }
        return patch > 0.32 ? Blocks.DripstoneBlock : null;
    }
    if (cell !== "air") return null;
    if (biome === "lush_caves") {
        if (above === "solid" && patch > -0.12) {
            return patch > 0.35 ? Blocks.SporeBlossom : Blocks.CaveVines;
        }
        if (below === "solid" && patch > 0.18) return Blocks.Azalea;
    } else {
        // Leave low passages clear; formations belong in rooms with headroom.
        if (below === "solid" && sample(x, y + 3) === "air" && patch > 0.27) return Blocks.PointedDripstone;
        if (above === "solid" && sample(x, y - 3) === "air" && patch < -0.32) return Blocks.HangingDripstone;
    }
    return null;
}
