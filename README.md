<div align="center">
  <h1>craft2d.com</h1>

  <br />

  <p>A JavaScript Minecraft fan game with side-scrolling gameplay and a Three.js 3D cutaway renderer.</p>
  <p><em>"The most complete 2D Minecraft fan game you can play in your browser!"</em></p>

  <p><strong>Play here:</strong> <a href="https://craft2d.com">craft2d.com</a></p>

  <br />

  <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
    <img src=".github/readme-clip-1.gif" alt="craft2d.com gameplay clip" width="600" />
    <img src=".github/readme-img-1.png" alt="Gameplay screenshot" width="600" />
    <img src=".github/readme-img-3.png" alt="Gameplay screenshot" width="600" />
    <img src=".github/readme-img-2.png" alt="Gameplay screenshot" width="600" />
  </div>
</div>

> [!IMPORTANT]
> This game is playable but still under development. Expect some minor issues. Please feel free to report any that you come across!

---

## Local Development

### Option 1 - Node.js
To get set up, run `npm install` in the Shared, Client, and Server directories.

From the Client directory, run `npm run dev` to start the Vite dev server on `localhost:3000` (hot module reload for the client).

To statically catch missing imports / undefined names (the usual ESM migration failures), run `npm run lint` in the Client directory.

Run `npm test` in the Client directory for rendering and interaction-grid regressions.

Opening the app starts gameplay in the selected world, or creates a world on the
first visit. Use **Save and Quit to Worlds** in the pause menu to select or create
worlds, join multiplayer, or open Options.

The game uses the original texture pack by default. In the pause menu, switch
**Renderer** between **3D** and **Classic**, or turn **Cinematic** shading off.
Press **F1** to show or hide the HUD. Uploaded texture packs remain supported;
the optional **Natural 32x** pack is available under Options → Texture Packs.

Use the **Wallpaper** tab in Creative to get a background version of any block.
In Survival, put a block stack in the Converter to switch it between a block
and wallpaper. Use the normal Place control to put wallpaper behind blocks or
on an adjacent background tile. A hammer removes wallpaper.

### Survival progression

Type `/progress` in chat for an in-game guide. In this 2D world, place at least
eight obsidian blocks around a 1 × 3 empty center (the corners are optional).
A 2 × 3 opening also works. Use flint and steel on a bottom air block inside
the frame, then walk into the
portal to enter the Nether. Blazes there drop rods, which craft into blaze
powder. Endermen drop pearls; combine
one pearl and one blaze powder to make an Eye of Ender. Use an eye to find the
End shrine, fill its three frames, and enter the End to fight the dragon.
Explore outer End islands for loot outposts, then use the center portal to
return home. Newly generated Overworld chunks can also contain ruined portals
with supplies to repair and light them.

Craft a red bed at a crafting table with three red wool across the top row and
three planks below. Place it on solid ground. Use it during the day to set your
respawn point, or at night to sleep and set your respawn point. Nearby hostile
mobs prevent sleep. In multiplayer, only the host can skip the night. Beds
explode when used in the Nether or End.

Use `/locate village` in chat to find the nearest village. Pumpkin patches can
appear in plains, forests, taiga, and savanna. Use shears on a pumpkin, then
place the carved pumpkin last: put it above two snow blocks for a snow golem,
or above the center of a four-iron-block T for an iron golem.

```text
  O
O . O
O . O
O F O
  O
```

`O` is obsidian, `.` is air, and `F` is the inside air block to ignite.

To host a multiplayer server on your local network, install dependencies as
described above, then run `npm run lan` from the `Server` directory. This builds
the client, starts the game server, and serves the game over HTTP on port 4173.
The terminal lists the addresses to share. Players on the same Wi-Fi can open
`craft2d.com`, choose **Multiplayer → Direct Connection**, and enter the printed
server address (port 25565 by default). If the browser asks, allow local network
access. If the browser blocks the connection, use the printed local Game URL
instead. Keep the host process running while people play. The server world is
saved in `Server/world/`.

To let friends join from other networks without renting a cloud server, forward
TCP ports 4173 and 25565 from your router to the computer running `npm run lan`.
Keep that computer on, allow the ports through its firewall, and share its
public Game URL (`http://<public-ip>:4173/worlds.html`). Friends should open
that URL, choose **Multiplayer → Direct Connection**, and enter
`<public-ip>:25565`. Keep the host's local address reserved in the router so
the forwarding rules stay pointed at the right computer. This only works when
your internet provider gives your router a public IP; carrier-grade NAT blocks
incoming connections and requires a relay or public game host instead.

To run only the game server, run `node server.js` from the `Server` directory.
By default, it listens on port 25565.

Production client build:

```bash
cd Client && npm run build
```

The output is written to `Client/dist/`. Preview it with `npm run preview`.

### Option 2 - Docker
If you wish to build the project with Docker, you can run:
`docker build -t craft2d.com .`. You can then run it with `docker run -p 80:80 craft2d.com`, which will host the game on port 80 (simply `localhost`).
Please be advised that this is a static build and will not update when you modify the code unless you re-run the build command.

> [!NOTE]
> If you are using Docker on Linux in a non-root environment, you may need to use `--network=host` to avoid build and run errors.
