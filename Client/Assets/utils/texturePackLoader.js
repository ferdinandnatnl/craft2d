import { runtime } from "./runtime.js";
import JSZip from "jszip";
import { entityRegistry } from "../entities/entityRegistry.js";
import { getItem, getItemSpritePath } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { getFromLdb } from "./indexDB.js";
import { blockRegistry } from "@2dcraft.com/shared/blockRegistry.js";
import "@2dcraft.com/shared/blocks.js";
import { resolveAssetUrl } from "./assetBundle.js";
import { loadNaturalTexturePack } from "./naturalTexturePack.js";

export let texturePackZip = null;
export let texturePackFiles = null;
export let vanillaTextureCache = null;
let spawnEggTextureCache = {};

// Load vanilla textures by iterating over Blocks and Items
export async function loadVanillaTextures(onProgress) {
    vanillaTextureCache = {};

    // Collect sprite paths from Blocks and Items
    const spritePaths = [];

    // Loop through Blocks
    const Blocks = blockRegistry.Blocks;
    const getBlock = runtime.getBlock;
    if (Blocks && typeof getBlock === "function") {
        for (const blockKey in Blocks) {
            const block = getBlock(Blocks[blockKey]);
            if (block?.iconSprite) {
                spritePaths.push(`blocks/${block.iconSprite}`);
            }
        }
    } else {
        console.warn(
            "Block registry not ready during vanilla texture load; skipping block sprites.",
        );
    }

    // Loop through Items
    for (const itemKey in Items) {
        const item = getItem(Items[itemKey]);
        if (item?.sprite) {
            spritePaths.push(`items/${item.sprite}`);
        }
    }

    // Loop through Entities
    const Entities = entityRegistry.Entities;
    if (Entities) {
        // Entity constructors are inspected before a world exists. A few
        // constructors register themselves with their world to find a chunk,
        // so provide the harmless lookup they need while reading body sprites.
        const textureInspectionWorld = {
            getChunkForX: () => null,
        };
        for (const entityKey in Entities) {
            const entity = Entities[entityKey];
            try {
                const initEntity = new entity(textureInspectionWorld);
                if (initEntity.body?.sprite) {
                    spritePaths.push(`entity/${initEntity.body.sprite}`);
                }
                for (const part of Object.values(initEntity.body?.parts ?? {})) {
                    if (part.ownSpriteMap) {
                        spritePaths.push(`entity/${part.ownSpriteMap}`);
                    }
                }
            } catch (error) {
                console.warn(
                    `Could not inspect textures for entity ${entityKey}; continuing startup.`,
                    error,
                );
            }
        }
    }

    // Misc Entity Sprites
    spritePaths.push(`entity/sheep/sheep_fur`);
    spritePaths.push(`entity/warden-art/warden.svg`);
    spritePaths.push(`items/spawn_egg_overlay`);
    spritePaths.push(`items/mutantbeasts/spawn_egg_overlay`);
    spritePaths.push(`items/minecart_normal`);
    spritePaths.push(`items/minecart_chest`);

    // Player
    spritePaths.push(`entity/player/steve`);

    // All GUI elements
    spritePaths.push(`gui/icons`);
    spritePaths.push(`gui/widgets`);
    spritePaths.push(`gui/container/anvil`);
    spritePaths.push(`gui/container/beacon`);
    spritePaths.push(`gui/container/brewing_stand`);
    spritePaths.push(`gui/container/converter`);
    spritePaths.push(`gui/container/crafting_table`);
    spritePaths.push(`gui/container/dispenser`);
    spritePaths.push(`gui/container/enchanting_table`);
    spritePaths.push(`gui/container/furnace`);
    spritePaths.push(`gui/container/generic_54`);
    spritePaths.push(`gui/container/hopper`);
    spritePaths.push(`gui/container/horse`);
    spritePaths.push(`gui/container/inventory`);
    spritePaths.push(`gui/container/creative_inventory/tab_items`);
    spritePaths.push(`gui/container/creative_inventory/tab_item_search`);
    spritePaths.push(`gui/container/creative_inventory/tab_inventory`);
    spritePaths.push(`gui/container/creative_inventory/tabs`);
    spritePaths.push(`gui/container/single_chest`);
    spritePaths.push(`gui/container/stats_icons`);
    spritePaths.push(`gui/container/villager`);

    // Particle textures
    spritePaths.push(`particle/particles`);

    // Remove duplicates (if any)
    const uniquePaths = [...new Set(spritePaths)];

    let loaded = 0;
    await Promise.all(
        uniquePaths.map(async (path) => {
            const spritePath = /\.(?:png|svg|webp)$/i.test(path)
                ? path
                : `${path}.png`;
            const imgUrl = resolveAssetUrl(`Assets/sprites/${spritePath}`);
            try {
                const img = await loadImage(imgUrl);
                vanillaTextureCache[path] = {
                    url: imgUrl,
                    image: isSpawnEggTexture(path) ? img : null,
                    width: img?.width || 16,
                    height: img?.height || 16,
                    originalWidth: img?.width || 16,
                    originalHeight: img?.height || 16,
                    averageColor: img && path.startsWith("blocks/")
                        ? await getAverageColor(img) : "#000000",
                };
            } catch (err) {
                console.warn(`Failed to load vanilla texture ${path}:`, err);
                vanillaTextureCache[path] = {
                    url: imgUrl,
                    width: 16,
                    height: 16,
                    originalWidth: 16,
                    originalHeight: 16,
                    averageColor: "#000000",
                };
            } finally {
                onProgress?.(++loaded / uniquePaths.length);
            }
        })
    );
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            img.src = "";
            reject(new Error(`Timed out loading image: ${url.slice(0, 120)}`));
        }, 15000);
        img.onload = () => {
            clearTimeout(timeout);
            resolve(img);
        };
        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`Could not load image: ${url.slice(0, 120)}`));
        };
        img.src = url;
    });
}

// Load the active texture pack from localStorage
export async function loadTexturePack(onProgress) {
    const currentPackKey =
        localStorage.getItem("currentTexturePack") || "default";
    spawnEggTextureCache = {};
    runtime.isTexturePackLoaded = false;

    // Load vanilla textures first
    await loadVanillaTextures((progress) => onProgress?.(progress * 0.9));

    if (["default", "classic", "natural"].includes(currentPackKey)) {
        texturePackZip = null;
        texturePackFiles = null;
        if (currentPackKey === "natural") {
            try {
                texturePackFiles = await loadNaturalTexturePack();
            } catch (error) {
                console.warn("Natural textures could not load; using Classic textures.", error);
            }
        }
        await buildSpawnEggTextures();
        runtime.isTexturePackLoaded = true;
        onProgress?.(1);
        return;
    }

    try {
        const texturePackData = await getFromLdb(
            `texturePack_${currentPackKey}`
        );
        if (!texturePackData) {
            console.warn(
                `No texture pack found for key: ${currentPackKey}, using default.`
            );
            texturePackZip = null;
            texturePackFiles = null;
            await buildSpawnEggTextures();
            runtime.isTexturePackLoaded = true;
            localStorage.setItem("currentTexturePack", "default");
            onProgress?.(1);
            return;
        }

        const base64Data =
            typeof texturePackData === "string" &&
            texturePackData.startsWith("data:") &&
            texturePackData.includes(",")
                ? texturePackData.slice(texturePackData.indexOf(",") + 1)
                : texturePackData;

        const zip = await JSZip.loadAsync(base64Data, { base64: true });
        texturePackZip = zip;
        texturePackFiles = {};

        await Promise.all(
            Object.keys(zip.files).map(async (fileName) => {
                if (!fileName.endsWith(".png")) return;

                const fileContent = await zip.files[fileName].async("base64");
                const imgUrl = `data:image/png;base64,${fileContent}`;

                try {
                    const img = await loadImage(imgUrl);
                    const relativePath = fileName
                        .replace(/^.*assets\/minecraft\/textures\//, "")
                        .replace(/\.png$/, "");
                    const originalSize = vanillaTextureCache[relativePath] || { width: 16, height: 16 };
                    texturePackFiles[relativePath] = {
                        url: imgUrl,
                        image: isSpawnEggTexture(relativePath) ? img : null,
                        width: img.width,
                        height: img.height,
                        originalWidth: originalSize.width,
                        originalHeight: originalSize.height,
                        averageColor: relativePath.startsWith("blocks/")
                            ? await getAverageColor(img) : "#000000",
                    };
                } catch (error) {
                    console.warn(`Skipping invalid texture pack image ${fileName}:`, error);
                }
            })
        );

        await buildSpawnEggTextures();
        runtime.isTexturePackLoaded = true;
        onProgress?.(1);
    } catch (err) {
        console.error(`Failed to load texture pack ${currentPackKey}:`, err);
        texturePackZip = null;
        texturePackFiles = null;
        await buildSpawnEggTextures();
        runtime.isTexturePackLoaded = true;
        localStorage.setItem("currentTexturePack", "default");
        onProgress?.(1);
    }
}

// Initialize both vanilla and texture pack loading
export async function initializeTextures(onProgress) {
    await loadTexturePack(onProgress);
}

export function getSpriteUrl(path, useTexturePack = true) {
    // If undefined is anywhere in the path, return a placeholder
    if (path === undefined || path.includes("undefined")) {
        return resolveAssetUrl(`Assets/sprites/blocks/missing_texture.png`);
    }

    if (isBase64(path)) {
        const base64Index = path.indexOf("data:image/png;base64,");
        return path.substring(base64Index);
    }

    if (spawnEggTextureCache[path]) {
        return spawnEggTextureCache[path].url;
    }

    if (useTexturePack && texturePackFiles && texturePackFiles[path]) {
        return texturePackFiles[path].url;
    }

    if (vanillaTextureCache && vanillaTextureCache[path]) {
        return vanillaTextureCache[path].url;
    }

    const spawnEggBasePath = getSpawnEggBasePath(path);
    if (spawnEggBasePath) return getSpriteUrl(spawnEggBasePath, useTexturePack);

    const spritePath = /\.(?:png|svg|webp)$/i.test(path)
        ? path
        : `${path}.png`;
    return resolveAssetUrl(`Assets/sprites/${spritePath}`);
}

export function getSpriteAverageColor(path) {
    if (isBase64(path)) {
        return { r: 0, g: 0, b: 0 }; // Base64 images not cached
    }

    if (spawnEggTextureCache[path]) {
        return spawnEggTextureCache[path].averageColor;
    }

    if (texturePackFiles && texturePackFiles[path]) {
        return texturePackFiles[path].averageColor;
    }

    if (vanillaTextureCache && vanillaTextureCache[path]) {
        return vanillaTextureCache[path].averageColor;
    }

    const spawnEggBasePath = getSpawnEggBasePath(path);
    if (spawnEggBasePath) return getSpriteAverageColor(spawnEggBasePath);

    return { r: 0, g: 0, b: 0 }; // Default if not found
}

export function getSpriteSize(path) {
    if (isBase64(path)) {
        return {
            width: 0,
            height: 0,
            originalWidth: 0,
            originalHeight: 0,
        };
    }

    if (spawnEggTextureCache[path]) {
        const { width, height, originalWidth, originalHeight } =
            spawnEggTextureCache[path];
        return { width, height, originalWidth, originalHeight };
    }

    if (texturePackFiles && texturePackFiles[path]) {
        const { width, height, originalWidth, originalHeight } =
            texturePackFiles[path];
        return { width, height, originalWidth, originalHeight };
    }

    if (vanillaTextureCache && vanillaTextureCache[path]) {
        const { width, height, originalWidth, originalHeight } =
            vanillaTextureCache[path];
        return { width, height, originalWidth, originalHeight };
    }

    const spawnEggBasePath = getSpawnEggBasePath(path);
    if (spawnEggBasePath) return getSpriteSize(spawnEggBasePath);

    return {
        width: 16,
        height: 16,
        originalWidth: 16,
        originalHeight: 16,
    };
}

async function buildSpawnEggTextures() {
    try {
        const output = {};

        for (const itemId of new Set(Object.values(Items))) {
            const item = getItem(itemId);
            if (!item?.spawnEggColors) continue;

            const basePath = `items/${item.sprite}`;
            const overlayPath = `items/${item.sprite.replace(/spawn_egg$/, "spawn_egg_overlay")}`;
            const baseTexture =
                texturePackFiles?.[basePath] ?? vanillaTextureCache?.[basePath];
            const overlayTexture =
                texturePackFiles?.[overlayPath] ?? vanillaTextureCache?.[overlayPath];
            const baseImage = baseTexture?.image;
            const overlayImage = overlayTexture?.image;
            if (!baseImage || !overlayImage) continue;

            const width = baseImage.naturalWidth || baseImage.width;
            const height = baseImage.naturalHeight || baseImage.height;
            const originalWidth = baseTexture.originalWidth ?? baseTexture.width ?? width;
            const originalHeight = baseTexture.originalHeight ?? baseTexture.height ?? height;

            const baseColor = parseHexColor(item.spawnEggColors.baseColor);
            const overlayColor = parseHexColor(item.spawnEggColors.overlayColor);
            if (!baseColor || !overlayColor) continue;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.imageSmoothingEnabled = false;
            context.drawImage(
                createTintedLayer(baseImage, baseColor, width, height),
                0,
                0,
            );
            context.drawImage(
                createTintedLayer(overlayImage, overlayColor, width, height),
                0,
                0,
            );

            const path = `items/${getItemSpritePath(itemId)}`;
            output[path] = {
                url: canvas.toDataURL("image/png"),
                width,
                height,
                originalWidth,
                originalHeight,
                averageColor: "#000000",
            };
        }

        spawnEggTextureCache = output;
    } catch (error) {
        spawnEggTextureCache = {};
        console.warn("Spawn egg textures could not be colorized:", error);
    }
}

function createTintedLayer(image, tint, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = Math.round(pixels.data[index] * tint[0] / 255);
        pixels.data[index + 1] = Math.round(pixels.data[index + 1] * tint[1] / 255);
        pixels.data[index + 2] = Math.round(pixels.data[index + 2] * tint[2] / 255);
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
}

function parseHexColor(value) {
    const match = /^#?([\da-f]{6})$/i.exec(value ?? "");
    if (!match) return null;
    return [0, 2, 4].map((offset) =>
        Number.parseInt(match[1].slice(offset, offset + 2), 16),
    );
}

function isSpawnEggTexture(path) {
    return /^items\/(?:mutantbeasts\/)?spawn_egg(?:_overlay)?$/.test(path);
}

function getSpawnEggBasePath(path) {
    return /^(items\/(?:mutantbeasts\/)?spawn_egg)\/\d+$/.exec(path)?.[1] ?? null;
}

export function isEqualToOriginal(path) {
    const spriteSize = getSpriteSize(path);

    if (
        !spriteSize ||
        !spriteSize.originalWidth ||
        !spriteSize.originalHeight
    ) {
        return false;
    }

    return (
        spriteSize.width == spriteSize.originalWidth &&
        spriteSize.height == spriteSize.originalHeight
    );
}

// waitForTexturePack is now a method on the Game class

export function isBase64(str) {
    try {
        return (
            typeof str === "string" && str.includes("data:image/png;base64,")
        );
    } catch {
        return false;
    }
}

export async function getAverageColor(img) {
    try {
        // Particles need a rough color, not a full-resolution pixel scan.
        const offscreen = document.createElement("canvas");
        offscreen.width = offscreen.height = 8;
        const ctx = offscreen.getContext("2d");
        ctx.drawImage(img, 0, 0, 8, 8);

        // Get pixel data
        const imageData = ctx.getImageData(
            0,
            0,
            8,
            8
        ).data;
        let r = 0,
            g = 0,
            b = 0,
            count = 0;

        // Iterate through pixels
        for (let i = 0; i < imageData.length; i += 4) {
            const alpha = imageData[i + 3];
            if (alpha > 0) {
                // Only count non-transparent pixels
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
                count++;
            }
        }

        if (count === 0) {
            return "#000000"; // Default for fully transparent images
        }

        // Convert to hex
        const avgR = Math.round(r / count);
        const avgG = Math.round(g / count);
        const avgB = Math.round(b / count);
        return `#${avgR.toString(16).padStart(2, "0")}${avgG
            .toString(16)
            .padStart(2, "0")}${avgB
            .toString(16)
            .padStart(2, "0")}`.toUpperCase();
    } catch (err) {
        console.warn(`Failed to compute average color:`, err);
        return "#000000";
    }
}
