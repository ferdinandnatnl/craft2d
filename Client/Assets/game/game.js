import { runtime } from "../utils/runtime.js";
import { Chat } from "./chat.js";
import { PauseMenu } from "./pauseMenu.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../utils/globals.js";
import { input } from "../utils/input.js";
import { updateTouchControls } from "../utils/touchControls.js";
import { draw, setRendererMode } from "../utils/renderer.js";
import { activeDimension, getDimensionChunks } from "../world/dimension.js";
import { loadWorldFromLocalStorage } from "../world/saving.js";
import { World } from "../world/world.js";
import { normalizeFallingLeavesSettings } from "../world/fallingLeafPhysics.js";
import { handleDebugInput, updateDebug } from "../../debug.js";

export class Game {
    constructor() {
        this.lastFrameTime = performance.now();
        this.fpsDisplay = 0;
        this.settings = {
            musicVolume: 100,
            sfxVolume: 100,
            lighting: true,
            renderer: "voxel",
            fallingLeaves: normalizeFallingLeavesSettings(),
            username: "Player",
        };
        this.chat = new Chat();
        this.pauseMenu = new PauseMenu();
        this.playerNameOnboarding = document.getElementById("player-name-onboarding");
        this.playerNameForm = document.getElementById("player-name-form");
        this.playerNameInput = document.getElementById("player-name-input");
        this.playerNameError = document.getElementById("player-name-error");
        this.isPlayerNameOnboardingOpen = false;
        this.playerNameOnboarding?.addEventListener("cancel", (event) =>
            event.preventDefault(),
        );
        this.playerNameForm?.addEventListener("submit", (event) =>
            this.completePlayerNameOnboarding(event),
        );
        this.playerNameInput?.addEventListener("input", () => {
            if (this.playerNameError) this.playerNameError.textContent = "";
        });
        this.loadSettings();
    }

    waitForTexturePack() {
        return new Promise((resolve) => {
            const checkLoaded = () => {
                if (runtime.isTexturePackLoaded) {
                    resolve();
                } else {
                    setTimeout(checkLoaded, 100);
                }
            };
            checkLoaded();
        });
    }

    loadSettings() {
        let loaded = {};
        try {
            const savedSettings = JSON.parse(
                localStorage.getItem("settings") || "{}",
            );
            if (savedSettings && typeof savedSettings === "object") {
                loaded = savedSettings;
            }
        } catch (error) {
            console.warn("Could not read saved settings; using defaults.", error);
        }

        this.settings.lighting = loaded.lighting !== false;
        const savedUsername =
            typeof loaded.username === "string"
                ? loaded.username.trim().slice(0, 15)
                : "";
        this.settings.username = savedUsername || "Player";
        this.settings.musicVolume =
            loaded.musicVolume ?? (loaded.music === false ? 0 : 100);
        this.settings.sfxVolume =
            loaded.sfxVolume ?? (loaded.sfx === false ? 0 : 100);
        this.settings.renderer = setRendererMode(loaded.renderer);
        this.settings.fallingLeaves = normalizeFallingLeavesSettings(loaded.fallingLeaves);
        this.updateRendererButtonLabel();

        if (!savedUsername) this.showPlayerNameOnboarding();
    }

    showPlayerNameOnboarding() {
        const onboarding = this.playerNameOnboarding;
        if (!onboarding || !this.playerNameForm || !this.playerNameInput) return;

        this.isPlayerNameOnboardingOpen = true;
        onboarding.showModal();
        requestAnimationFrame(() => this.playerNameInput.focus());
    }

    completePlayerNameOnboarding(event) {
        event.preventDefault();

        const username = this.playerNameInput?.value.trim().slice(0, 15) || "";
        if (!username) {
            if (this.playerNameError) this.playerNameError.textContent = "Enter a name to continue.";
            this.playerNameInput?.focus();
            return;
        }

        try {
            const savedSettings = JSON.parse(localStorage.getItem("settings") || "{}");
            localStorage.setItem(
                "settings",
                JSON.stringify({ ...savedSettings, ...this.settings, username }),
            );
        } catch (error) {
            console.warn("Could not save the player name.", error);
            if (this.playerNameError) this.playerNameError.textContent = "Could not save your name. Please try again.";
            return;
        }

        this.settings.username = username;
        this.isPlayerNameOnboardingOpen = false;
        this.playerNameOnboarding?.close();

        const player = runtime.world?.player;
        if (player) {
            player.name = username;
            if (multiplayer && runtime.server) {
                runtime.server.send({
                    type: "playerData",
                    sender: player.UUID,
                    message: {
                        UUID: player.UUID,
                        skin: player.body.sprite ?? "player/steve",
                        model: player.skinModel || "steve",
                        name: username,
                    },
                });
            }
        }

    }

    updateRendererButtonLabel() {
        const rendererButton = document.getElementById("pause-renderer-btn");
        if (rendererButton) rendererButton.textContent = "Renderer - " + (this.settings.renderer === "canvas" ? "Classic" : "3D");
    }

    cycleRenderer() {
        this.settings.renderer = setRendererMode(this.settings.renderer === "voxel" ? "canvas" : "voxel");
        this.updateRendererButtonLabel();
        try {
            const saved = JSON.parse(localStorage.getItem("settings") || "{}");
            localStorage.setItem("settings", JSON.stringify({ ...saved, renderer: this.settings.renderer }));
        } catch (error) {
            console.warn("Could not save the renderer setting.", error);
        }
    }

    calculateFPS(currentFrameTime) {
        if (!this._lastUpdate) this._lastUpdate = currentFrameTime;
        if (!this._frameCount) this._frameCount = 0;
        this._frameCount++;
        if (currentFrameTime - this._lastUpdate >= 1000) {
            this.fpsDisplay = this._frameCount;
            this._frameCount = 0;
            this._lastUpdate = currentFrameTime;
        }
        return this.fpsDisplay;
    }

    async gameLoop() {
        const currentFrameTime = performance.now();
        runtime.deltaTime = (currentFrameTime - this.lastFrameTime) / 1000;
        runtime.passedTime += runtime.deltaTime;

        await runtime.world.startGenerator();

        this.updateGame();

        draw(
            getDimensionChunks(activeDimension),
            this.calculateFPS(currentFrameTime),
        );

        this.lastFrameTime = currentFrameTime;

        if (updateDebug) updateDebug();

        input.resetKeysPressed();

        requestAnimationFrame(() => this.gameLoop());
    }

    updateGame() {
        if (this.isPlayerNameOnboardingOpen) return;

        updateTouchControls();
        if (!runtime.world) return;

        runtime.world.updateEntities();
        runtime.world.updateParticleEmitters();

        if (runtime.world.player) this.cursorBlockLogic();
        if (runtime.hotbar) runtime.hotbar.update();
        if (this.pauseMenu) this.pauseMenu.update();
        if (this.chat) this.chat.update();

        if (typeof handleDebugInput === "function") handleDebugInput();
    }

    async initGame() {
        runtime.world = new World();
        
        console.log("Initializing game...");

        // Wait for texture pack
        console.log("Waiting for texture pack...");

        await this.waitForTexturePack();

        console.log("Texture pack loaded!");

        // Load world from local storage if not multiplayer
        if (!multiplayer) {
            loadWorldFromLocalStorage();
        } else {
            const { connectMultiplayerServer } = await import(
                "../multiplayer/server.js"
            );
            connectMultiplayerServer();

            const seedDeadline = Date.now() + 15000;
            while (!runtime.world.generator.multiplayerSeedLoaded) {
                if (Date.now() >= seedDeadline) {
                    if (runtime.server) {
                        runtime.server.suppressCloseWarning = true;
                        runtime.server.ws?.close();
                    }
                    throw new Error(
                        "Timed out waiting for the host's world data. Allow local network access and check that the Wi-Fi allows devices to connect.",
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        runtime.world.generator.loadingWorld = false;
    }

    updateArray(array, deltaTime) {
        array.forEach((element) => {
            element.update();
        });
    }

    cursorBlockLogic() {
        if (this.pauseMenu?.getActive()) {
            runtime.cursorInRange = false;
            if (runtime.world.player) {
                runtime.world.player.hoverBlock = null;
                runtime.world.player.hoverWall = null;
            }
            return;
        }
        const mousePosition = input.getMousePositionOnBlockGrid();
        const player = runtime.world.player;
        const blockCenter = new Vector2(
            mousePosition.x + BLOCK_SIZE / 2,
            mousePosition.y + BLOCK_SIZE / 2,
        );
        runtime.cursorInRange = player.isPositionInInteractionRange(blockCenter);
        player.hoverBlock = runtime.cursorInRange
            ? runtime.world.getBlockAtWorldPosition(
                  input.getMousePositionOnBlockGrid().x,
                  input.getMousePositionOnBlockGrid().y,
              )
            : null;
        player.hoverWall = runtime.cursorInRange
            ? runtime.world.getBlockAtWorldPosition(
                  input.getMousePositionOnBlockGrid().x,
                  input.getMousePositionOnBlockGrid().y,
                  true,
              )
            : null;
    }

    animateFrame() {
        runtime.globalFrame++;
    }
}
