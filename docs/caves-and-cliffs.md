# Caves & Cliffs generation in 2D

This adapts the generation features in Mojang's
[Caves & Cliffs Part II guide](https://www.minecraft.net/en-us/article/caves---cliffs-part-ii-the-features)
and [Java 1.18 release notes](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java).
The world now has 256 vertical blocks in new generation version 4.

## Generation versions 3 and 4

New worlds use version 4. Existing saves retain their surface-generation version
and saved blocks. Server saves record the version and send it before the seed.
Old servers continue to use version 2. Legacy rows keep their screen positions;
new deep rows are added below them. Saved player blocks are not regenerated.

- Terrain remains independent of the surface biome. New worlds have broader
  landforms and at least 18 blocks of building space below the world ceiling.
- Elevation and climate place Meadows, Groves, Snowy Slopes, Frozen Peaks,
  Jagged Peaks, and Stony Peaks. Warm peaks contain calcite bands.
- Underground humidity and geology vary with both horizontal position and
  depth. Lush regions have moss, clay at water edges, azalea, spore blossoms,
  and glowing cave vines. Dripstone regions have floor and ceiling formations.
  Existing Alex's Caves regions retain their own materials.
- Most caves remain narrow. New worlds add separated depth networks, vertical
  shafts, occasional waterfalls, and rare high-ceiling caverns. Local chamber
  water levels create dry caves, pools, and flooded chambers.
- Deepslate replaces deeper stone. Ore bands map vanilla mining elevations
  onto 256 blocks: bottom = -64, sea level = 63, ceiling = 319.
  These are internal generation values, not new player coordinates.
- Coal favors higher ground; diamonds and redstone favor depth. Iron has a
  lower band and a mountain band. Copper favors middle elevations and dripstone
  regions. Lapis, gold, and mountain emeralds have separate bands. Some ores
  are less exposed to air. Rare iron/tuff and copper/granite veins contain raw
  blocks. Copper can be smelted and crafted into storage blocks.
- Overworld hostile spawn checks reject any reachable block light. They read
  current blocks, so a newly placed torch works before the next lighting pass.
  Open daylight blocks spawning; outdoor night spawning remains possible.

## Limits of this adaptation

This is not a complete port of the 1.18 release. Legacy chunks get new playable
rows below their old bedrock without moving player blocks. Their saved upper
terrain keeps its prior shape. Aquifers are chamber-local,
not Minecraft's full 3D pressure model. Cave plants and dripstone have textures,
mining, light, and support behavior, but not growth, dripstone damage, spore
particles, or dripleaf physics. Powder snow, goats, and axolotls are not added.
Existing character models, rendering, structures, and progression remain in use.

## Verification

`overworldGeneration.test.js` checks actual seeded distribution, depth bands,
materials, aquifers, light blocking, and assets. `worldGenerationIntegration.test.js`
exercises the chunk generation passes, biome selection, spawn lighting, and
server version persistence. Generation maps were inspected using registered
textures. In-game rendering could not be checked because the browser tool's
installed runtime references a missing module.
