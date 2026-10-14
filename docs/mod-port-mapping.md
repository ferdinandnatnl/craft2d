# Minecraft mod port baseline

## Version and module scope

Use Minecraft Java 1.20.1 as the reference behavior version for this port. Alex's Caves has a 1.20.1 release, and the Modrinth release records also show 1.20.1 builds for the other requested mods. This version is a content baseline for the browser game. The game uses JavaScript and does not run Minecraft's Java mod loader, so loader compatibility does not constrain this port.

For "YUNG's Better Structures," include the full structure suite that has 1.20.1 releases:

- Better Dungeons
- Better Mineshafts
- Better Strongholds
- Better Nether Fortresses
- Better Ocean Monuments
- Better Desert Temples
- Better Jungle Temples
- Better Witch Huts
- Better End Island
- YUNG's Bridges
- YUNG's Extras

Better Caves and Better Portals are separate YUNG projects. They are outside this structure suite; cave work is already covered by Terralith and Alex's Caves, and portal changes are not in the requested module name.

The inspected release records used for the 1.20.1 source baseline are:

| Mod | Reference release |
|---|---|
| Distant Horizons | [3.3.3-1.20.1](https://modrinth.com/mod/distanthorizons/versions?g=1.20.1) |
| Terralith | [2.5.4](https://modrinth.com/mod/terralith/versions?g=1.20.1) |
| Alex's Caves | [2.0.2](https://modrinth.com/mod/alexs-caves/versions?g=1.20.1) |
| Better Combat | [1.9.0+1.20.1](https://modrinth.com/mod/better-combat/versions?g=1.20.1) |
| Falling Leaves | [1.15.6+1.20.1](https://modrinth.com/mod/fallingleaves/versions?g=1.20.1) |
| AmbientSounds | [6.3.10](https://modrinth.com/mod/ambientsounds/versions?g=1.20.1) |
| Fresh Animations | [1.10.4](https://fresh-animations.com/) |
| Xaero's Minimap | [26.6.0](https://modrinth.com/mod/xaeros-minimap/versions?g=1.20.1) |
| Sodium | [0.5.13](https://modrinth.com/mod/sodium/versions?g=1.20.1) |
| YUNG's structure modules | [1.20 releases](https://modrinth.com/user/YUNGNICKYOUNG) that list both 1.20 and 1.20.1 |

## Feature mapping

| Mod | Original behavior to preserve | Existing game integration point | Port status |
|---|---|---|---|
| Distant Horizons | Terrain LOD for far view distance; explored LODs persist and use chunk data | `Client/Assets/rendering/voxelRenderer.js`, chunk revisions, and saved dimension chunks | Partial: distant explored chunks render from saved block/wall data with 2/4/8/16-block sampling tiers. Chunk edits invalidate the derived LOD; no duplicate LOD database is needed because full chunks already persist. Unexplored terrain pre-generation and view-distance controls remain. |
| Terralith | Broad biome and terrain generation overhaul | `Shared/biome.js`, `Shared/terrainHeight.js`, `Client/Assets/world/generator.js` | Terrain noise fields are in the worktree; Terralith biome placements, surface rules, and features remain pending. |
| Alex's Caves | Six rare cave biomes, their cave generation, blocks, mobs, and progression | `Shared/caves.js`, biome registry, chunk generation, entity and block registries | Partial: seeded rare regions for all six cave biomes use spawn-distance, climate, and depth conditions; Abyssal Chasm pockets flood, and each biome gets deterministic block accents. Dedicated blocks/mobs, cave tablets/maps, and biome-specific progression remain. |
| YUNG structure suite | Reworked dungeons, mineshafts, strongholds, temples, huts, monuments, fortresses, End arena, bridges, and added structures | `Shared/structures.js`, `Client/Assets/world/generator.js`, loot and entity systems | Seeded vanilla placement changes are in the worktree; the YUNG module structures and mechanics remain pending. |
| Better Combat | Weapon-specific ranges and hit shapes, wind-up timing, combos, multi-target sweeps, and held attacks | `Client/Assets/entities/player.js`, item definitions, entity damage, body swing animation | Partial: 1.20.1 melee ranges/shapes, half-cooldown wind-up, sword/axe combos, multi-target hits, and held repeat are integrated. Offhand/dual-wield support, feints, and per-weapon animation/configuration remain. |
| Falling Leaves | Client-side leaf particles with per-tree spawn rates and block-specific textures | `Client/Assets/world/fallingLeaves.js`, `Client/Assets/world/fallingLeafPhysics.js`, leaf blocks, world update | Partial: deterministic leaf particles, per-block/deciduous/conifer rates, texture selection, wind, collision, water/lava response, break particles, and saved controls are integrated. Loading the mod's resource-pack particle-definition format remains. |
| AmbientSounds | Local ambient layers selected by biome, dimension, weather, and environment | `Client/Assets/game/ambientProfiles.js`, `Client/Assets/game/ambientSoundscape.js`, biome and world state | Partial: biome/environment loops crossfade by biome, time, depth, and environment. Rain/storm loops and rain/snow precipitation use saved weather state with multiplayer server updates. The source mod's full sound catalog, regional profiles, and event coverage remain. |
| Fresh Animations | State-driven vanilla mob rigs and motion | Existing entity body parts and pose updates | Pending. Preserve Steve/Alex identity and skins. |
| Xaero's Minimap | Explored map, player marker, coordinates, icons, zoom, and waypoints | Chunk data, save data, game HUD | Pending. Original implementation is closed source; use its public behavior and docs. |
| Sodium | Faster chunk building, visibility culling, and render submission without changing scene appearance | Existing chunk and Three.js renderer | Pending. Keep visual output unchanged. |

## Source references

- [Distant Horizons](https://modrinth.com/mod/distanthorizons/versions?g=1.20.1)
- [Distant Horizons source and LOD behavior](https://gitlab.com/distant-horizons-team/distant-horizons)
- [Distant Horizons explored-world persistence and rendering model](https://gitlab.com/distant-horizons-team/distant-horizons/-/wikis/1-user-guide/1-frequently-asked-questions/1-general/General)
- [Terralith 1.20 branch](https://github.com/Stardust-Labs-MC/Terralith/tree/1.20)
- [Alex's Caves source](https://github.com/AlexModGuy/AlexsCaves)
- [Alex's Caves biome-generation rules](https://github.com/AlexModGuy/AlexsCaves/blob/main/src/main/java/com/github/alexmodguy/alexscaves/server/config/BiomeGenerationConfig.java)
- [YUNG-GANG projects](https://github.com/YUNG-GANG)
- [Better Combat 1.20.1 source](https://github.com/ZsoltMolnarrr/BetterCombat/tree/1.20.1)
- [Falling Leaves source and license](https://github.com/Fourmisain/fallingleaves)
- [AmbientSounds source](https://github.com/CreativeMD/AmbientSounds)
- [Fresh Animations behavior and version support](https://fresh-animations.com/about/)
- [Xaero's Minimap project page](https://modrinth.com/mod/xaeros-minimap)
- [Sodium source](https://github.com/CaffeineMC/sodium)
