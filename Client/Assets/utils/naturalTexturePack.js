import { resolveAssetUrl } from "./assetBundle.js";

export const NATURAL_TILES = [
    "grass_side", "dirt", "stone", "cobblestone",
    "log_oak", "planks_oak", "leaves_oak_opaque", "grass_top",
    "sand", "snow", "ice", "coal_ore",
    "iron_ore", "diamond_ore", "log_birch", "leaves_spruce_opaque",
];

export async function loadNaturalTexturePack() {
    const image = new Image();
    image.src = resolveAssetUrl("Assets/sprites/materials/terrain-atlas.png");
    await image.decode();
    const tiles = {};
    const tileWidth = image.width / 4, tileHeight = image.height / 4;
    for (let index = 0; index < NATURAL_TILES.length; index++) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, index % 4 * tileWidth, Math.floor(index / 4) * tileHeight,
            tileWidth, tileHeight, 0, 0, 32, 32);
        const pixels = ctx.getImageData(0, 0, 32, 32).data;
        const averageColor = { r: 0, g: 0, b: 0 };
        for (let i = 0; i < pixels.length; i += 4) {
            averageColor.r += pixels[i] / 1024;
            averageColor.g += pixels[i + 1] / 1024;
            averageColor.b += pixels[i + 2] / 1024;
        }
        tiles[`blocks/${NATURAL_TILES[index]}`] = {
            url: canvas.toDataURL(), width: 32, height: 32,
            originalWidth: 16, originalHeight: 16, averageColor,
        };
    }
    // Other oak-family foliage uses the same coherent palette; custom packs
    // are loaded separately and are never mixed with these replacements.
    tiles["blocks/leaves_birch_opaque"] = tiles["blocks/leaves_oak_opaque"];
    return tiles;
}
