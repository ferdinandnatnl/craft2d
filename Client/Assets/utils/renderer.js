import { runtime } from "./runtime.js";
import { Camera } from "../game/camera.js";
import { Vector2 } from "./classes.js";
import {
    BLOCK_SIZE,
    CHUNK_FILE_SIZE,
    CHUNK_HEIGHT,
    CHUNK_WIDTH,
    RENDER_DISTANCE,
    TERRAIN_HEIGHT,
    url,
} from "./globals.js";
import { input } from "./input.js";
import { getSpriteSize, getSpriteUrl } from "./texturePackLoader.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import {
    activeDimension,
    Dimensions,
    getDimension,
    getDimensionChunks,
} from "../world/dimension.js";
import { CANVAS, ctx, r } from "./canvas.js";
import { ShaderRenderer } from "./shaderRenderer.js";
import { SkyRenderer } from "./skyRenderer.js";
import { BackgroundTerrain } from "./backgroundTerrain.js";
import { drawSceneLighting, drawLocalLighting } from "./sceneLighting.js";
import { TerrainDepth } from "./terrainDepth.js";
import { WaterSurface } from "./waterSurface.js";
import { VoxelRenderer } from "../rendering/voxelRenderer.js";

export { CANVAS, ctx, r };
const skyRenderer = new SkyRenderer();
const backgroundTerrain = new BackgroundTerrain();
const terrainDepth = new TerrainDepth();
const waterSurface = new WaterSurface();
const voxelRenderer = new VoxelRenderer(document.getElementById("voxel-canvas"));
let rendererMode = "voxel";
let shaderMode = "photon";
let voxelActive = false;

const shaderRenderer = new ShaderRenderer(
    CANVAS,
    document.getElementById("shader-canvas"),
);

export function setShaderMode(mode) {
    shaderMode = mode;
    shaderRenderer.setMode(rendererMode === "canvas" ? mode : "off");
    return mode;
}

export function setRendererMode(mode) {
    rendererMode = mode === "canvas" ? "canvas" : "voxel";
    shaderRenderer.setMode(rendererMode === "canvas" ? shaderMode : "off");
    return rendererMode;
}

runtime.drawingChunkBorders = false;
runtime.drawCameraOverlay = false;
runtime.drawHeightOverlay = false;
runtime.drawDebugMouseBlockOverlay = false;
runtime.drawFileSizeOverlay = false;
runtime.drawFpsOverlay = false;
runtime.drawHitbox = false;
runtime.drawCoordinatesOverlay = false;

runtime.cursorInRange = false;

runtime.hotbar = null;

export let fps;

export const camera = new Camera(0, CHUNK_HEIGHT * 2);
runtime.camera = camera;

export function drawBackground() {
    const dimension = getDimension(activeDimension);

    if (activeDimension === Dimensions.Overworld) {
        const biomes = new Map();
        skyRenderer.draw(ctx, {
            width: CANVAS.width,
            height: CANVAS.height,
            time: runtime.time,
            seconds: runtime.passedTime,
            cameraX: camera.x,
            cameraY: camera.y,
            surfaceY: (CHUNK_HEIGHT - TERRAIN_HEIGHT) * BLOCK_SIZE,
        });
        backgroundTerrain.draw(ctx, {
            width: CANVAS.width,
            height: CANVAS.height,
            cameraX: camera.x,
            cameraY: camera.y,
            surfaceY: (CHUNK_HEIGHT - TERRAIN_HEIGHT) * BLOCK_SIZE,
            time: runtime.time,
            seed: runtime.world?.seed,
            biomeAt: (x) => {
                const index = Math.floor(x / (CHUNK_WIDTH * BLOCK_SIZE));
                if (!biomes.has(index)) {
                    biomes.set(index, runtime.world?.getChunkForX(x)?.biome
                        || runtime.world?.generator.calculateChunkBiome(index));
                }
                return biomes.get(index);
            },
        });
        return;
    }

    // Calculate the color stops based on time
    const dayColor = dimension.backgroundGradient.dayColor;
    const nightColor = dimension.backgroundGradient.nightColor;
    const sunsetColor = dimension.backgroundGradient.sunsetColor;
    const midnightColor = dimension.backgroundGradient.midnightColor;

    const topColor = interpolateColor(
        nightColor,
        dayColor,
        Math.sin(runtime.time) * 0.5 + 0.5,
    );
    const bottomColor = interpolateColor(
        midnightColor,
        sunsetColor,
        Math.sin(runtime.time) * 0.5 + 0.5,
    );

    const gradient = ctx.createLinearGradient(0, CANVAS.height, 0, 0);

    if (!dimension.alwaysDay) {
        gradient.addColorStop(0, bottomColor); // Bottom color
        gradient.addColorStop(1, topColor); // Top color
    } else {
        gradient.addColorStop(0, sunsetColor);
        gradient.addColorStop(1, dayColor);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
}

export function interpolateColor(color1, color2, factor) {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
}

export function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    };
}

export function mouseOverPosition(x, y, sizeX, sizeY, world = false) {
    const mousePos = world
        ? input.getMouseWorldPosition()
        : input.getMousePosition();

    return (
        mousePos.x >= x &&
        mousePos.x <= x + sizeX &&
        mousePos.y >= y &&
        mousePos.y <= y + sizeY
    );
}

export function isColliding(pos1, size1, pos2, size2) {
    return (
        pos1.x < pos2.x + size2.x &&
        pos1.x + size1.x > pos2.x &&
        pos1.y < pos2.y + size2.y &&
        pos1.y + size1.y > pos2.y
    );
}

export function drawParticleEmitters() {
    for (const particleEmitter of runtime.world.particleEmitters) {
        particleEmitter.draw(camera);
    }
}

export function draw(chunks, frames) {
    fps = frames;

    voxelActive = rendererMode === "voxel" && voxelRenderer.render(runtime.world, camera, {
        width: CANVAS.width, height: CANVAS.height, dimension: activeDimension,
        time: runtime.time, seconds: runtime.passedTime,
        lighting: runtime.game.settings.lighting, effects: shaderMode !== "off",
    });
    document.body.classList.toggle("voxel-active", voxelActive);
    const classicShader = voxelActive ? "off" : shaderMode;
    if (shaderRenderer.mode !== classicShader) shaderRenderer.setMode(classicShader);
    if (voxelActive) ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    else {
    drawBackground();
    drawChunks(chunks);
    terrainDepth.prepare(runtime.world, camera, CANVAS.width, CANVAS.height);
    terrainDepth.draw(ctx, camera);
    if (shaderRenderer.mode !== "off" && activeDimension === Dimensions.Overworld) {
        drawSceneLighting(ctx, runtime.world, camera, runtime.time, CANVAS.width, CANVAS.height);
    }
    }

    if (!runtime.hideHud && runtime.world.player && !runtime.game.pauseMenu?.getActive() && !runtime.world.player.isDead) {
        drawBreakAndPlaceCursor(runtime.cursorInRange);
        drawDestroyStage();
    }

    drawMinionDestroyStages();
    drawParticleEmitters();

    drawEntities();
    drawDamageIndicators();
    drawMinionBlindness();

    if (!voxelActive && shaderRenderer.mode !== "off") {
        waterSurface.draw(ctx, terrainDepth, camera, runtime.passedTime);
        if (runtime.game.settings.lighting) {
            drawLocalLighting(ctx, runtime.world, terrainDepth, camera, runtime.time,
                runtime.passedTime, CANVAS.width, CANVAS.height);
        }
    }

    afterDraw();

    drawLoadScreen();
}

function drawMinionBlindness() {
    const player = runtime.world?.player;
    const remaining = (player?.minionBlindnessUntil || 0) - runtime.passedTime;
    if (remaining <= 0) return;
    const fade = Math.min(1, remaining / 2);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.42 * fade})`;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
    ctx.restore();
}


export function drawLoadScreen() {
    if (!runtime.isTexturePackLoaded || runtime.world?.generator?.loadingWorld) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

        ctx.fillStyle = "white";
        ctx.font = "30px Pixel";
        ctx.textAlign = "center";

        if (!runtime.isTexturePackLoaded)
            ctx.fillText(
                "Loading texture pack...",
                CANVAS.width / 2,
                CANVAS.height / 2,
            );
        else if (runtime.world?.generator?.loadingWorld)
            ctx.fillText(
                "Loading world...",
                CANVAS.width / 2,
                CANVAS.height / 2,
            );
    }

    shaderRenderer.render();
}

export function drawEntities() {
    runtime.world.entities.forEach((entity) => {
        if (entity.dimension !== activeDimension) return;
        if (voxelActive && entity.isBoat) return;
        if (
            Math.abs(
                Vector2.XDistance(
                    new Vector2(camera.getWorldX(camera.x), 0),
                    entity.position,
                ),
            ) <=
            RENDER_DISTANCE * 2 * BLOCK_SIZE * CHUNK_WIDTH
        ) {
            if (voxelActive && entity.body) {
                entity.drawFire?.();
                entity.drawOverride?.();
            } else {
                if (!voxelActive) terrainDepth.drawEntityShadow(ctx, entity, camera);
                entity.draw(ctx, camera);
            }
        } else {
            if (entity.despawn) {
                const chunk = getDimensionChunks(activeDimension).get(
                    entity.myChunkX,
                );
                if (chunk) chunk.removeEntityFromChunk(entity);

                runtime.world.removeEntity(entity);
            }
        }
    });

    if (runtime.drawHitbox) drawHitboxes();
}

function drawDamageIndicators() {
    const indicators = runtime.world?.damageIndicators;
    if (!indicators?.length) return;

    const visibleIndicators = [];
    for (const indicator of indicators) {
        const age = runtime.passedTime - indicator.createdAt;
        if (age < 0 || age >= 0.9) continue;
        visibleIndicators.push(indicator);
        if (indicator.dimension !== activeDimension) continue;

        const progress = age / 0.9;
        const label = `-${Number.isInteger(indicator.amount) ? indicator.amount : indicator.amount.toFixed(1)} hp`;
        const x = indicator.x - camera.x;
        const y = indicator.y - camera.y - progress * 42;

        ctx.save();
        ctx.globalAlpha = 1 - progress * progress;
        ctx.font = "20px Pixel";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#351b1b";
        ctx.fillStyle = "#ff6961";
        ctx.strokeText(label, x, y);
        ctx.fillText(label, x, y);
        ctx.restore();
    }

    runtime.world.damageIndicators = visibleIndicators;
}

export function drawBreakAndPlaceCursor(inRange = false) {
    const mouseX = input.getMousePositionOnBlockGrid().x;
    const mouseY = input.getMousePositionOnBlockGrid().y;

    const selectedBlock = runtime.world.player.inventory.selectedBlock;

    if (selectedBlock) {
        const spritePath = "blocks/" + selectedBlock.sprite;

        const spriteSize = getSpriteSize(spritePath).width;

        drawImage({
            url: getSpriteUrl(spritePath),
            x: mouseX - Math.floor(camera.x),
            y: mouseY - Math.floor(camera.y),
            scale: BLOCK_SIZE / spriteSize,
            centerX: false,
            opacity: 0.5,
            sizeY: spriteSize - selectedBlock.defaultCutoff * spriteSize,
        });
    }

    ctx.strokeStyle = inRange ? "black" : "red";
    ctx.lineWidth = 1;

    ctx.strokeRect(
        mouseX - Math.floor(camera.x),
        mouseY - Math.floor(camera.y),
        BLOCK_SIZE,
        BLOCK_SIZE,
    );
}

export function drawChunks(chunksMap) {
    const currentChunkX = camera.getCurrentChunkIndex(); // Get the x position of the current chunk

    runtime.world.chunks_in_render_distance.clear();

    for (let i = -RENDER_DISTANCE; i <= RENDER_DISTANCE; i++) {
        const chunkX = (currentChunkX + i) * CHUNK_WIDTH * BLOCK_SIZE; // Calculate the x position of the chunk to render
        // console.log(chunkX + " is " + chunksMap.has(chunkX));

        if (chunksMap.has(chunkX)) {
            runtime.world.chunks_in_render_distance.set(chunkX, chunksMap.get(chunkX));

            const chunk = chunksMap.get(chunkX);

            chunk.draw(ctx, camera);
            drawLate(chunk);
        }
    }
}

export function drawCoordinates() {
    if (!runtime.world.player) return;
    const blockPos = runtime.world.worldToBlocks(runtime.world.player.position);
    drawText({
        text: `x: ${Math.round(blockPos.x * 100) / 100} y: ${
            Math.round(blockPos.y * 100) / 100
        }`,
        x: 5,
        y: 20,
        size: 20,
        shadow: false,
        textAlign: "left",
        color: "black",
    });
}

export function drawCamera() {
    ctx.fillStyle = "white";
    ctx.fillRect(CANVAS.width / 2 - 2, CANVAS.height / 2 - 2, 14, 14);
    ctx.fillStyle = "black";
    ctx.fillRect(CANVAS.width / 2, CANVAS.height / 2, 10, 10);
}

export function drawLate(chunk) {
    if (runtime.drawingChunkBorders) drawChunkLine(chunk);
    if (runtime.drawHeightOverlay) drawHeight();
}

export function afterDraw() {
    if (runtime.hideHud && !runtime.game.chat.inChat && !runtime.world.player?.windowOpen) return;
    if (runtime.world.player && !runtime.world.player.isDead) {
        drawUI();
        if (!runtime.game.pauseMenu?.getActive()) drawCursor();
        if (runtime.drawCoordinatesOverlay) drawCoordinates();
    }
    if (runtime.drawCameraOverlay) drawCamera();
    if (runtime.drawDebugMouseBlockOverlay) drawDebugMouseBlock();
    if (runtime.drawFileSizeOverlay) drawExpectedFileSize();
    if (runtime.drawFpsOverlay) drawFps();
}

export function drawUI() {
    drawHotbar();
    drawInventory();
    runtime.game.chat.draw(ctx);
}

export function drawInventory() {
    if (!runtime.world.player.windowOpen) return;

    runtime.world.player.inventory.draw(ctx);
}

export function drawDestroyStage() {
    const player = runtime.world?.player;
    const target = player?.breakingTarget;
    if (!player || !target || target.blockType === Blocks.Air ||
        target.blockType !== player.breakingTargetBlockType) return;
    if (player.breakingStage == 0 || player.breakingStage > 10)
        return;

    const spriteSize = getSpriteSize(
        "blocks/destroy_stage_" + (player.breakingStage - 1),
    ).width;

    drawImage({
        url: getSpriteUrl(
            "blocks/destroy_stage_" + (player.breakingStage - 1),
        ),
        x: target.transform.position.x - Math.floor(camera.x),
        y: target.transform.position.y - Math.floor(camera.y),
        scale: BLOCK_SIZE / spriteSize,
        centerX: false,
    });
}

export function drawMinionDestroyStages() {
    for (const minion of runtime.world?.entities || []) {
        const target = minion.miningBlockPosition;
        const stage = minion.miningStage;
        if (!minion.isMinion || minion.dimension !== activeDimension ||
            !target || !Number.isInteger(stage) || stage < 1 || stage > 10) continue;
        const block = runtime.world.getBlockAtWorldPosition(
            target.x * BLOCK_SIZE,
            target.y * BLOCK_SIZE,
            false,
            minion.dimension,
        );
        if (!block || block.blockType === Blocks.Air) continue;

        const texture = `blocks/destroy_stage_${stage - 1}`;
        const spriteSize = getSpriteSize(texture).width;
        drawImage({
            url: getSpriteUrl(texture),
            x: target.x * BLOCK_SIZE - Math.floor(camera.x),
            y: target.y * BLOCK_SIZE - Math.floor(camera.y),
            scale: BLOCK_SIZE / spriteSize,
            centerX: false,
        });
    }
}


export function drawChunkLine(chunk) {
    const chunkX = chunk.x;
    ctx.strokeStyle = "red";
    ctx.beginPath();

    ctx.moveTo(0, 0 - camera.y);
    ctx.lineTo(CANVAS.width, 0 - camera.y);

    ctx.moveTo(chunkX - camera.x, 0);
    ctx.lineTo(chunkX - camera.x, CANVAS.height);

    ctx.stroke();

    drawChunkStats(chunk, chunkX);
}

export function drawCursor() {
    if (!runtime.world.player) return;

    if (runtime.world.player.windowOpen) {
        drawImage({
            url: getSpriteUrl("misc/cursor"),
            x: input.getMousePosition().x,
            y: input.getMousePosition().y,
            centerX: false,
        });
        return;
    }

    drawImage({
        url: getSpriteUrl("gui/icons"),
        x: input.getMousePosition().x,
        y: input.getMousePosition().y,
        scale: 3,
        centerY: true,
        crop: { x: 3, y: 3, width: 9, height: 9 },
    });
}

export function drawFps() {
    ctx.fillStyle = "black";
    ctx.font = "20px Pixel";
    ctx.textAlign = "right";

    ctx.fillText(fps, CANVAS.width - 10, CANVAS.height - 10);
}

export function drawChunkStats(chunk, chunkX) {
    ctx.textAlign = "left";
    const index = chunk.x / CHUNK_WIDTH / BLOCK_SIZE;
    const dimension = getDimension(activeDimension);
    const noiseMaps = dimension.noiseMaps;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const toUnit = (value, noise) => {
        const min = noise.min - noise.intensity * 0.5;
        const max = noise.min + noise.intensity * 0.5;
        if (max === min) return 0.5;
        return clamp((value - min) / (max - min), 0, 1);
    };

    const tempRaw = noiseMaps.temperature.getNoise(index, 20000);
    const wetRaw = noiseMaps.wetness.getNoise(index, 10000);
    const mountRaw = noiseMaps.mountains.getNoise(index, 30000);
    const tempUnit = toUnit(tempRaw, noiseMaps.temperature);
    const wetUnit = toUnit(wetRaw, noiseMaps.wetness);
    const mountUnit = toUnit(mountRaw, noiseMaps.mountains);

    ctx.fillStyle = "black";
    ctx.font = "15px Pixel";

    // Base text with biome details
    let txt = `${index} - ${chunk.biome.name}\nTemp: ${tempUnit.toFixed(
        2,
    )} (${Math.floor(tempRaw)})\nWetness: ${wetUnit.toFixed(2)} (${Math.floor(
        wetRaw,
    )})\nMountains: ${mountUnit.toFixed(2)} (${Math.floor(
        mountRaw,
    )})\nHeight: ${chunk.biome.heightNoise.scale * 1000} - ${
        chunk.biome.heightNoise.intensity
    }`;

    // Append "Next to" information only if previousBiome is different
    if (
        chunk.previousChunk &&
        chunk.previousChunk.biome.name !== chunk.biome.name
    ) {
        txt += `\nNext to: ${chunk.previousChunk.biome.name}`;
    }

    // Dimension information

    txt += `\nDimension: ${getDimension(chunk.dimension).name}`;

    // Split text by lines for rendering
    const lines = txt.split("\n");

    // Render each line of text
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], chunkX - camera.x + 10, 15 + i * 15, 9999);
    }
}

export function drawExpectedFileSize() {
    ctx.fillStyle = "black";
    ctx.font = "15px Pixel";
    ctx.textAlign = "left";

    ctx.fillText(
        "File size: " +
            (getDimensionChunks(activeDimension).size * CHUNK_FILE_SIZE + 5) +
            "kB",
        10,
        CANVAS.height - 10,
    );
}

export function drawHeight() {
    ctx.beginPath();

    // Get the world position at the leftmost visible edge of the screen
    const cameraWorldX =
        camera.getWorldX() - (RENDER_DISTANCE * CHUNK_WIDTH * BLOCK_SIZE) / 2;

    // Extend the range of the loop to draw a longer line (adjust multiplier to increase length)
    const extendedRenderDistance = RENDER_DISTANCE * 2; // Extend by a factor of 2 (or any factor you prefer)

    // Loop through visible blocks plus the extended distance
    for (let x = 0; x < extendedRenderDistance * CHUNK_WIDTH; x++) {
        // Calculate the world X position of the current block
        const worldX = cameraWorldX + x * BLOCK_SIZE;

        // Get the chunk corresponding to this block position
        const chunk = getDimensionChunks(activeDimension).get(
            Math.floor(worldX / (CHUNK_WIDTH * BLOCK_SIZE)) *
                CHUNK_WIDTH *
                BLOCK_SIZE,
        );

        if (!chunk) continue; // Skip if no chunk exists at this position

        // Get the noise height for this block's position
        const noiseHeight = chunk.getHeight(
            (worldX % (CHUNK_WIDTH * BLOCK_SIZE)) / BLOCK_SIZE,
        );

        // Calculate the screen Y position based on noise height
        const screenY = CANVAS.height - noiseHeight * BLOCK_SIZE;

        // Calculate the screen X position, adjusted based on camera's position
        const screenX = worldX - camera.getWorldX() + CANVAS.width / 2;

        // Move to the next point on the canvas and draw the line
        if (x === 0) {
            ctx.moveTo(screenX + 10, screenY - TERRAIN_HEIGHT - 100 - camera.y); // Move to the first block's position with offset
        } else {
            ctx.lineTo(screenX + 10, screenY - TERRAIN_HEIGHT - 100 - camera.y); // Draw a line to the next block's height
        }
    }

    // Set line style and stroke the line
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.stroke();
}

export function drawDebugMouseBlock() {
    r.style.setProperty("--drawMouse", "none");

    const mouseX = input.getMousePositionOnBlockGrid().x;
    const mouseY = input.getMousePositionOnBlockGrid().y;

    const topLeftX = mouseX;
    const topLeftY = mouseY;

    ctx.strokeStyle = "black";
    ctx.lineWidth = 5;

    // Draw the hollow square
    ctx.strokeRect(
        topLeftX - Math.floor(camera.x),
        topLeftY - Math.floor(camera.y),
        BLOCK_SIZE,
        BLOCK_SIZE,
    );

    ctx.lineWidth = 1;
}

export function drawHotbar() {
    if (!runtime.hotbar) return;

    runtime.hotbar.draw(ctx);
}

export function drawText({
    text,
    x,
    y,
    size = 25,
    shadow = true,
    textAlign = "right",
    color = "white",
    background = false,
}) {
    if (background) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";

        // Calculate the position based on text alignment
        const textWidth = ctx.measureText(text).width;
        let bgX = x - 5;
        let bgY = y - size * 0.8 - 1;
        let bgWidth = textWidth + 10;
        let bgHeight = size + 2;
        if (textAlign === "center") {
            bgX -= textWidth / 2;
        } else if (textAlign === "left") {
            bgX -= textWidth;
        }
        if (textAlign === "top") {
            bgY -= size;
        } else if (textAlign === "bottom") {
            bgY += size;
        }
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight); // Draw background rectangle
    }

    ctx.textAlign = textAlign;

    if (shadow) {
        ctx.fillStyle = "rgb(0, 0, 0, .7)";
        ctx.font = size + "px Pixel";

        ctx.fillText(text, x + 3, y + 3);
    }

    ctx.fillStyle = color;
    ctx.font = size + "px Pixel";

    ctx.fillText(text, x, y);
}

export function drawHitboxes() {
    runtime.world.entities.forEach((entity) => {
        entity.drawHitbox(ctx);
    });
}

export { drawSimpleImage } from "./drawHelpers.js";

export const imageCache = new Map();

export function drawImage({
    url,
    image,
    x = 0,
    y = 0,
    scale = 1,
    centerX = true,
    centerY = false,
    opacity = 1,
    sizeX = null,
    sizeY = null,
    dark = false,
    fixAnimation = false,
    frame = 0,
    crop = { x: 0, y: 0, width: 0, height: 0 },
} = {}) {
    if (!image && !url) return;

    let img = null;
    if (!image) {
        if (!imageCache.has(url)) {
            const newImg = new Image();
            newImg.src = url;

            // If it doesnt find the image, revert to the missing texture
            newImg.onerror = () => {
                newImg.src = getSpriteUrl("blocks/missing_texture");
            };

            imageCache.set(url, newImg);
        }
        img = imageCache.get(url);
    } else {
        img = image;
    }

    const shouldCrop = crop.width > 0 && crop.height > 0;
    const fullHeight = shouldCrop ? crop.height : img.height; // Full height of the base region

    // Function to handle the actual drawing
    function drawFrame() {
        ctx.globalAlpha = opacity;

        let sourceWidth, sourceHeight, sourceX, sourceY, drawWidth, drawHeight;

        if (fixAnimation) {
            // Fixed 16x16 animation mode
            sourceWidth = shouldCrop ? crop.width : 16; // Default to 16 if no crop
            sourceHeight = shouldCrop ? crop.height : 16; // Default to 16 if no crop
            sourceX = shouldCrop ? crop.x : 0; // No offset if not cropping
            sourceY = (shouldCrop ? crop.y : 0) + frame * 16; // Frame offset always applies
            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;
        } else {
            // Behavior with sizeY cropping from top
            sourceWidth =
                sizeX !== null ? sizeX : shouldCrop ? crop.width : img.width;
            sourceHeight =
                sizeY !== null ? Math.min(sizeY, fullHeight) : fullHeight; // Use sizeY, capped at full height
            sourceX = shouldCrop ? crop.x : 0; // Crop X or 0
            sourceY = shouldCrop ? crop.y : 0; // Start from top (crop.y or 0)
            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;
        }

        // Adjust position based on centering
        const drawX = centerX ? x - drawWidth / 2 : x;
        const drawY = centerY
            ? y - drawHeight / 2
            : y + (sizeY !== null ? (fullHeight - sourceHeight) * scale : 0); // Offset to align bottom

        // Draw the image
        ctx.drawImage(
            img,
            sourceX, // Source x
            sourceY, // Source y
            sourceWidth, // Source width
            sourceHeight, // Source height
            drawX, // Canvas x
            drawY, // Canvas y
            drawWidth, // Scaled width
            drawHeight, // Scaled height
        );

        // Apply dark overlay if specified
        if (dark) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = "black";
            ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
        }

        ctx.globalAlpha = 1;
    }

    // Handle image loading
    if (img.complete) {
        drawFrame(); // Draw immediately if loaded
    } else {
        img.onload = () => {
            drawFrame(); // Draw once loaded
        };
    }

    // Return drawn position and size
    const drawWidthFinal =
        (sizeX !== null ? sizeX : shouldCrop ? crop.width : img.width) * scale;
    const drawHeightFinal =
        (sizeY !== null
            ? Math.min(sizeY, fullHeight)
            : shouldCrop
              ? crop.height
              : img.height) * scale;
    return {
        x: centerX ? x - drawWidthFinal / 2 : x,
        y: centerY ? y - drawHeightFinal / 2 : y,
        sizeX: drawWidthFinal,
        sizeY: drawHeightFinal,
    };
}

export function drawRect({
    x,
    y,
    width,
    height,
    color = "black",
    opacity = 1,
    stroke = false,
    lineWidth = 1,
} = {}) {
    ctx.globalAlpha = opacity;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);

    if (stroke) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x, y, width, height);
    }

    ctx.globalAlpha = 1;
}
