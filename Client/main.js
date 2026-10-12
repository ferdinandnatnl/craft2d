import { runtime } from "./Assets/utils/runtime.js";
import { Game } from "./Assets/game/game.js";
import "./Assets/game/music.js";
import { drawLoadScreen } from "./Assets/utils/renderer.js";
import { initTouchControls } from "./Assets/utils/touchControls.js";

runtime.game = new Game();
runtime.world = null;
initTouchControls();

drawLoadScreen();

// The game entry loads its modules before this file runs, so the load event
// may already have fired.
await runtime.game.initGame().catch((error) => {
    console.error("Failed to initialize game:", error);
});

requestAnimationFrame(() => runtime.game.gameLoop());
