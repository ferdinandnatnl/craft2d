# Minecraft Minions 1.12.2 port

The behavior reference is AtomicStryker's Minecraft Minions 1.12.2 release.
The CurseForge jar embeds the matching Java sources under `src/atomicstryker/`;
the client port follows its `EntityMinion`, `InventoryMinion`, job manager,
block tasks, tree scanner, Master Staff, and A* behavior. The original model
texture, staff icon, and audio are credited alongside their assets.

| Original system | 2D game port |
|---|---|
| `EntityMinion` and its task state | [`Client/Assets/entities/mobs/minion.js`](../Client/Assets/entities/mobs/minion.js) |
| A* and access-node routing | [`Client/Assets/entities/minions/astar.js`](../Client/Assets/entities/minions/astar.js) and `pathfinding.js` |
| 24-slot `InventoryMinion` | Worker inventory plus [`inventory.js`](../Client/Assets/entities/minions/inventory.js) |
| Ore, tree, custom dig, stairwell, and strip mine jobs | The worker task states and bounded world scans in `minion.js` |
| `ItemMastersStaff`, deed menu, contextual orders | [`commands.js`](../Client/Assets/entities/minions/commands.js) |
| Original staff, deed, spawn, and order audio | `Client/Assets/audio/sfx/minions/` |

The original strip mine is a horizontal 2-block-high tunnel up to 80 segments.
The port keeps that order separate from the mineshaft order. In the 2D world,
the mineshaft is a traversable descending staircase, and strip mining checks the
exposed ceiling for valuable blocks. Vein traversal follows the original
face-adjacent connectivity.

The original `minions.cfg` and `minions_Advanced.cfg` options are represented by
the browser's `minionConfig` local-storage JSON value. Defaults are 2 XP levels
per deed, four minions, 1.5/20 food exhaustion, and the original deed choices.
Custom tree and worthless blocks accept registry IDs or names. For example:

```js
localStorage.setItem("minionConfig", JSON.stringify({
  evilDeedXPCost: 2,
  minionsPerPlayer: 4,
  treeBlockIds: [9001],
  treeBlockNames: ["cheese log"],
  worthlessBlockIds: [],
  worthlessBlockNames: ["decorative stone"],
}));
```

The configuration is read once on game startup. The server's default maximum is
also four workers per player.

Reference: [Minecraft Minions 1.12.2](https://www.curseforge.com/minecraft/mc-mods/minecraft-minions/files/2497432), by AtomicStryker. The project has permission to use the original assets.
