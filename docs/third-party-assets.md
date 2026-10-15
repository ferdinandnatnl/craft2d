# Third-party assets

## Alex's Mobs 1.22.9

Alex's Mobs identifies its license as GNU Lesser General Public License v3
(LGPL-3.0) on CurseForge. Its 1.22.9 release metadata also declares the GNU
Lesser General Public License. The LGPL-3.0 text is included in
[`licenses/LGPL-3.0.txt`](licenses/LGPL-3.0.txt).

The following original assets are from the Alex's Mobs 1.22.9 Minecraft 1.20.1
release by Alex's Mobs contributors:

- `Client/Assets/sprites/entity/alexsmobs/crocodile_0.png`
- `Client/Assets/sprites/entity/alexsmobs/crocodile_1.png`
- `Client/Assets/sprites/entity/alexsmobs/crocodile_crown.png`
- `Client/Assets/sprites/entity/alexsmobs/caiman.png`
- `Client/Assets/sprites/entity/alexsmobs/catfish_{small,medium,large}*.png`
- `Client/Assets/sprites/blocks/alexsmobs/caiman_eggs*.png`
- `Client/Assets/sprites/items/alexsmobs/caiman_egg.png`
- `Client/Assets/sprites/items/alexsmobs/raw_catfish.png`
- `Client/Assets/sprites/items/alexsmobs/cooked_catfish.png`
- `Client/Assets/sprites/items/alexsmobs/{small,medium}_catfish.png`
- `Client/Assets/sprites/items/alexsmobs/large_catfish_bucket.png`
- `Client/Assets/sprites/items/alexsmobs/centipede_leg.png`
- `Client/Assets/audio/sfx/alexsmobs/caiman_*.ogg`

Centipede gameplay has been removed. The legacy Centipede Leg icon remains so
items in older saves can still display.

The Sea Lantern and Sea Pickle textures and Cod hurt/death sounds are from the
official Minecraft Java 1.20.1 client assets. The Sea Lantern texture contains
five animation frames; this renderer uses its first 16 by 16 frame.

The crocodile geometry and texture coordinates in
`Client/Assets/rendering/alexsMobsCrocodileRig.js` are translated from the
release's `ModelCrocodile.java`. The Three.js rig turns the source model's long
axis into the game's side-scrolling direction and keeps the source texture
atlas and articulated parts.

The caiman geometry and atlas coordinates in
`Client/Assets/rendering/alexsMobsCaimanRig.js` are translated from
`ModelCaiman.java`. The rig keeps its source jaw, limbs, and three tail joints,
with the original model scale and side-scrolling orientation.

The Catfish rig in `Client/Assets/rendering/alexsMobsCatfishRig.js` translates
the source Small, Medium, and Large model geometry and uses each original
texture atlas plus its alternate spit texture.

Sources:

- [Alex's Mobs source repository](https://github.com/AlexModGuy/AlexsMobs)
- [Alex's Mobs 1.22.9 release](https://www.curseforge.com/minecraft/mc-mods/alexs-mobs/files/all)
- [Project license metadata](https://www.curseforge.com/minecraft/mc-mods/alexs-mobs)
- [LGPL v3 text from GNU](https://www.gnu.org/licenses/lgpl-3.0.html)

## Minecraft Java 1.20.1 door sounds

The wooden door open and close sounds in
`Client/Assets/audio/sfx/block/wooden_door/` are unmodified Ogg assets from
the official Minecraft Java 1.20.1 asset set. The asset index lists their
hashes and sizes.

Source: [Minecraft Java 1.20.1 asset index](https://piston-meta.mojang.com/v1/packages/50ce48459eb9e29836662862273d7b15d41c2c33/5.json).

## Minecraft Java 1.20.1 villager assets

The villager base, seven biome layers, profession layers, and five profession
rank layers in `Client/Assets/sprites/entity/villager/`, plus the compass icon
at `Client/Assets/sprites/items/compass_00.png`, are unmodified textures from
the official Minecraft Java 1.20.1 client archive. The villager sound clips in
`Client/Assets/audio/sfx/mobs/villager/` are unmodified Ogg assets from the
same release's official asset set.

Sources: [Minecraft Java 1.20.1 client archive (SHA-1 `0c3ec587af28e5a785c0b4a7b8a30f9a8f78f838`)](https://piston-data.mojang.com/v1/objects/0c3ec587af28e5a785c0b4a7b8a30f9a8f78f838/client.jar), [Minecraft Java 1.20.1 asset index](https://piston-meta.mojang.com/v1/packages/50ce48459eb9e29836662862273d7b15d41c2c33/5.json).

## Minecraft Java 26.3 horse assets

The horse coat and marking textures, saddle and armor layers, and horse item
icons in `Client/Assets/sprites/` are unmodified assets from the official
Minecraft Java 26.3 client archive. The horse cuboid geometry in
`Client/Assets/models/entity/horse.json` is based on Mojang's Bedrock Samples
`horse_v3.geo.json` model.

Sources: [Minecraft Java 26.3 client archive (SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`)](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar), [Mojang horse geometry](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/models/entity/horse_v3.geo.json).

## Caves & Cliffs generation materials

The added moss, dripstone, cave-vine, azalea, spore-blossom, clay, deepslate,
ore, calcite, granite, tuff, raw-metal, and copper textures are unmodified
Minecraft Java 1.18.2 client textures from Mojang's
[official client archive](https://piston-data.mojang.com/v1/objects/2e9a3e3107cca00d6bc9c97bf7d149cae163ef21/client.jar).
The download was verified against the manifest SHA-1
`2e9a3e3107cca00d6bc9c97bf7d149cae163ef21`. Existing textures were retained.
