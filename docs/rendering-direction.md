# Rendering direction

## Findings

Reference source inspected at `amvern/Two-Dimensional-Reloaded` commit
`2bce83ede31c9bd8ed80d9d15b8128c4ec749b17` (upstream HEAD, 2026-10-12).

- [CameraMixin](https://github.com/amvern/Two-Dimensional-Reloaded/blob/main/src/client/java/github/amvern/twodimensionalreloaded/client/mixin/CameraMixin.java)
  fixes camera rotation and moves the camera eight blocks behind the player.
- [Plane](https://github.com/amvern/Two-Dimensional-Reloaded/blob/main/src/main/java/github/amvern/twodimensionalreloaded/utils/Plane.java)
  fixes the play plane at z=0.5 and defines which blocks to cull.
- [BlockRendererMixin](https://github.com/amvern/Two-Dimensional-Reloaded/blob/main/src/client/java/github/amvern/twodimensionalreloaded/client/mixin/sodium/BlockRendererMixin.java)
  removes geometry in front of the plane. The remaining world still uses Minecraft's 3D renderer.
- [CurseForge](https://www.curseforge.com/minecraft/mc-mods/two-dimensional-reloaded)
  identifies Photon v1.2a and Iris support for the reference screenshots.

## Current state and problem

The voxel view uses a volumetric sky pass, rasterized sunlight and local
lights, shadow maps, and restrained bloom. It does not provide hardware
path-traced ray tracing or load Minecraft Iris shader packs. The Canvas
renderer remains available as a fallback without these 3D effects.

## Implemented direction

The user approved this renderer change in the working session. Three.js now
renders the world while the existing simulation remains authoritative.

1. Map foreground blocks and background walls to separate depth layers.
2. Use actual cube faces and a perspective camera facing the play plane.
3. Render distant terrain as geometry with depth and fog.
4. Render the player and mobs as articulated cuboids using their current skins.
5. Use directional sunlight, bounded local lights, shadow maps, and restrained
   bloom. Keep pixel texture filtering and render at up to 2x display pixel
   ratio.
6. Project pointer positions back onto the play plane so targeting matches
   the visible blocks. Keep inventory and menus in screen space.
7. Preserve the Canvas renderer as a selectable fallback during the change.

## Why and tradeoffs

This follows the reference's rendering principle and uses an established
renderer instead of growing a custom pseudo-3D engine. It adds a dependency,
GPU work, resource lifecycle management, and browser compatibility checks.
The volumetric sky uses a bounded ray-march shader; scene lighting and shadows
remain rasterized. Minecraft Iris shader packs cannot be loaded directly into
this browser engine.

## Migration and rollback

No save-format or server-protocol migration. Existing blocks, collision,
inventory, entities, and world rules remain the source of truth. Introduce
the renderer behind an explicit mode so rollback selects the Canvas path.

## Review criteria

Compare the same world in daylight, torch-lit night, caves, and water.
Verify break/place targeting, foreground and background layers, entity
animation, volumetric sky, shadow quality, water, save/reload, texture-pack
selection, viewport changes, and frame time. Do not present a static scene as
a finished game.

## Texture draft

The original texture pack remains the default, as requested. The optional
Natural 32x pack uses [this atlas](../Client/Assets/sprites/materials/terrain-atlas.png).
It was generated with the built-in imagegen tool using
[this prompt](terrain-atlas-prompt.txt). It is not selected automatically.

## Terrain and water corrections

- Scenery uses one unit grid and emits both sides of every exposed step.
  Regression tests audit face winding and closed mesh edges on uneven terrain.
- Tree variants attach by their actual root columns. Submerged cells use
  shore materials and water, with no grass or trees growing underwater.
- Numeric and text seeds give stable scenery choices. Flat worlds have flat
  scenery, and newly generated flat chunks no longer use hill noise to place water.
- Water continues across the wall lane. A dense blue back face hides distant
  scenery while the translucent front surface preserves visibility of swimming
  entities.
- The voxel renderer uses a bounded volumetric sky shader, shadow-mapped
  sunlight, up to three local shadow lights, and half-resolution bloom. Water
  uses animated normals and sky reflections. Terrain sky exposure is computed
  from nearby heights. Day, dusk, and night light and fog blend smoothly, and
  distant lighting does not depend on whether the player is standing under
  cover.

No existing saved blocks are regenerated or removed by these rendering fixes.
