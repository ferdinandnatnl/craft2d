import { getSpriteUrl } from "./texturePackLoader.js";
import { surfaceTexture } from "./surfaceTexture.js";
import { getBlock } from "../world/block.js";

const LAYERS = [
    { tile: 12, parallax: 0.12, base: 0.48, rise: 150, haze: 0.70 },
    { tile: 18, parallax: 0.20, base: 0.54, rise: 200, haze: 0.51 },
    { tile: 25, parallax: 0.30, base: 0.60, rise: 245, haze: 0.33 },
    { tile: 32, parallax: 0.42, base: 0.68, rise: 280, haze: 0.16 },
];
const random = (x, seed) => {
    const value = Math.sin(x * 127.1 + seed * 17.7) * 43758.5453;
    return value - Math.floor(value);
};
function noise(x, seed) {
    const index = Math.floor(x);
    const fraction = x - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    return random(index, seed) * (1 - blend) + random(index + 1, seed) * blend;
}

// Distant blocks reuse biome materials and tree shapes, but never enter the world save.
export class BackgroundTerrain {
    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.images = new Map();
        this.patterns = new Map();
    }

    sprite(name) {
        if (!name) return null;
        const url = getSpriteUrl(`blocks/${name}`);
        let entry = this.images.get(name);
        if (entry?.url !== url) {
            const image = new Image();
            image.src = url;
            entry = { image, url };
            this.images.set(name, entry);
            this.patterns.clear();
        }
        return entry.image.complete && entry.image.naturalWidth > 0 ? entry.image : null;
    }

    pattern(name, tile, top = false) {
        const image = this.sprite(name);
        if (!image) return "#526b39";
        const key = `${name}:${tile}:${top}`;
        if (this.patterns.has(key)) return this.patterns.get(key);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = tile;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const texture = top ? surfaceTexture(image, name) : image;
        ctx.drawImage(texture, 0, 0, image.width, image.width, 0, 0, tile, tile);
        const pattern = this.ctx.createPattern(canvas, "repeat");
        this.patterns.set(key, pattern);
        return pattern;
    }

    drawSprite(name, x, y, size) {
        const image = this.sprite(name);
        if (image) this.ctx.drawImage(image, 0, 0, image.width, image.width, x, y, size, size);
    }

    drawTree(tree, detail, x, y, tile) {
        const variants = tree?.variants;
        if (!variants?.length) return;
        const shape = variants[Math.floor(detail * variants.length) % variants.length].blocks;
        const origin = x - Math.floor(shape[0].length / 2) * tile;
        for (let row = 0; row < shape.length; row++) {
            for (let column = 0; column < shape[row].length; column++) {
                const block = getBlock(shape[row][column]);
                if (!block || block.air) continue;
                this.drawSprite(block.sprite, origin + column * tile, y - (shape.length - row) * tile, tile);
            }
        }
    }

    draw(target, { width, height, cameraX, cameraY, surfaceY, time, seed = 0, biomeAt }) {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.patterns.clear();
        }
        let worldSeed = 0;
        for (const letter of String(seed)) worldSeed = (worldSeed * 31 + letter.charCodeAt(0)) | 0;
        worldSeed = (worldSeed >>> 0) % 10007;
        const daylight = Math.max(0, Math.min(1, (Math.sin(time) + 0.18) / 0.65));
        const ctx = this.ctx;
        for (let layer = 0; layer < LAYERS.length; layer++) {
            const { tile, parallax, base, rise, haze } = LAYERS[layer];
            const offset = cameraX * parallax;
            const baseline = Math.round(height * base
                + (surfaceY - 768 - cameraY - height / 2) * parallax);
            const first = Math.floor(offset / tile) - 8;
            const last = Math.ceil((offset + width) / tile) + 8;
            const layerSeed = worldSeed + layer * 123;
            const topAt = (column) => -Math.round((
                noise(column / 28, layerSeed) * rise
                + noise(column / 9, layerSeed + 37) * rise * 0.3
            ) / tile) * tile;
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(-Math.round(offset), baseline);
            for (let column = first; column <= last; column++) {
                const biome = biomeAt(column * tile);
                if (!biome) continue;
                const x = column * tile, y = topAt(column);
                if (y + baseline >= height) continue;
                const surface = getBlock(biome.topLayer).sprite;
                const earth = getBlock(biome.secondLayer).sprite;
                // The broad grassy planes face the sky. Only exposed steps show
                // dirt, so distant hills no longer look like vertical dirt walls.
                ctx.fillStyle = this.pattern(surface, tile, true);
                ctx.fillRect(x, y, tile, height - baseline - y);
                const nextTop = topAt(column + 1);
                if (nextTop > y) {
                    ctx.fillStyle = this.pattern(earth, tile);
                    ctx.fillRect(x + tile * 0.72, y + tile * 0.28, tile * 0.28, nextTop - y);
                    ctx.fillStyle = "rgba(19,29,22,0.24)";
                    ctx.fillRect(x + tile * 0.72, y + tile * 0.28, tile * 0.28, nextTop - y);
                }
                ctx.fillStyle = `rgba(23,45,24,${0.18 + noise(column / 7, layerSeed) * 0.16})`;
                ctx.fillRect(x, y, tile, height - baseline - y);
                ctx.fillStyle = "rgba(239,237,183,0.12)";
                ctx.fillRect(x, y, tile, Math.max(1, tile * 0.09));
            }
            for (let column = first; column <= last; column++) {
                const x = column * tile, y = topAt(column);
                if (y + baseline < -tile * 16 || y + baseline > height + tile * 16) continue;
                const biome = biomeAt(x);
                if (!biome) continue;
                const detail = random(column, layerSeed + 89);
                if (detail > 0.96 && biome.grassType.length) {
                    const plantType = biome.grassType[Math.floor(random(column, layerSeed + 433) * biome.grassType.length)];
                    const plant = getBlock(plantType);
                    const sparsePlant = plant.sprite === "deadbush" || plant.sprite.startsWith("flower_") || plant.sprite.startsWith("double_plant_");
                    if (!sparsePlant || random(column, layerSeed + 241) < 0.15) {
                        this.drawSprite(plant.sprite, x, y - tile, tile);
                    }
                }
                if (((column % 19) + 19) % 19 === 5 && detail > 0.30 && biome.treeType.length) {
                    const tree = biome.treeType[Math.floor(detail * biome.treeType.length) % biome.treeType.length];
                    this.drawTree(tree, detail, x, y, tile);
                }
            }
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = "source-atop";
            ctx.fillStyle = `rgba(154,185,201,${haze})`;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = `rgba(7,15,32,${(1 - daylight) * 0.92})`;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
            target.drawImage(this.canvas, 0, 0);
        }
    }
}
