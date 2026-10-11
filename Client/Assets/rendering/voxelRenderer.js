import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import tooloud from "@2dcraft.com/shared/tooloud.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, TERRAIN_HEIGHT, RENDER_DISTANCE } from "../utils/globals.js";
import { getBlock } from "../world/block.js";
import { getDimension, getDimensionChunks, Dimensions } from "../world/dimension.js";
import { VolumetricSky } from "./volumetricSky.js";
import { VoxelMaterials, FaceBatch } from "./materials.js";
import { VoxelEntities } from "./entities.js";
import { syncSliceCamera } from "./projection.js";
import { terrainColumnFaces, scenerySeed } from "./heightfield.js";

const clamp = THREE.MathUtils.clamp;
const noise = (x, z) => tooloud.Perlin.noise(x * 0.035, z * 0.035, 311);
const random = (x, z) => {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
};
const solid = (block) => {
    const def = block && getBlock(block.blockType);
    return !!(def && !def.air && !def.transparent && !def.fluid && !block.cutoff);
};

export class VoxelRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.supported = false;
        this.failed = false;
        this.initialized = false;
        this.sceneryChunks = new Map();
        canvas?.addEventListener("webglcontextlost", (event) => {
            event.preventDefault(); this.supported = false;
        });
        canvas?.addEventListener("webglcontextrestored", () => {
            this.supported = true; this.terrainKey = null; this.sceneryKey = null;
        });
    }

    initialize() {
        if (this.initialized || this.failed || !this.canvas) return this.supported;
        try {
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(1920, 1080, false);
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.15;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFShadowMap;
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 190);
            this.scene.fog = new THREE.Fog(0xb8cbd7, 38, 128);
            this.materials = new VoxelMaterials();
            this.entities = new VoxelEntities(this.scene);
            this.terrain = new THREE.Group();
            this.scenery = new THREE.Group();
            this.scene.add(this.terrain, this.scenery);
            this.sun = new THREE.DirectionalLight(0xffefd5, 3);
            this.sun.castShadow = true;
            this.sun.shadow.mapSize.set(2048, 2048);
            Object.assign(this.sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 130 });
            this.sun.shadow.normalBias = 0.035;
            this.sun.shadow.bias = -0.00015;
            this.sun.shadow.radius = 2;
            this.ambient = new THREE.HemisphereLight(0xc2d7f2, 0x514535, 1.65);
            this.scene.add(this.sun, this.sun.target, this.ambient);
            this.lights = Array.from({ length: 3 }, () => {
                const light = new THREE.PointLight(0xffaa55, 0, 12, 1.4);
                light.castShadow = true;
                light.shadow.mapSize.set(256, 256);
                light.shadow.camera.near = 0.05;
                light.shadow.normalBias = 0.018;
                light.shadow.bias = -0.0006;
                this.scene.add(light); return light;
            });
            this.sky = new VolumetricSky();
            this.scene.background = this.sky.target.texture;
            this.initialized = this.supported = true;
        } catch (error) {
            console.warn("3D rendering unavailable; using the Classic renderer.", error);
            this.failed = true; this.supported = false;
            this.renderer?.dispose();
        }
        return this.supported;
    }

    updateCamera(camera, width, height) {
        syncSliceCamera(this.camera, camera, width, height, BLOCK_SIZE);
        if (this.canvas.width !== width || this.canvas.height !== height) this.renderer.setSize(width, height, false);
    }

    updateTerrain(world, camera, width, height, dimension, lighting) {
        const left = Math.floor(camera.x / BLOCK_SIZE) - 2;
        const right = Math.ceil((camera.x + width) / BLOCK_SIZE) + 2;
        const top = Math.max(0, Math.floor(camera.y / BLOCK_SIZE) - 8);
        const bottom = Math.min(CHUNK_HEIGHT - 1, Math.ceil((camera.y + height) / BLOCK_SIZE) + 2);
        let hash = 2166136261;
        const blocks = [];
        this.sources = [];
        world.chunks_in_render_distance.clear();
        const chunks = getDimensionChunks(dimension);
        const center = camera.getCurrentChunkIndex();
        for (let i = -RENDER_DISTANCE; i <= RENDER_DISTANCE; i++) {
            const x = (center + i) * CHUNK_WIDTH * BLOCK_SIZE;
            if (chunks.has(x)) world.chunks_in_render_distance.set(x, chunks.get(x));
        }
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                for (const wall of [true, false]) {
                    const block = world.getBlockAtWorldPosition(x * BLOCK_SIZE, y * BLOCK_SIZE, wall);
                    if (!block) continue;
                    const def = getBlock(block.blockType);
                    if (def.air) continue;
                    hash = Math.imul(hash ^ (block.blockType + x * 31 + y * 7919 + (wall ? 5 : 0)), 16777619);
                    hash = Math.imul(hash ^ Math.round((block.cutoff || 0) * 1000) ^ Math.round(block.lightLevel || 0) ^ (def.states?.indexOf(block.spriteName) || 0), 16777619);
                    blocks.push({ block, def, x, y, wall });
                    if (block.lightSourceLevel > 2) this.sources.push({ x, y, wall, block, def });
                }
            }
        }
        const key = `${dimension}:${left}:${right}:${top}:${bottom}:${hash}:${lighting}:${this.materials.revision}`;
        if (this.terrainKey === key) return;
        this.terrainKey = key;
        const batch = new FaceBatch(this.materials);
        const water = [];
        for (const { block, def, x, y, wall } of blocks) {
            const h = Math.max(0.02, 1 - (block.cutoff || 0));
            const z = wall ? -1.5 : -0.5;
            const light = lighting ? Math.max(0.07, Math.min(1, (block.lightLevel ?? 15) / 15)) : 1;
            const shade = wall ? light * 0.72 : light;
            const sprite = block.spriteName || def.sprite;
            if (!sprite) continue;
            const ox = def.blockOffset?.x || 0, oy = def.blockOffset?.y || 0;
            if (def.fluid) {
                const above = world.getBlockAtWorldPosition(x * BLOCK_SIZE, (y - 1) * BLOCK_SIZE, wall);
                const surface = !above || !getBlock(above.blockType).fluid;
                const fluidLight = def.extinguishEntity ? 1 : light;
                batch.box(sprite, { fluid: true, emissive: !!block.lightSourceLevel }, x, -y - 1, z, 1, h, 1, fluidLight,
                    { top: surface, left: false, right: false, bottom: false });
                if (!wall && def.extinguishEntity) {
                    // A dense back face hides distant scenery. The front tint
                    // can still reveal swimmers inside the playable water lane.
                    const back = z + 0.01;
                    batch.quad(sprite, { fluid: true }, [[x,-y-1,back],[x+1,-y-1,back],
                        [x+1,-y-1+h,back],[x,-y-1+h,back]], [0,0,1], fluidLight);
                }
                if (!wall && def.extinguishEntity && surface) {
                    water.push({ x, y: -y - 1 + h, z });
                    // Continue across an empty wall lane to meet the distant water.
                    if (!solid(world.getBlockAtWorldPosition(x * BLOCK_SIZE, y * BLOCK_SIZE, true))) {
                        water.push({ x, y: -y - 1 + h, z: z - 1 });
                    }
                }
                continue;
            }
            if (!def.collision && def.transparent && !block.cutoff) {
                // Crossed cutout planes give grass and flowers a real footprint.
                const options = { plant: true, emissive: !!block.lightSourceLevel };
                batch.quad(sprite, options,
                    [[x+ox,-y-1-oy,z+0.65],[x+1+ox,-y-1-oy,z+0.65],[x+1+ox,-y-oy,z+0.65],[x+ox,-y-oy,z+0.65]], [0,0,1], light);
                if (!wall && !block.lightSourceLevel) batch.quad(sprite, options,
                    [[x+0.5,-y-1,z],[x+0.5,-y-1,z+1],[x+0.5,-y,z+1],[x+0.5,-y,z]], [-1,0,0], light);
                continue;
            }
            const neighbor = (dx, dy) => solid(world.getBlockAtWorldPosition((x + dx) * BLOCK_SIZE, (y + dy) * BLOCK_SIZE, wall));
            batch.box(sprite, { plant: def.transparent, emissive: !!block.lightSourceLevel },
                x + ox, -y - 1 - oy, z, 1, h, 1, shade,
                { left: !neighbor(-1,0), right: !neighbor(1,0), top: !neighbor(0,-1) || h < 1,
                    bottom: !neighbor(0,1), back: false });
        }
        batch.build(this.terrain);
        this.foregroundWater = water;
    }

    updateScenery(world, dimension) {
        if (dimension !== Dimensions.Overworld || world.generator.specialWorldProps.void) {
            this.clearScenery();
            this.scenery.visible = false; this.backgroundWater = []; return;
        }
        this.scenery.visible = true;
        const key = `${world.seed}:${dimension}:${!!world.generator.specialWorldProps.flat}:${world.generator.forceToBiome?.name}:${this.materials.revision}`;
        if (this.sceneryWorld !== world || this.sceneryKey !== key) {
            this.clearScenery();
            this.sceneryWorld = world;
            this.sceneryKey = key;
        }
        const center = Math.floor(this.camera.position.x / CHUNK_WIDTH);
        // Cover the full perspective frustum at the back of the scenery, with
        // an extra chunk for tree canopies. New geometry enters off screen.
        const halfWidth = (this.camera.position.z + 98) * Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect;
        const radius = Math.max(7, Math.ceil(halfWidth / CHUNK_WIDTH) + 1);
        const range = `${center}:${radius}`;
        if (range === this.sceneryRange) return;
        for (const [index, chunk] of this.sceneryChunks) {
            if (index < center - radius || index > center + radius) {
                chunk.group.traverse(child => child.geometry?.dispose());
                this.scenery.remove(chunk.group);
                this.sceneryChunks.delete(index);
            }
        }
        for (let index = center - radius; index <= center + radius; index++) {
            if (this.sceneryChunks.has(index)) continue;
            const chunk = this.buildSceneryChunk(world, dimension, index);
            this.sceneryChunks.set(index, chunk);
            this.scenery.add(chunk.group);
        }
        this.backgroundWater = [...this.sceneryChunks.values()].flatMap(chunk => chunk.water);
        this.sceneryRange = range;
    }

    clearScenery() {
        for (const { group } of this.sceneryChunks.values()) {
            group.traverse(child => child.geometry?.dispose());
            this.scenery.remove(group);
        }
        this.sceneryChunks.clear();
        this.sceneryRange = null;
    }

    buildSceneryChunk(world, dimension, index) {
        const batch = new FaceBatch(this.materials);
        const columns = new Map();
        const column = (x) => {
            if (columns.has(x)) return columns.get(x);
            const biome = world.generator.calculateChunkBiome(Math.floor(x / CHUNK_WIDTH), dimension);
            const height = world.generator.getTerrainHeight(x, dimension);
            const result = { biome, ground: height - CHUNK_HEIGHT + 1 };
            columns.set(x, result); return result;
        };
        const firstX = index * CHUNK_WIDTH, lastX = firstX + CHUNK_WIDTH;
        const firstDepth = 2, lastDepth = 98, floor = -CHUNK_HEIGHT;
        const seed = scenerySeed(world.seed);
        const heights = new Map();
        const heightAt = (x, depth) => {
            // Sample across mesh boundaries as well, including roots of trees
            // whose canopy overlaps the next chunk. Never cap a horizontal edge.
            if (depth < firstDepth || depth >= lastDepth) return floor;
            const index = (x - firstX) * 100 + depth;
            if (heights.has(index)) return heights.get(index);
            const base = column(x).ground;
            const variation = world.generator.specialWorldProps.flat ? 0 :
                (noise(x, depth) - noise(x, 0)) * 12 * Math.min(1, depth / 10);
            const result = Math.floor(clamp(base + variation, floor + 1, -1));
            heights.set(index, result);
            return result;
        };
        const water = [];
        for (let depth = firstDepth; depth < lastDepth; depth++) {
            for (let x = firstX; x < lastX; x++) {
                const { biome } = column(x);
                const y = heightAt(x, depth), z = -depth - 0.5;
                const waterY = world.generator.specialWorldProps.flat ? floor :
                    TERRAIN_HEIGHT + biome.waterLevel - CHUNK_HEIGHT + 0.9;
                const submerged = y < waterY;
                const surface = getBlock(submerged ? biome.waterSandType : biome.topLayer).sprite;
                const earth = getBlock(biome.secondLayer).sprite;
                for (const face of terrainColumnFaces(x, depth, heightAt, floor)) {
                    const material = face.top ? surface : face.corners[0][1] < y - 3 ? getBlock(biome.baseBlock).sprite : earth;
                    batch.quad(material, { top: face.top }, face.corners, face.normal);
                }
                if (submerged) {
                    water.push({ x, y: waterY, z });
                    batch.quad(getBlock(biome.fluidType).sprite, { fluid: true },
                        [[x,waterY,z+1],[x+1,waterY,z+1],[x+1,waterY,z],[x,waterY,z]], [0,1,0]);
                }
                const detail = random(x, depth + seed);
                if (!submerged && !world.generator.specialWorldProps.flat && depth < 45 && detail > 0.78 && biome.grassType.length) {
                    const plant = getBlock(biome.grassType[Math.floor(detail * biome.grassType.length) % biome.grassType.length]);
                    batch.quad(plant.sprite, { plant: true }, [[x,y,z],[x+0.85,y,z],[x+0.85,y+0.85,z],[x,y+0.85,z]], [0,0,1]);
                }
                if (!submerged && !world.generator.specialWorldProps.flat && depth > 8 && depth % 7 === 2 && x % 11 === 0 && detail > 0.48 && biome.treeType.length) {
                    const tree = biome.treeType[Math.floor(detail * biome.treeType.length) % biome.treeType.length];
                    const shape = tree.variants[Math.floor(detail * tree.variants.length) % tree.variants.length].blocks;
                    const roots = shape.at(-1).map((id,index) => getBlock(id)?.air ? -1 : index).filter(index => index >= 0);
                    if (!roots.length) continue;
                    const origin = x - roots[0];
                    // Attach the actual trunk root, not the center of its canopy.
                    if (roots.some(root => heightAt(origin + root, depth) !== y)) continue;
                    for (let row = 0; row < shape.length; row++) {
                        for (let col = 0; col < shape[row].length; col++) {
                            const def = getBlock(shape[row][col]);
                            if (!def || def.air || !def.sprite) continue;
                            const leaves = def.sprite.includes("leaves");
                            batch.box(def.sprite, {}, origin + col, y + shape.length - row - 1,
                                z - (leaves ? 1 : 0), 1, 1, leaves ? 3 : 1, 1, { back: true });
                        }
                    }
                }
            }
        }
        const group = new THREE.Group();
        batch.build(group);
        return { group, water };
    }

    updateWater(cells) {
        if (!cells.length) { if (this.water) this.water.visible = false; return; }
        const key = cells.map(({x,y,z}) => `${x},${y},${z}`).join(";");
        if (key === this.waterKey) { this.water.visible = true; return; }
        this.waterKey = key;
        const levels = new Map();
        for (const cell of cells) {
            const key = cell.y.toFixed(2);
            if (!levels.has(key)) levels.set(key, []);
            levels.get(key).push(cell);
        }
        const dominant = [...levels.values()].sort((a,b) => b.length - a.length)[0];
        const positions = [], normals = [], uvs = [];
        for (const { x, z } of dominant) {
            for (const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
                positions.push(x + u, -z - 1 + v, 0); normals.push(0,0,1); uvs.push(u,v);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        if (!this.water) {
            const size = 128, data = new Uint8Array(size * size * 4);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const u = x * Math.PI * 2 / size, v = y * Math.PI * 2 / size;
                // Several crossing, seamless ripples avoid repeating stripes.
                const nx = Math.sin(u * 2 + v * 3) * 0.14 + Math.sin(u * 5 - v * 4 + 0.7) * 0.06
                    + Math.sin(u * 11 + v * 7) * 0.025;
                const ny = Math.cos(v * 3 - u) * 0.12 + Math.sin(u * 4 + v * 7) * 0.055
                    + Math.cos(u * 9 - v * 5) * 0.025;
                const length = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
                data[i] = (nx / length * 0.5 + 0.5) * 255;
                data[i+1] = (ny / length * 0.5 + 0.5) * 255;
                data[i+2] = (1 / length * 0.5 + 0.5) * 255; data[i+3] = 255;
            }
            this.waterNormals = new THREE.DataTexture(data,size,size);
            this.waterNormals.wrapS=this.waterNormals.wrapT=THREE.RepeatWrapping;
            this.waterNormals.minFilter=this.waterNormals.magFilter=THREE.LinearFilter;
            this.waterNormals.needsUpdate=true;
            this.water = new Water(geometry, { textureWidth: 512, textureHeight: 512,
                waterNormals: this.waterNormals, waterColor: 0x087c9e, sunColor: 0xfff2d9,
                distortionScale: 0.55, alpha: 1, fog: true });
            this.water.material.uniforms.size.value = 16;
            this.water.material.uniforms.waterLighting = { value: 1 };
            // Retain the water's blue absorption at the grazing side-view angle.
            this.water.material.fragmentShader = this.water.material.fragmentShader
                .replace("uniform vec3 waterColor;", "uniform vec3 waterColor;\nuniform float waterLighting;")
                .replace("vec3 outgoingLight = albedo;",
                    "vec3 outgoingLight = mix(albedo, waterColor * waterLighting, 0.38);");
            this.water.rotation.x = -Math.PI / 2;
            this.scene.add(this.water);
        } else {
            this.water.geometry.dispose(); this.water.geometry=geometry;
        }
        this.water.position.y = dominant[0].y + 0.015;
        this.water.visible=true;
    }

    updateLighting(world, time, seconds, dimension, lighting, effects) {
        let day = time <= 3 ? 1 : time < 3.5 ? (3.5-time)/0.5 : time <= 6.5 ? 0 : time < 6.7 ? (time-6.5)/0.2 : 1;
        if (getDimension(dimension).alwaysDay || !lighting) day=1;
        const x=this.camera.position.x, y=this.camera.position.y;
        const elevation=Math.max(0.2, Math.abs(Math.sin(time)));
        this.sun.position.set(x-Math.cos(time)*35, y+elevation*42+12, 24);
        this.sun.target.position.set(x,y,-8);
        this.sun.color.set(day > 0.5 ? 0xffebcf : 0x90b3ed);
        this.sun.intensity = 0.16 + day * 2.8;
        this.sun.castShadow=effects;
        this.ambient.intensity=0.3+day*1.23;
        const player=world.player;
        const skylit=player?.getSunLight?.();
        if (lighting && skylit === false) this.ambient.intensity*=0.45;
        if (dimension === Dimensions.End) {
            this.sun.intensity=0.35; this.sun.color.set(0xaaa1c7);
            this.ambient.intensity=0.9; this.ambient.color.set(0x9a87b5);
        } else if (dimension !== Dimensions.Overworld) {
            this.sun.intensity=0.25; this.sun.color.set(0xfc7c42);
            this.ambient.intensity=0.75; this.ambient.color.set(0xbb6352);
        } else this.ambient.color.set(day > 0.5 ? 0xc2d7f2 : 0x607dad);
        this.scene.fog.color.set(dimension === Dimensions.End ? 0x15101f :
            day > 0.5 ? 0xb9cbd6 : 0x0d182c);
        this.sources.sort((a,b)=>Math.hypot(a.x-x,-a.y-y)-Math.hypot(b.x-x,-b.y-y));
        this.lights.forEach((light,index)=>{
            const source=lighting && this.sources[index];
            light.visible=!!source;
            if (!source) return;
            // Offset toward the viewer so the exposed cut faces receive light.
            light.position.set(source.x+0.5,-source.y-0.28,source.wall?0.7:1.35);
            light.color.set(source.def.sprite?.includes("redstone")?0xff4422:0xffa246);
            light.intensity=(source.block.lightSourceLevel/16)*14*(0.97+Math.sin(seconds*7+source.x)*0.03);
            light.distance=Math.min(12,source.block.lightSourceLevel*0.65);
            light.castShadow=effects;
        });
        if (this.water) {
            this.water.material.uniforms.time.value=seconds*0.4;
            this.water.material.uniforms.sunDirection.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
            this.water.material.uniforms.sunColor.value.copy(this.sun.color).multiplyScalar(0.15+day*0.85);
            this.water.material.uniforms.waterLighting.value=0.06+day*0.94;
        }
    }

    render(world, camera, { width, height, dimension, time, seconds, lighting, effects }) {
        if (!this.initialize() || !this.supported) return false;
        try {
            this.updateCamera(camera,width,height);
            this.updateTerrain(world,camera,width,height,dimension,lighting);
            this.updateScenery(world,dimension);
            this.updateWater([...(this.foregroundWater || []), ...(this.backgroundWater || [])]);
            this.materials.update(seconds,effects);
            this.updateLighting(world,time,seconds,dimension,lighting,effects);
            this.entities.update(world.entities,dimension,this.camera,seconds,lighting);
            if (dimension === Dimensions.Overworld) {
                this.scene.background=this.sky.draw(this.renderer,{width,height,time,seconds,cameraX:camera.x,
                    cameraY:camera.y,surfaceY:(CHUNK_HEIGHT-TERRAIN_HEIGHT)*BLOCK_SIZE,fov:this.camera.fov});
            } else this.scene.background=new THREE.Color(
                dimension === Dimensions.End ? 0x15101f : 0x24151a);
            this.renderer.render(this.scene,this.camera);
            return true;
        } catch (error) {
            console.error("3D rendering failed; using the Classic renderer.",error);
            this.supported=false; this.failed=true; return false;
        }
    }

    dispose() {
        this.clearScenery();
        this.entities?.dispose(); this.materials?.dispose();
        for (const group of [this.terrain,this.scenery]) group?.traverse(child=>child.geometry?.dispose());
        this.water?.geometry.dispose(); this.water?.material.dispose(); this.waterNormals?.dispose();
        this.sky?.dispose(); this.sun?.shadow.dispose();
        for (const light of this.lights || []) light.shadow.dispose();
        this.renderer?.dispose();
    }
}
