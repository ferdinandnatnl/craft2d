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

Our game draws flat tiles and body-part sprites into Canvas 2D. The current
Photon setting adapts color grading and bloom; it is not the full Minecraft
shader pipeline. Oblique decorative faces, flat scenery, and radial light
overlays cannot reproduce perspective, geometric occlusion, or real shadows.
A replacement color texture alone cannot correct that.

## Implemented direction

The user approved this renderer change in the working session. Three.js now
renders the world while the existing simulation remains authoritative.

1. Map foreground blocks and background walls to separate depth layers.
2. Use actual cube faces and a perspective camera facing the play plane.
3. Render distant terrain as geometry with depth and fog.
4. Render the player and mobs as articulated cuboids using their current skins.
5. Use directional sunlight, bounded local lights, shadow maps, and material
   roughness/bump response. Retain pixel texture filtering.
6. Project pointer positions back onto the play plane so targeting matches
   the visible blocks. Keep inventory and menus in screen space.
7. Preserve the Canvas renderer as a selectable fallback during the change.

## Why and tradeoffs

This follows the reference's rendering principle and uses an established
renderer instead of growing a custom pseudo-3D engine. It adds a dependency,
GPU work, resource lifecycle management, and browser compatibility checks.
It does not promise exact Photon parity: Iris shader packs cannot be loaded
directly into this browser engine.

## Migration and rollback

No save-format or server-protocol migration. Existing blocks, collision,
inventory, entities, and world rules remain the source of truth. Introduce
the renderer behind an explicit mode so rollback selects the Canvas path.

## Review criteria

Compare the same world in daylight, torch-lit night, caves, and water.
Verify break/place targeting, foreground and background layers, entity
animation, save/reload, texture-pack selection, shader fallback, viewport
changes, and frame time. Do not present a static scene as a finished game.

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
  scenery while the front tint preserves visibility of swimming entities.
  The surface uses Three.js planar reflections with animated normals.

No existing saved blocks are regenerated or removed by these rendering fixes.
