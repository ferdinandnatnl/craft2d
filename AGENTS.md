# Project guidance

## Core direction

Build the existing Minecraft game as a 2D world. Reuse what this project already
has and what Minecraft has already established. Keep changes small and fit them
into the current game; do not invent a parallel system or redesign a familiar
Minecraft mechanic without a clear project need.

## Before adding or changing a feature

- Read the relevant code, nearby assets, and project docs first. Check for an
  existing implementation or reusable helper before creating another one.
- For Minecraft behavior, follow the established vanilla mechanic and its
  terminology. Match the behavior already used elsewhere in this project.
- Adapt presentation and controls to side-scrolling 2D when needed. Keep the
  underlying rules, items, blocks, crafting, and progression familiar to
  Minecraft wherever the 2D world can support them.
- Extend the existing data and rendering paths. Reuse current sprites, textures,
  models, and registries before adding replacements or duplicate definitions.
- Do not add features or dependencies that the request does not need.

## Player character

The existing player character is established and must stay recognizable. Do
not redesign, replace, recolor, or change its proportions, skin, or model
identity. Preserve the existing Steve/Alex selection and custom skin behavior.
Rendering changes may adapt how the character is drawn in the 2D world, but must
continue to use the existing character and skin data.

## Existing decisions

Treat current project behavior and documented decisions as intentional unless
the task asks to change them. In particular, read
[`docs/rendering-direction.md`](docs/rendering-direction.md) before changing
rendering. Keep the simulation and saved world data as the source of truth when
changing how the world is displayed.
