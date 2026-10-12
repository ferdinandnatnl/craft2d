import { BLOCK_SIZE } from "./globals.js";
import { getBlock } from "../world/block.js";
import { daylightFactor } from "./daylight.js";

// A bounded, render-only sunlight pass. No changes to gameplay light levels.
export function drawSceneLighting(ctx, world, camera, time, width, height) {
    const daylight = daylightFactor(time) * Math.max(0.25, Math.sin(time));
    if (daylight === 0) return;
    const size = BLOCK_SIZE;
    const firstX = Math.floor(camera.x / size);
    const firstY = Math.floor(camera.y / size);
    const columns = Math.ceil(width / size) + 1;
    const rows = Math.ceil(height / size) + 1;
    const cells = new Map();
    const sample = (x, y) => {
        const key = `${x},${y}`;
        if (cells.has(key)) return cells.get(key);
        let block = world.getBlockAtWorldPosition(x * size, y * size);
        let def = block && getBlock(block.blockType);
        if (!def || def.air) {
            block = world.getBlockAtWorldPosition(x * size, y * size, true);
            def = block && getBlock(block.blockType);
        }
        const solid = def && !def.air && !def.transparent && !def.fluid
            && !block.cutoff && !def.lightLevel;
        cells.set(key, !!solid);
        return !!solid;
    };
    // Match the sun's direction; bound the slope near the horizon.
    const slope = -Math.cos(time) / Math.max(0.45, daylight);
    ctx.save();
    for (let y = firstY; y < firstY + rows; y++) {
        for (let x = firstX; x < firstX + columns; x++) {
            if (!sample(x, y)) continue;
            let cover = 0;
            for (let step = 1; step <= 8; step++) {
                if (sample(x + Math.round(slope * step), y - step)) cover++;
            }
            let depth = 0;
            while (depth < 5 && sample(x, y - depth - 1)) depth++;
            const screenX = Math.round(x * size - camera.x);
            const screenY = Math.round(y * size - camera.y);
            const shade = daylight * (0.05 + depth * 0.035 + Math.min(cover, 3) * 0.045);
            ctx.fillStyle = `rgba(21,30,44,${shade})`;
            ctx.fillRect(screenX, screenY, size, size);
            if (!sample(x, y - 1)) {
                // A warm exposed rim makes the block face read separately
                // from its top; the shadow test includes tree trunks/leaves.
                ctx.fillStyle = `rgba(255,226,157,${daylight * (cover ? 0.10 : 0.36)})`;
                ctx.fillRect(screenX, screenY, size, 4);
            }
            const sunSide = slope < 0 ? -1 : 1;
            if (!sample(x + sunSide, y)) {
                ctx.fillStyle = `rgba(255,221,158,${daylight * 0.13})`;
                ctx.fillRect(screenX + (sunSide < 0 ? 0 : size - 3), screenY, 3, size);
            }
        }
    }
    ctx.restore();
}

// A tint over the existing gameplay light map. Opaque foreground blocks stop
// the rays; background cave walls receive light without hiding the cave itself.
export function drawLocalLighting(ctx, world, terrain, camera, time, seconds, width, height) {
    const size = BLOCK_SIZE;
    const reach = 7;
    const left = Math.floor(camera.x / size) - reach;
    const top = Math.floor(camera.y / size) - reach;
    const right = Math.ceil((camera.x + width) / size) + reach;
    const bottom = Math.ceil((camera.y + height) / size) + reach;
    const sources = [];
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const cell = terrain.sample(x, y);
            let block = cell.block;
            if (!block?.lightSourceLevel && !cell.solid) {
                block = world.getBlockAtWorldPosition(x * size, y * size, true);
            }
            if (!(block?.lightSourceLevel > 0)) continue;
            // Internal lava cells cannot light the surface and need no pass.
            if (cell.def?.fluid && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(
                ([dx, dy]) => terrain.sample(x + dx, y + dy).block?.blockType === block.blockType,
            )) continue;
            sources.push({ x, y, block, distance: Math.hypot(
                x * size - camera.x - width / 2, y * size - camera.y - height / 2,
            ) });
        }
    }
    // Keep dense builds bounded; the underlying light map still includes every source.
    sources.sort((a, b) => a.distance - b.distance);
    for (const { x, y, block } of sources.slice(0, 32)) {
        const radius = Math.min(reach, block.lightSourceLevel * 0.42);
        const sprite = getBlock(block.blockType).sprite || "";
        const color = sprite.includes("redstone") ? "255,70,25" : "255,161,62";
        const sx = (x + 0.5) * size - camera.x;
        const sy = (y + (sprite.includes("torch") ? 0.35 : 0.5)) * size - camera.y;
        const pixels = radius * size;
        const flicker = 0.96 + Math.sin(seconds * 5.1 + x * 7 + y) * 0.025
            + Math.sin(seconds * 8.7 + x) * 0.015;
        const daylight = block.sunLight ? daylightFactor(time) : 0;
        const strength = (0.42 - daylight * 0.26) * flicker;
        ctx.save();
        ctx.beginPath();
        for (let cy = Math.max(top + reach, y - Math.ceil(radius)); cy <= Math.min(bottom - reach, y + Math.ceil(radius)); cy++) {
            for (let cx = Math.max(left + reach, x - Math.ceil(radius)); cx <= Math.min(right - reach, x + Math.ceil(radius)); cx++) {
                if (Math.hypot(cx - x, cy - y) > radius + 0.7) continue;
                if (!lightReaches(terrain.sample, x, y, cx, cy)) continue;
                ctx.rect(Math.round(cx * size - camera.x), Math.round(cy * size - camera.y), size, size);
            }
        }
        ctx.clip();
        ctx.globalCompositeOperation = "screen";
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, pixels);
        glow.addColorStop(0, `rgba(${color},${strength})`);
        glow.addColorStop(0.23, `rgba(${color},${strength * 0.68})`);
        glow.addColorStop(0.60, `rgba(${color},${strength * 0.20})`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(sx - pixels, sy - pixels, pixels * 2, pixels * 2);
        ctx.restore();
    }
}

export function lightReaches(sample, x, y, targetX, targetY) {
    const dx = targetX - x, dy = targetY - y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    for (let step = 1; step < steps; step++) {
        const cx = Math.floor(x + 0.5 + dx * step / steps);
        const cy = Math.floor(y + 0.5 + dy * step / steps);
        if (cx === targetX && cy === targetY) break;
        if ((cx !== x || cy !== y) && sample(cx, cy).solid) return false;
    }
    return true;
}
