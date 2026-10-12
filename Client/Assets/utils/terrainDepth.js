import { BLOCK_SIZE } from "./globals.js";
import { getBlock } from "../world/block.js";
import { getSpriteUrl } from "./texturePackLoader.js";
import { surfaceTexture } from "./surfaceTexture.js";

const DEPTH_X = 0.32;
const DEPTH_Y = 0.32;

// A shallow oblique projection of exposed terrain. The front face remains on
// the exact collision/selection grid; these extra faces are decoration only.
export class TerrainDepth {
    faceImage(sprite) {
        this.faceImages ||= new Map();
        const url = getSpriteUrl(`blocks/${sprite}`);
        let entry = this.faceImages.get(sprite);
        if (entry?.url !== url) {
            const image = new Image();
            image.src = url;
            entry = { image, url };
            this.faceImages.set(sprite, entry);
        }
        return entry.image.complete && entry.image.naturalWidth ? entry.image : null;
    }

    prepare(world, camera, width, height) {
        this.cells = new Map();
        this.visible = [];
        const size = BLOCK_SIZE;
        const left = Math.floor(camera.x / size) - 1;
        const top = Math.floor(camera.y / size) - 1;
        const right = Math.ceil((camera.x + width) / size) + 1;
        const bottom = Math.ceil((camera.y + height) / size) + 1;
        this.sample = (x, y) => {
            const key = `${x},${y}`;
            if (this.cells.has(key)) return this.cells.get(key);
            const block = world.getBlockAtWorldPosition(x * size, y * size);
            const def = block && getBlock(block.blockType);
            const solid = !!(def && !def.air && def.collision && !def.transparent
                && !def.fluid && !def.lightLevel && !block.cutoff
                && !def.blockOffset?.x && !def.blockOffset?.y);
            const cell = { block, def, solid, x, y };
            this.cells.set(key, cell);
            return cell;
        };
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) this.visible.push(this.sample(x, y));
        }
    }

    draw(ctx, camera) {
        const size = BLOCK_SIZE;
        const dx = Math.round(size * DEPTH_X);
        const dy = Math.round(size * DEPTH_Y);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // Clip to open foreground cells, so adjacent blocks always occlude
        // projected faces, including across chunk boundaries and in caves.
        ctx.beginPath();
        for (const cell of this.visible) {
            if (!cell.solid) ctx.rect(Math.round(cell.x * size - camera.x),
                Math.round(cell.y * size - camera.y), size, size);
        }
        ctx.clip();
        for (const { block, def, solid, x, y } of this.visible) {
            if (!solid || !block.img?.complete || !block.img.naturalWidth) continue;
            const sx = Math.round(x * size - camera.x);
            const sy = Math.round(y * size - camera.y);
            const textureSize = block.spriteSize;
            const brightness = block.getBrightness();
            if (!this.sample(x + 1, y).solid) {
                const side = def.faceSprites?.side && this.faceImage(def.faceSprites.side) || block.img;
                ctx.save();
                ctx.transform(dx / size, -dy / size, 0, 1, sx + size, sy);
                ctx.drawImage(side, 0, 0, side.width, side.width, 0, 0, size, size);
                ctx.fillStyle = `rgba(12,18,27,${1 - brightness * 0.58})`;
                ctx.fillRect(0, 0, size, size);
                ctx.restore();
            }
            if (!this.sample(x, y - 1).solid) {
                const top = def.faceSprites?.top && this.faceImage(def.faceSprites.top);
                ctx.save();
                ctx.transform(1, 0, -dx / size, dy / size, sx + dx, sy - dy);
                if (top) ctx.drawImage(top, 0, 0, top.width, top.width, 0, 0, size, size);
                else ctx.drawImage(surfaceTexture(block.img, def.sprite, textureSize), 0, 0,
                    textureSize, textureSize, 0, 0, size, size);
                ctx.fillStyle = "rgba(255,244,209,0.07)";
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = `rgba(8,14,24,${1 - brightness})`;
                ctx.fillRect(0, 0, size, size);
                ctx.restore();
            }
        }
        ctx.restore();
        // Contact shading only at exposed edges, never a bevel grid on dirt.
        ctx.save();
        for (const { solid, x, y } of this.visible) {
            if (!solid) continue;
            const sx = Math.round(x * size - camera.x);
            const sy = Math.round(y * size - camera.y);
            if (!this.sample(x, y - 1).solid) {
                ctx.fillStyle = "rgba(255,236,182,0.12)";
                ctx.fillRect(sx, sy, size, 2);
                ctx.fillStyle = "rgba(13,19,26,0.12)";
                ctx.fillRect(sx, sy + 2, size, 5);
            }
            if (!this.sample(x + 1, y).solid) {
                ctx.fillStyle = "rgba(9,16,26,0.18)";
                ctx.fillRect(sx + size - 4, sy, 4, size);
            }
            if (!this.sample(x, y + 1).solid) {
                ctx.fillStyle = "rgba(9,16,26,0.24)";
                ctx.fillRect(sx, sy + size - 5, size, 5);
            }
        }
        ctx.restore();
    }

    drawEntityShadow(ctx, entity, camera) {
        if (!entity.body || !entity.hitbox || entity.isDead) return;
        const size = BLOCK_SIZE;
        const center = entity.position.x + entity.hitbox.x / 2;
        const feet = entity.position.y + entity.hitbox.y;
        const column = Math.floor(center / size);
        const firstRow = Math.floor((feet - 1) / size);
        for (let row = firstRow; row <= firstRow + 3; row++) {
            if (!this.sample(column, row).solid) continue;
            const ground = row * size;
            const distance = Math.max(0, ground - feet);
            const strength = 1 - distance / (size * 3);
            if (strength <= 0 || ground < feet - 4) return;
            ctx.save();
            // Keep the contact shadow on the supporting ledge's top plane.
            ctx.beginPath();
            ctx.moveTo(column * size - camera.x, ground - camera.y);
            ctx.lineTo((column + 1) * size - camera.x, ground - camera.y);
            ctx.lineTo((column + 1 + DEPTH_X) * size - camera.x, ground - camera.y - size * DEPTH_Y);
            ctx.lineTo((column + DEPTH_X) * size - camera.x, ground - camera.y - size * DEPTH_Y);
            ctx.closePath();
            ctx.clip();
            ctx.fillStyle = `rgba(8,14,20,${0.28 * strength})`;
            ctx.beginPath();
            ctx.ellipse(center - camera.x + size * 0.10,
                ground - camera.y - size * 0.055,
                Math.max(size * 0.22, entity.hitbox.x * 0.65) * (0.65 + strength * 0.35),
                size * 0.065, -0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }
    }
}
