# World scale and saved worlds

## Current state

The world was horizontally unbounded but terrain and biomes changed over short
spans. Chunks had 110 vertical rows. The generator loaded three nearby chunks
and retained every visited chunk as live block objects. Local saves serialized
all rows into browser storage.

## Change

Generation version 4 uses 256 rows. Sea level is row 150, leaving about 2.5
times the previous underground space. Terrain and climate noise span roughly
four times as much horizontal distance. Mountains can reach row 238 while
valleys and ocean basins lie below sea level. Shorelines gain local variation.
Peak snow depends on each column's elevation, so a whole biome chunk does not
become a single diagonal strip of snow and ice.

Generation version 5 keeps that scale and cave system, but gives mountain
flanks shorter ridges and shoulders. It also limits the broad mountain rise
before the world ceiling, avoiding long straight slopes and clipped flat peaks.
New worlds use version 5. Saved version 4 worlds keep their exact terrain
function and already generated chunks, so continuing one cannot reshape its
existing mountains without replacing saved blocks.

The existing cave carver is reused. Version 4 places rooms at varied depths,
creates occasional branching passages and vertical shafts, and rarely makes
giant high-ceiling caverns. Underground biomes cover wider regions. Dripstone
patches are sparse. Ore rules, water, lava, surface biomes, and landmark spacing
follow the expanded scale.

The renderer still draws nearby chunks and visible rows. Distant completed
chunks move from live block objects into compact run-length encoded data and
reload when approached. Unprocessed chunks stay live. Saves include both live
and stored chunks, and old array-based save data remains readable.

## Legacy saves and rollback

Versions 1–3 keep their established surface generation and screen coordinates.
Their original first 110 chunk rows remain in place. Loading adds deeper rows
and replaces only the generated bedrock floor with rock to permit access below.
Rows that contain player blocks or metadata remain intact. New old-version
chunks use the same surface profile and gain the deeper area. Existing saved
chunks retain their current decoration blocks; a generator update does not
silently rewrite player edits or generated materials already saved there.

The new save format records the 256-row height and generation version. The
loader accepts old arrays and new compressed layers. Browser saves are written
to IndexedDB, with a small pointer in the existing world list. The first save
of a legacy world also stores a copy of the original save there before writing
the expanded version. World download still exports one portable save file. Export a world before
rolling back to a build that only understands 110 rows; the older build cannot
read 256-row saves.

## Tradeoffs

A single local save still uses browser storage. Run-length encoding reduces
ordinary stone and air rows, and IndexedDB offers more space than localStorage,
but a very large explored world can eventually reach the browser's quota. The
save path reports that failure and retains the last successful snapshot. More chunk rows also increase generation work and active
memory use; only a bounded nearby set remains live during travel.

The height expansion is playable 2D terrain, not a full 3D Minecraft world.
Waterfalls are seeded sources in shafts and depend on the existing fluid
simulation. Giant cave systems are rare, so players may travel far to find one.
