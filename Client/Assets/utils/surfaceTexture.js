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
    const grassSide = sprite === "grass_side";
    // Keep the color variation across both grass rows, but exclude dirt-colored
    // edge pixels so they do not repeat as specks on the top face.
    const rim = Math.max(1, Math.round(size / 8));
    let grassPixels = null;
    if (grassSide) {
        ctx.drawImage(image, 0, 0, size, rim, 0, 0, size, rim);
        grassPixels = ctx.getImageData(0, 0, size, rim).data;
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const hash = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
            const texel = (Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0);
            const sourceX = texel % size;
            let sourceY = (texel >>> 8) % rim;
            if (grassPixels) {
                const pixel = (sourceY * size + sourceX) * 4;
                if (grassPixels[pixel + 1] <= grassPixels[pixel] ||
                    grassPixels[pixel + 1] <= grassPixels[pixel + 2]) {
                    sourceY = 0;
                }
            }
            ctx.drawImage(image, sourceX, sourceY, 1, 1, x, y, 1, 1);
        }
    }
    surfaces.set(sprite, { source: image.src, size, canvas });
    return canvas;
}
