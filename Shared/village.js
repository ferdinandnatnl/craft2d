import { isRandomSpreadChunk } from "./randomSpread.js";
import { OverworldBiomes } from "./biome.js";

const VILLAGE_STRUCTURES = new Map([
    [OverworldBiomes.Plains, "VillagePlains"],
    [OverworldBiomes.Meadow, "VillagePlains"],
    [OverworldBiomes.Desert, "VillageDesert"],
    [OverworldBiomes.Taiga, "VillageTaiga"],
    [OverworldBiomes.Savanna, "VillageSavanna"],
    [OverworldBiomes.SnowyPlains, "VillageSnowy"],
]);

// A village is a line of distinct, traversable pieces in the 2D play plane.
export const VILLAGE_PIECES = Object.freeze([
    "Cottage", "Smithy", "Square", "BigHouse", "FarmShack",
]);
export const VILLAGE_CENTER = 2;

export function villageStructureForBiome(biome) {
    return VILLAGE_STRUCTURES.get(biome) ?? null;
}

/** Village spacing adapted for a 2D world, with room for a denser settlement map. */
export function isVillageChunk(seed, chunkIndex, version = 3) {
    return isRandomSpreadChunk(seed, chunkIndex, {
        spacing: version >= 4 ? 96 : 24,
        separation: version >= 4 ? 32 : 8,
        salt: 10387312,
    });
}
