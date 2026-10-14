/**
 * Game page entry — load media pack, then the full client module graph.
 */
import { inject } from "@vercel/analytics";
import {
    applyPackedMediaStyles,
    loadMediaBundle,
} from "./Assets/utils/assetBundle.js";
import { createBootLoader } from "./bootLoader.js";

inject();

const boot = createBootLoader();
try {
await loadMediaBundle();
applyPackedMediaStyles();
boot.setProgress(0);

await Promise.all([
    import("./Assets/entities/entities.js"),
    import("./Assets/entities/TNT.js"),
    import("./Assets/game/inventoryItem.js"),
    import("@2dcraft.com/shared/trees.js"),
    import("./Assets/world/dimension.js"),
    import("./Assets/multiplayer/messageHandler.js"),
    import("./Assets/multiplayer/server.js"),
    import("./Assets/utils/screenshotChunks.js"),
]);

const { initializeTextures } = await import(
    "./Assets/utils/texturePackLoader.js"
);
await initializeTextures((progress) => boot.setProgress(progress));

if (new URLSearchParams(window.location.search).get("multiplayer") === "true") {
    boot.setMessage("Connecting to multiplayer server...");
}

const { initButtonCenterImages } = await import("./buttonUtils.js");
initButtonCenterImages();

const {
    toggleChunkBorders,
    toggleCamera,
    toggleHitbox,
    togglePrintBlock,
    toggleFileSize,
    toggleFps,
    toggleCoordinates,
} = await import("./debug.js");
const { togglePauseDifficulty } = await import("./Assets/game/pauseMenu.js");
const { respawnFromDeathScreen } = await import(
    "./Assets/game/deathScreen.js"
);
const { saveWorld } = await import("./Assets/world/saving.js");
const { runtime } = await import("./Assets/utils/runtime.js");

await import("./main.js");

Object.defineProperty(window, "game", {
    get: () => runtime.game,
    configurable: true,
});

Object.assign(window, {
    toggleChunkBorders,
    toggleCamera,
    toggleHitbox,
    togglePrintBlock,
    toggleFileSize,
    toggleFps,
    toggleCoordinates,
    togglePauseDifficulty,
    respawnFromDeathScreen,
    saveWorld,
});

boot.hide();
} catch (error) {
    console.error("Game resources could not load:", error);
    const detail = error instanceof Error ? error.message : String(error);
    boot.fail(
        detail
            ? `Could not load game resources: ${detail.slice(0, 160)}`
            : "Could not load game resources. Check the console and reload.",
    );
}
