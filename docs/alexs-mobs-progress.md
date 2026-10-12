# Alex's Mobs 1.22.9 port progress

## Reference baseline

- Minecraft Java 1.20.1, Alex's Mobs 1.22.9.
- Source commit: 0d7bea8f643bff978ff2b9e4690f3c2a1a514266 (2024-09-06).
- The commit's build.gradle declares version 1.22.9.
- The source registers 116 entity types: 90 primary creature species, 3 linked creature parts, and 23 support entities such as projectiles and mounts.
- The source also registers 240 item identifiers, 36 block identifiers, 19 effects, 4 enchantments, 84 recipes, 104 entity loot tables, and the Animal Dictionary.
- The reference project declares LGPL-3.0. Original crocodile textures are reused with attribution; see [third-party assets](third-party-assets.md).
- Source checkout is outside this project at /tmp/alexsmobs-1.22.9.

## Current project integration points

- Mob constructors and behavior: Client/Assets/entities/mob.js and Client/Assets/entities/mobs/
- Entity registration: Client/Assets/entities/entities.js
- Natural and aquatic spawning: Client/Assets/world/chunk.js and Shared/biome.js
- Block and item registries: Shared/blocks.js and Shared/items.js
- World saves: Client/Assets/world/saving.js
- 3D entity rendering: Client/Assets/rendering/entities.js
- Player interactions: Client/Assets/entities/player.js
- Animal Dictionary, progression, recipes, and unique blocks still need source audit and matching game integrations.

## Feature completeness matrix

Pending means the source behavior has not been ported and verified. Do not mark a cell complete until both are true. The last column records gameplay verification.

| Mob | Spawning | AI | Movement | Special mechanics | Interactions | Drops | Tested |
|---|---|---|---|---|---|---|---|
| Alligator Snapping Turtle | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Anaconda | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Anteater | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Bald Eagle | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Banana Slug | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Bison | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Blobfish | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Blue Jay | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Bone Serpent | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Bunfungus | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Cachalot Whale | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Caiman | Partial | Partial | Partial | Partial | Partial | Complete | Partial |
| Capuchin Monkey | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Catfish | Partial | Partial | Partial | Partial | Partial | Complete | Partial |
| Centipede | Partial | Partial | Partial | Partial | Partial | Partial | Partial |
| Cockroach | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Comb Jelly | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Cosmic Cod | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Cosmaw | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Crimson Mosquito | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Crocodile | Partial | Partial | Partial | Partial | Partial | Partial | Partial |
| Crow | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Devil's Hole Pupfish | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Drop Bear | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Elephant | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Emu | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Endergrade | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Enderiophage | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Farseer | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Fly | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Flutter | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Flying Fish | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Frilled Shark | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Froststalker | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Gazelle | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Gelada Monkey | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Giant Squid | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Gorilla | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Grizzly Bear | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Guster | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Hammerhead Shark | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Hummingbird | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Jerboa | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Kangaroo | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Komodo Dragon | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Laviathan | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Leafcutter Ant | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Lobster | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Maned Wolf | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mantis Shrimp | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mimic Octopus | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mimicube | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Moose | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mudskipper | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mungus | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Murmur | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Orca | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Platypus | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Potoo | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Raccoon | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Rain Frog | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Rattlesnake | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Rhinoceros | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Roadrunner | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Rocky Roller | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Sea Bear | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Seagull | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Seal | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Shoebill | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Skelewag | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Skreecher | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Skunk | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Snow Leopard | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Soul Vulture | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Spectre | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Stradpole | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Straddler | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Sugar Glider | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Sunbird | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Tarantula Hawk | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Tasmanian Devil | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Terrapin | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Tiger | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Toucan | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Triops | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Tusklin | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Underminer | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Void Worm | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Warped Mosco | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Warped Toad | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Linked and support entities

The three registered creature parts are Bone Serpent Part, Void Worm Part, and Murmur Head. Other support entities include Anaconda Part, Cachalot Part and Echo, Centipede Body and Tail, Giant Squid Part, Laviathan Part, Cockroach Egg, Emu Egg, Void Worm Shot, projectiles, thrown items, the Straddleboard, and other ability-specific entities. They are tracked with their owning creature or content system rather than counted as additional species.

## Source-confirmed crocodile behavior

Review completed against EntityCrocodile, CrocodileAIMelee, BlockReptileEgg, the crocodile target and food tags, spawn biome configuration, loot table, and chestplate recipe in the pinned source commit.

- Spawns in swamp and mangrove-swamp biomes, on the source's allowed spawn blocks, below sea level plus four; normal group size is one or two. The game currently has a Swamp biome and no Mangrove Swamp biome.
- Has 30 health, 8 armor, 10 attack damage, and 0.25 movement speed in the source.
- Switches land and semi-aquatic navigation; seeks and leaves water based on prey, passengers, and swim duration; can breathe underwater and climb along water edges.
- Adults target players outside Peaceful and source-tagged prey; babies do not target. Tamed crocodiles target monsters except Creepers when defending.
- Lunge is 23 animation ticks. During its attack window, it can damage, stun a shield user, or grab a smaller non-sneaking target. While carrying a target in water it death-rolls for 40 ticks and deals repeated damage.
- Wild crocodiles bask while idle on land. Rotten flesh breeds them. Mating produces an egg-bearing parent; the parent lays eggs on sand or crocodile spawning ground. Eggs crack and hatch over random ticks and are protected from most trampling. Hatchlings near a player become tame and sit.
- Tamed crocodiles can sit on owner command and eat meat to heal. Baby crocodiles grow over 24,000 ticks and drop a scute on adulthood.
- Drops are crocodile scutes and crocodile eggs from the source loot table. Eight scutes craft the crocodile chestplate; the source chestplate has armor and durability behavior.
- 2D adaptation: a grabbed target is pinned beside the crocodile and takes timed damage during the water death-roll. The original roll around the 3D body axis is shown as a side-on body rotation.

## Current implementation and verification

The crocodile slice now has swamp and water-adjacent spawning, prey targeting, land and water steering, basking, lunge and grab states, the 40-tick death roll, rotten-flesh breeding, egg laying and hatching, visible egg cracks, hatchling taming, scute and egg drops, item registration, and local save/load state. Egg block metadata also persists through chunk saves. Its previous custom SVG sticker has been removed. The render now uses the original 1.22.9 crocodile texture atlas, model proportions, cube geometry, articulated legs, jaw, neck, and three-part tail; the model's long axis is rotated into the game's side-scrolling direction.

Eleven focused tests cover the entity update loop, targeting, Peaceful behavior, armor, taming, breeding, the lunge and death-roll timing, spawn conditions, egg progression, crocodile save data, the articulated source-model rig, and adding that rig to the voxel scene. The full test suite, lint, and client build pass. The browser connection used for rendered-game inspection could not start because its runtime requested a missing browser-service file, so the updated crocodile has not yet been checked in a live browser session.

The crocodile row remains partial. This slice does not yet include the original shield damage/stun interaction, the desert variant, source crocodile audio, the crocodile chestplate and its armor/recipe behavior, the Animal Dictionary entry, or exact Forge biome tags. The 88 other species and shared systems still need their source-by-source audits and implementation.

## Caiman slice

The Caiman now has its own swamp-and-water spawn rule, prey targeting, land and
water steering, grab damage, underwater bellow cycle, owner defense, commands,
raw/cooked catfish breeding, egg laying, shared reptile egg cracking and
hatching, nearby-player hatchling taming, item registration, and save/load
state. Caiman eggs use their original block atlas. The Caiman renders from the
original source atlas and translated `ModelCaiman.java` geometry, including
the articulated jaws, limbs, and three tail segments. Its raw/cooked catfish,
spawn egg, and sound assets are included with attribution.

This game has no Mangrove Swamp or Mud blocks. Caimans therefore use the
existing Swamp biome and its grass, dirt, sand, and gravel near water as the
smallest supported adaptation. The source roster still has additional prey
species that are not registered in this project yet, so those targets become
available as their species are ported. The Caiman row remains partial until
source audio and all interactions are checked in a live game session.

Nine focused checks cover spawn validation, prey targeting, player and owner
retaliation, grab damage, egg hatching, hatchling taming, save data, and the
articulated rig plus renderer scene registration. See
`Client/tests/alexsMobsCaiman.test.js`.

## Catfish slice

The Catfish now has three source-sized variants, aquatic spawning and steering,
small and medium item scavenging with stomach storage, large Catfish prey
swallowing, player bites, spit behavior, size-specific drops, bucket capture and
release, save data, and the translated source model and textures. The large
Catfish can also spit swallowed mobs back into the active chunk.

Catfish follow a nearby player holding a Sea Lantern and seek nearby Sea Lantern
blocks while they are in water and have room in their stomach. Touching a Sea
Pickle block or interacting with a held Sea Pickle makes them spit. The game now
registers the two vanilla support blocks and items and uses the source Cod hurt
and death sounds plus the vanilla player burp for the block-triggered spit.

Sea Pickles store the vanilla one-to-four cluster count and waterlogged state.
Their light levels are 6, 9, 12, and 15. The 2D game uses one non-solid tile
for each cluster and does not yet model warm-ocean acquisition. The Catfish row
remains partial until the remaining source mechanics and live gameplay are
checked. Ten focused tests cover size and spawning rules, pickle cluster state,
lantern attraction, pickle-triggered spitting, feeding, prey handling, bucket
and save state, and renderer setup. See
`Client/tests/alexsMobsCatfish.test.js`. The live browser view has not yet been
checked.

## Centipede slice

The first Centipede slice adds the source 35-health, six-armor head, its cave
spawn egg and leg drops, dark-cave spawning, light avoidance, and hostility
toward players, villagers, and Cockroaches. Successful bites deal eight damage
and apply Poison with the source difficulty duration and amplifier. The source
five-to-eight body count follows a saved movement trail, and the custom 3D rig
uses the original texture atlas and Centipede audio. Player and villager Poison
state and the Centipede's segment trail persist in world saves.

The 2D game represents the source multipart head, body, and tail as one entity
with an articulated visual chain. Hits still resolve on the head entity, and
the model translation simplifies some source leg and tail geometry. Cave spawn
weight is adapted to a low-probability roll in this game's dark-cave spawn
cycle. Wall climbing, Centipede leggings and their armor effect, potion
resistance, source spawn weighting, and live browser inspection remain pending.
Five focused tests cover source stats and drops, segment spacing, targeting and
poison, armor and save state, and rig construction. See
`Client/tests/alexsMobsCentipede.test.js`.

### Batch files

- New behavior, source model translation, and art: Client/Assets/entities/mobs/crocodile.js, Client/Assets/rendering/alexsMobsCrocodileRig.js, and Client/Assets/sprites/{entity,blocks,items}/alexsmobs/
- Registration and natural spawns: Client/Assets/entities/entities.js, Client/Assets/world/chunk.js, Shared/biome.js
- Egg block lifecycle and data: Client/Assets/world/block.js, Shared/blocks.js, Shared/items.js
- Carry state, render, save/load: Client/Assets/game/entity.js, Client/Assets/rendering/entities.js, Client/Assets/world/saving.js
- Regression coverage: Client/tests/alexsMobsCrocodile.test.js
