import * as THREE from "three";
import { getSpriteUrl, getSpriteSize, texturePackFiles } from "../utils/texturePackLoader.js";
import { surfaceTexture } from "../utils/surfaceTexture.js";

// Only GPU resources live here. Block state and light propagation stay in World.
export class VoxelMaterials {
    constructor() {
        this.entries = new Map();
    }

    get(sprite, { top = false, plant = false, fluid = false, emissive = false, cutaway = false } = {}) {
        if (top && sprite === "grass_side" && texturePackFiles?.["blocks/grass_top"]) {
            sprite = "grass_top";
            top = false;
        } else if (top && sprite === "grass_side_snowed") {
            sprite = "snow";
            top = false;
        }
        const key = `${sprite}:${top}:${plant}:${fluid}:${emissive}:${cutaway}`;
        const url = getSpriteUrl(`blocks/${sprite || "missing_texture"}`);
        let entry = this.entries.get(key);
        if (entry?.url === url) return entry;
        if (entry) this.disposeEntry(entry);
        const canvas = document.createElement("canvas");
        const size = Math.max(16, Math.min(128, getSpriteSize(`blocks/${sprite}`).width));
        canvas.width = canvas.height = size;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        const ice = sprite?.includes("ice");
        const water = fluid && sprite?.includes("water");
        const material = new THREE.MeshStandardMaterial({
            map: water ? null : texture, vertexColors: true, roughness: ice ? 0.18 : water ? 0.16 : 0.92,
            color: water ? 0x116d91 : 0xffffff,
            metalness: ice ? 0.1 : 0, side: plant ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest: plant || sprite === "glass" ? 0.15 : 0,
            transparent: water || sprite === "glass", opacity: water ? (cutaway ? 0.55 : 1) : 1,
            depthWrite: !(water && cutaway),
            emissive: emissive ? new THREE.Color(0xffba71) : new THREE.Color(0),
            emissiveMap: emissive ? texture : null,
            emissiveIntensity: emissive ? 0.4 : 0,
        });
        entry = { key, url, material, texture, canvas, ctx: canvas.getContext("2d"), image: new Image(), top, water, frame: -1, frames: 1, size };
        entry.image.onload = () => {
            entry.frames = top ? 1 : Math.max(1, Math.floor(entry.image.height / entry.image.width));
            this.updateImage(entry, 0);
            if (!plant && (!fluid || water)) this.makeNormalMap(entry);
        };
        entry.image.onerror = () => {
            console.warn(`Could not load voxel texture: ${sprite}`);
            entry.ctx.fillStyle = "#b144b1";
            entry.ctx.fillRect(0, 0, size, size);
            texture.needsUpdate = true;
        };
        entry.image.src = url;
        this.entries.set(key, entry);
        return entry;
    }

    updateImage(entry, frame) {
        const { ctx, canvas, image, top, size } = entry;
        if (!image.complete || !image.naturalWidth || frame === entry.frame) return;
        ctx.clearRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        const source = top ? surfaceTexture(image, entry.key.split(":")[0], image.width) : image;
        ctx.drawImage(source, 0, frame * image.width, image.width, image.width, 0, 0, size, size);
        entry.frame = frame;
        entry.texture.needsUpdate = true;
    }

    makeNormalMap(entry) {
        // Height inferred from albedo is a modest fallback, not an authored PBR map.
        // Smooth normals keep the color pixels sharp without sparkling edges.
        const { size, ctx } = entry;
        const pixels = ctx.getImageData(0, 0, size, size).data;
        const height = (x, y) => {
            const i = (((y + size) % size) * size + (x + size) % size) * 4;
            return (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
        };
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = (height(x - 1, y) - height(x + 1, y)) * 1.6;
                const ny = (height(x, y + 1) - height(x, y - 1)) * 1.6;
                const length = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
                data[i] = (nx / length * 0.5 + 0.5) * 255;
                data[i + 1] = (ny / length * 0.5 + 0.5) * 255;
                data[i + 2] = (1 / length * 0.5 + 0.5) * 255;
                data[i + 3] = 255;
            }
        }
        const map = new THREE.DataTexture(data, size, size);
        map.flipY = true;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.magFilter = map.minFilter = THREE.LinearFilter;
        map.needsUpdate = true;
        entry.normalMap?.dispose();
        entry.normalMap = map;
        entry.material.normalMap = map;
        entry.material.normalScale.set(0.65, 0.65);
        entry.material.needsUpdate = true;
    }

    update(seconds, detailed) {
        for (const entry of this.entries.values()) {
            if (entry.frames > 1) this.updateImage(entry, Math.floor(seconds * 4) % entry.frames);
            entry.material.normalScale.setScalar(detailed ? (entry.water ? 0.20 : 0.65) : 0);
            if (entry.water && entry.normalMap) entry.normalMap.offset.set(seconds * 0.035, seconds * 0.018);
        }
    }

    disposeEntry(entry) {
        entry.image.onload = entry.image.onerror = null;
        entry.texture.dispose();
        entry.normalMap?.dispose();
        entry.material.dispose();
    }

    dispose() {
        for (const entry of this.entries.values()) this.disposeEntry(entry);
        this.entries.clear();
    }
}

// Batch visible faces by material instead of creating thousands of block meshes.
export class FaceBatch {
    constructor(materials) {
        this.materials = materials;
        this.faces = new Map();
    }

    quad(sprite, options, corners, normal, light = 1, uv = [0, 0, 1, 1]) {
        const entry = this.materials.get(sprite, options);
        let batch = this.faces.get(entry);
        if (!batch) {
            batch = { positions: [], normals: [], uvs: [], colors: [] };
            this.faces.set(entry, batch);
        }
        const coords = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
        for (const i of [0, 1, 2, 0, 2, 3]) {
            batch.positions.push(...corners[i]);
            batch.normals.push(...normal);
            batch.uvs.push(...coords[i]);
            batch.colors.push(light, light, light);
        }
    }

    box(sprite, options, x, y, z, w = 1, h = 1, d = 1, light = 1, exposed = {}, faces = {}) {
        // x/y/z is the bottom-left-back corner in Three's y-up coordinate space.
        const X = x + w, Y = y + h, Z = z + d;
        // The front of the water slice must reveal submerged players and mobs.
        if (exposed.front !== false) this.quad(faces.front || sprite, { ...options, cutaway: !!options.fluid }, [[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]], [0,0,1], light);
        if (exposed.back) this.quad(faces.side || sprite, options, [[X,y,z],[x,y,z],[x,Y,z],[X,Y,z]], [0,0,-1], light);
        if (exposed.left !== false) this.quad(faces.side || sprite, options, [[x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z]], [-1,0,0], light);
        if (exposed.right !== false) this.quad(faces.side || sprite, options, [[X,y,Z],[X,y,z],[X,Y,z],[X,Y,Z]], [1,0,0], light);
        if (exposed.top !== false) this.quad(faces.top || sprite, { ...options, top: !faces.top }, [[x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z]], [0,1,0], light);
        if (exposed.bottom !== false) this.quad(faces.bottom || sprite, options, [[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]], [0,-1,0], light);
    }

    build(group, { castShadow = true, receiveShadow = true } = {}) {
        for (const child of [...group.children]) {
            child.geometry.dispose();
            group.remove(child);
        }
        for (const [entry, values] of this.faces) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(values.positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(values.normals, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(values.uvs, 2));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(values.colors, 3));
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, entry.material);
            mesh.castShadow = castShadow && !entry.material.transparent;
            mesh.receiveShadow = receiveShadow;
            group.add(mesh);
        }
    }
}
