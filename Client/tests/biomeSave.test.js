import test from "node:test";
import assert from "node:assert/strict";
import { EndBiomes, NetherBiomes, OverworldBiomes, resolveBiome } from "@2dcraft.com/shared/biome.js";

test("saved biome names and keys resolve in their original dimension", () => {
    assert.equal(resolveBiome(OverworldBiomes, { name: "Plains" }), OverworldBiomes.Plains);
    assert.equal(resolveBiome(NetherBiomes, { name: "Nether Wastes" }), NetherBiomes.NetherWastes);
    assert.equal(resolveBiome(NetherBiomes, "NetherWastes"), NetherBiomes.NetherWastes);
    assert.equal(resolveBiome(EndBiomes, { name: "The End" }), EndBiomes.EndIsland);
    assert.equal(resolveBiome(EndBiomes, "EndIsland"), EndBiomes.EndIsland);
    assert.equal(resolveBiome(OverworldBiomes, "The End"), null);
});
