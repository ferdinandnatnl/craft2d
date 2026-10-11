import { CANVAS } from "./canvas.js";
import { input } from "./input.js";
import { runtime } from "./runtime.js";

const controls = document.getElementById("touch-controls");
const activePointers = new Map();
let canvasPointer = null;
let canvasHotbarPointer = false;
let inventoryLongPress = null;
let inventoryRightClick = false;

export function getTouchHudInset() {
    if (!controls || !matchMedia("(pointer: coarse)").matches) return 0;
    const safeArea = parseFloat(getComputedStyle(controls).paddingBottom) || 0;
    const rect = CANVAS.getBoundingClientRect();
    return rect.height ? Math.max(12, safeArea) * CANVAS.height / rect.height : 0;
}

function stopControls() {
    for (const action of activePointers.values()) input.setTouchAction(action, false);
    activePointers.clear();
    input.clearTouchActions();
    if (inventoryLongPress) clearTimeout(inventoryLongPress);
    inventoryLongPress = null;
    canvasPointer = null;
    canvasHotbarPointer = false;
}

export function initTouchControls() {
    if (!controls || !CANVAS) return;

    for (const button of controls.querySelectorAll("[data-action]")) {
        button.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse") return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            const action = button.dataset.action;
            activePointers.set(event.pointerId, action);
            input.setTouchAction(action, true);
            button.classList.add("pressed");
        });
        const release = (event) => {
            if (activePointers.get(event.pointerId) !== button.dataset.action) return;
            input.setTouchAction(button.dataset.action, false);
            activePointers.delete(event.pointerId);
            button.classList.remove("pressed");
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    }

    CANVAS.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" || canvasPointer !== null) return;
        if (!runtime.world?.player || runtime.game?.pauseMenu?.getActive()) return;
        event.preventDefault();
        CANVAS.setPointerCapture(event.pointerId);
        canvasPointer = event.pointerId;

        const player = runtime.world.player;
        if (player.windowOpen) {
            input.setPointerPosition(event.clientX, event.clientY);
            inventoryRightClick = false;
            inventoryLongPress = setTimeout(() => {
                inventoryLongPress = null;
                inventoryRightClick = true;
                input.setTouchMouseButton(2, true);
            }, 450);
            return;
        }

        const rect = CANVAS.getBoundingClientRect();
        const position = {
            x: (event.clientX - rect.left) * CANVAS.width / rect.width,
            y: (event.clientY - rect.top) * CANVAS.height / rect.height,
        };
        const slot = Math.floor((position.x - (CANVAS.width / 2 - 273)) / 60);
        if (position.y >= CANVAS.height - 80 - getTouchHudInset() &&
            position.y <= CANVAS.height - getTouchHudInset() &&
            slot >= 0 && slot < 9) {
            canvasHotbarPointer = true;
            input.setTouchAction(`hotbar${slot + 1}`, true);
            input.setTouchAction(`hotbar${slot + 1}`, false);
        } else {
            input.setPointerPosition(event.clientX, event.clientY);
        }
    });

    CANVAS.addEventListener("pointermove", (event) => {
        if (event.pointerId !== canvasPointer) return;
        event.preventDefault();
        if (canvasHotbarPointer) return;
        input.setPointerPosition(event.clientX, event.clientY);
        if (inventoryLongPress) {
            clearTimeout(inventoryLongPress);
            inventoryLongPress = null;
        }
    });

    const finishCanvasTouch = (event) => {
        if (event.pointerId !== canvasPointer) return;
        event.preventDefault();
        if (!canvasHotbarPointer) input.setPointerPosition(event.clientX, event.clientY);
        if (inventoryLongPress) {
            clearTimeout(inventoryLongPress);
            inventoryLongPress = null;
        }
        if (event.type === "pointerup" && runtime.world?.player?.windowOpen && !inventoryRightClick) {
            input.queueTouchClick(0);
        }
        if (inventoryRightClick) input.setTouchMouseButton(2, false);
        canvasPointer = null;
        canvasHotbarPointer = false;
    };
    CANVAS.addEventListener("pointerup", finishCanvasTouch);
    CANVAS.addEventListener("pointercancel", finishCanvasTouch);

    window.addEventListener("blur", stopControls);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopControls();
    });
}

export function updateTouchControls() {
    const player = runtime.world?.player;
    const busy = !player || player.isDead || runtime.game?.pauseMenu?.getActive();
    controls?.classList.toggle("touch-busy", busy);
    controls?.classList.toggle("touch-inventory", !!player?.windowOpen);
    if (busy || player?.windowOpen) {
        for (const [pointer, action] of activePointers) {
            if (action === "use" || action === "pause") continue;
            input.setTouchAction(action, false);
            activePointers.delete(pointer);
            controls.querySelector(`[data-action="${action}"]`)?.classList.remove("pressed");
        }
    }
}
