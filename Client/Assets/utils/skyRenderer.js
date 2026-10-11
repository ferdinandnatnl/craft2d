// Cached cloud sprites keep atmospheric rendering independent of world generation.
const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const rgb = (color) => `rgb(${color.map(Math.round).join(",")})`;
const rgba = (color, alpha) => `rgba(${color.map(Math.round).join(",")},${alpha})`;
const hash = (x, y, seed) => {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
};

function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const tx = smooth(x - ix), ty = smooth(y - iy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function createCloud(seed) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(canvas.width, canvas.height);
    const lobes = Array.from({ length: 9 }, (_, i) => ({
        x: 48 + i * 27,
        y: 87 - Math.sin(i / 8 * Math.PI) * (20 + hash(i, 0, seed) * 30),
        rx: 30 + hash(i, 1, seed) * 28,
        ry: 23 + hash(i, 2, seed) * 22,
        rz: 25 + hash(i, 3, seed) * 20,
    }));
    // Ray-march a small volume once. Unlike a flat silhouette, the integrated
    // density gives the clouds lit edges, internal detail and shaded bellies.
    const density = (x, y, z) => {
        let shape = -1;
        for (const lobe of lobes) {
            const dx = (x - lobe.x) / lobe.rx;
            const dy = (y - lobe.y) / lobe.ry;
            const dz = z / lobe.rz;
            shape = Math.max(shape, 1 - dx * dx - dy * dy - dz * dz);
        }
        if (shape < -0.18) return 0;
        const detail = noise(x / 19 + z / 31, y / 19 - z / 27, seed) * 0.65
            + noise(x / 7 - z / 19, y / 7 + z / 23, seed) * 0.25
            + noise(x / 3, y / 3 + z / 9, seed) * 0.1;
        return clamp((shape + (detail - 0.55) * 0.95) * 1.8);
    };
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            let alpha = 0, red = 0, green = 0, blue = 0;
            for (let z = -48; z <= 48 && alpha < 0.995; z += 6) {
                const fog = density(x, y, z);
                if (fog === 0) continue;
                const shadow = density(x - 12, y - 18, z - 12)
                    + density(x - 24, y - 36, z - 24) * 0.6;
                const light = Math.exp(-shadow * 1.65);
                const weight = (1 - Math.exp(-fog * 0.6)) * (1 - alpha);
                red += (139 + light * 116) * weight;
                green += (157 + light * 96) * weight;
                blue += (178 + light * 67) * weight;
                alpha += weight;
            }
            if (alpha === 0) continue;
            const index = (y * canvas.width + x) * 4;
            pixels.data[index] = red / alpha;
            pixels.data[index + 1] = green / alpha;
            pixels.data[index + 2] = blue / alpha;
            pixels.data[index + 3] = alpha * 255;
        }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
}

export class SkyRenderer {
    constructor() {
        this.clouds = null;
    }

    draw(ctx, { width, height, time, seconds, cameraX, cameraY, surfaceY }) {
        this.clouds ??= [1, 7, 19, 31].map(createCloud);
        const elevation = Math.sin(time);
        const daylight = smooth((elevation + 0.22) / 0.62);
        const sunset = (1 - smooth(Math.abs(elevation - 0.04) / 0.42)) * daylight;
        const top = mix([5, 10, 25], [83, 122, 172], daylight);
        const middle = mix(mix([12, 22, 43], [134, 168, 204], daylight), [151, 139, 171], sunset * 0.55);
        const horizon = mix(mix([23, 33, 53], [219, 225, 226], daylight), [249, 167, 104], sunset);
        ctx.save();
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.85);
        sky.addColorStop(0, rgb(top));
        sky.addColorStop(0.48, rgb(middle));
        sky.addColorStop(0.82, rgb(horizon));
        sky.addColorStop(1, rgb(horizon));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        if (daylight < 0.7) {
            ctx.fillStyle = "#d9e6ff";
            for (let i = 0; i < 130; i++) {
                ctx.globalAlpha = (1 - daylight) * (0.2 + hash(i, 3, 51) * 0.55);
                const x = ((hash(i, 1, 51) * width - cameraX * 0.008) % width + width) % width;
                const y = hash(i, 2, 51) * height * 0.63;
                const size = i % 7 === 0 ? 2 : 1;
                ctx.fillRect(Math.round(x), Math.round(y), size, size);
            }
            ctx.globalAlpha = 1;
        }

        // Independent visibility keeps dusk continuous instead of swapping the
        // sun for the moon in a single frame. Both retain the world light cycle.
        for (const isSun of [true, false]) {
            const orbit = time + (isSun ? 0 : Math.PI);
            const altitude = Math.sin(orbit);
            const visibility = smooth((altitude + 0.08) / 0.18);
            if (visibility === 0) continue;
            const x = width * (0.5 - Math.cos(orbit) * 0.42);
            const y = height * (0.65 - altitude * 0.55);
            const size = Math.min(width, height);
            const radius = size * (isSun ? 0.014 : 0.018);
            const warmth = 1 - smooth(altitude / 0.5);
            const color = isSun ? mix([255, 245, 222], [255, 167, 83], warmth) : [158, 184, 231];
            ctx.globalAlpha = visibility;

            // A broad, faint scattering lobe plus a concentrated corona avoids
            // the flat yellow disc and hard-edged glow of the previous sky.
            const spread = size * (isSun ? 0.48 : 0.22);
            const halo = ctx.createRadialGradient(x, y, 0, x, y, spread);
            halo.addColorStop(0, rgba(color, isSun ? 0.42 : 0.12));
            halo.addColorStop(0.12, rgba(color, isSun ? 0.23 : 0.06));
            halo.addColorStop(0.4, rgba(color, isSun ? 0.08 : 0.02));
            halo.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = halo;
            ctx.fillRect(x - spread, y - spread, spread * 2, spread * 2);

            const corona = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * 7);
            corona.addColorStop(0, rgba(color, 0.85));
            corona.addColorStop(0.12, rgba(color, 0.5));
            corona.addColorStop(0.35, rgba(color, 0.13));
            corona.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = corona;
            ctx.fillRect(x - radius * 7, y - radius * 7, radius * 14, radius * 14);

            const disc = ctx.createRadialGradient(x, y, 0, x, y, radius);
            disc.addColorStop(0, isSun ? "#ffffff" : "#e4eaf5");
            disc.addColorStop(0.8, isSun ? rgb(mix([255, 255, 249], [255, 227, 171], warmth)) : "#dae4f3");
            disc.addColorStop(1, rgba(color, 0.65));
            ctx.fillStyle = disc;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.imageSmoothingEnabled = true;
        // Fixed world-space spacing avoids popping when the camera crosses a tile.
        for (let layer = 0; layer < 3; layer++) {
            const scale = 0.50 + layer * 0.46;
            const spacing = 390 + layer * 180;
            const offset = cameraX * (0.035 + layer * 0.035) - seconds * (3 + layer * 2);
            const first = Math.floor(offset / spacing) - 1;
            const count = Math.ceil(width / spacing) + 3;
            ctx.globalAlpha = (0.5 + layer * 0.23) * (0.22 + daylight * 0.78);
            for (let i = first; i < first + count; i++) {
                const variant = ((i + layer) % this.clouds.length + this.clouds.length) % this.clouds.length;
                const cloud = this.clouds[variant];
                const cloudX = i * spacing - offset + hash(i, layer, 5) * spacing * 0.3;
                const cloudY = height * (0.22 - layer * 0.14)
                    + (surfaceY - cameraY - height / 2) * 0.07
                    + hash(i, layer, 8) * height * 0.09;
                ctx.drawImage(cloud, cloudX, cloudY, cloud.width * scale, cloud.height * scale);
            }
        }
        ctx.restore();
    }
}
