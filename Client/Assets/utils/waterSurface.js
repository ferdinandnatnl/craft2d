import { BLOCK_SIZE } from "./globals.js";

// Reflections use the rendered scene, not a second world or fluid simulation.
export class WaterSurface {
    constructor() {
        this.scene = document.createElement("canvas");
        this.ctx = this.scene.getContext("2d");
    }

    draw(ctx, terrain, camera, seconds) {
        const water = terrain.visible.filter(({ def }) => def?.fluid && def.extinguishEntity);
        const surfaces = water.filter(({ x, y }) => !terrain.sample(x, y - 1).def?.fluid);
        if (!surfaces.length) return;
        const { width, height } = ctx.canvas;
        if (this.scene.width !== width || this.scene.height !== height) {
            this.scene.width = width;
            this.scene.height = height;
        }
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.drawImage(ctx.canvas, 0, 0);
        const size = BLOCK_SIZE;
        ctx.save();
        ctx.beginPath();
        for (const { x, y, block } of water) {
            const cutoff = block.cutoff || 0;
            ctx.rect(Math.round(x * size - camera.x), Math.round((y + cutoff) * size - camera.y),
                size, Math.ceil(size * (1 - cutoff)));
        }
        ctx.clip();
        for (const { x, y, block } of surfaces) {
            const sx = Math.round(x * size - camera.x);
            const sy = Math.round((y + (block.cutoff || 0)) * size - camera.y);
            const depth = Math.min(size * 3, height - sy, sy);
            if (depth <= 0) continue;
            const light = block.getBrightness();
            for (let d = 0; d < depth; d += 3) {
                const wave = Math.sin((y * size + d) * 0.15 + seconds * 1.6) * (1 + d * 0.025);
                ctx.globalAlpha = (0.12 + light * 0.28) * (1 - d / depth);
                ctx.drawImage(this.scene, sx + wave, sy - d - 3, size, 3, sx, sy + d, size, 3);
            }
            ctx.globalAlpha = 0.12 + light * 0.36;
            ctx.fillStyle = "#c2dfec";
            ctx.fillRect(sx, sy, size, 2);
            ctx.globalAlpha *= 0.6;
            const ripple = ((seconds * 9 + x * 13) % size + size) % size;
            ctx.fillRect(sx + ripple, sy + 5, Math.min(14, size - ripple), 1);
        }
        ctx.restore();
    }
}
