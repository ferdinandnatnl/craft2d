// Derive missing top faces from the active pack, shared by foreground and scenery.
const surfaces = new Map();

export function surfaceTexture(image, sprite, size = image?.width) {
    if (!image?.complete || !image.naturalWidth) return null;
    if (!sprite?.startsWith("grass_side") && sprite !== "dirt_podzol_side") return image;
    const cached = surfaces.get(sprite);
    if (cached?.source === image.src && cached.size === size) return cached.canvas;

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    // The first two texel rows contain grass (or snow), without the dirt face.
    const rim = Math.max(1, Math.round(size / 8));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const hash = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
            const texel = (Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0);
            ctx.drawImage(image, texel % size, (texel >>> 8) % rim,
                1, 1, x, y, 1, 1);
        }
    }
    surfaces.set(sprite, { source: image.src, size, canvas });
    return canvas;
}
