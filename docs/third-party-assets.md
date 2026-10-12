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
- `Client/Assets/audio/sfx/alexsmobs/caiman_*.ogg`

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
