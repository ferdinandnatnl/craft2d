import { seaLevelForVersion } from "@2dcraft.com/shared/overworldGeneration.js";
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import tooloud from "@2dcraft.com/shared/tooloud.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, CHUNK_WIDTH, RENDER_DISTANCE, TERRAIN_HEIGHT, WATER_LEVEL } from "../utils/globals.js";
import { getBlock, SpecialType } from "../world/block.js";
import { getDimension, getDimensionChunks, Dimensions } from "../world/dimension.js";
import { VolumetricSky } from "./volumetricSky.js";
import { VoxelMaterials, FaceBatch } from "./materials.js";
import { getDoorPanelBounds } from "./doorGeometry.js";
import { VoxelEntities } from "./entities.js";
import { syncSliceCamera } from "./projection.js";
import { terrainColumnFaces, terrainSkyExposure, scenerySeed } from "./heightfield.js";
import {
    getDistantLodDepth,
    getDistantLodStep,
    sampleDistantLodCell,
} from "./distantTerrainLod.js";
import { renderLightTint } from "./renderLight.js";
import { daylightFactor } from "../utils/daylight.js";

const clamp = THREE.MathUtils.clamp;
const DAY_SUN = new THREE.Color(0xffebcf);
const DUSK_SUN = new THREE.Color(0xffbb82);
const DAY_AMBIENT = new THREE.Color(0xc2d7f2);
const DAY_FOG = new THREE.Color(0xb9cbd6);
const DUSK_FOG = new THREE.Color(0x947b83);
const NIGHT_FOG = new THREE.Color(0x233954);
const SCENERY_DEPTH = 160;
const PLAY_PLANE_Z = 0.5;
const DISTANT_LOD_PLANE_Z = -1.3;
const noise = (x, z) => tooloud.Perlin.noise(x * 0.035, z * 0.035, 311);
const random = (x, z) => {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
};
const solid = (block) => {
    const def = block && getBlock(block.blockType);
    return !!(def && !def.air && !def.transparent && !def.fluid && !block.cutoff);
};

function addEndFrameEye(batch, x, y, z, light) {
    const x0 = x + 0.25, x1 = x + 0.75;
    const z0 = z + 0.25, z1 = z + 0.75;
    const y0 = y + 13 / 16, y1 = y + 1;
    const topUv = [0.25, 0.25, 0.75, 0.75];
    const sideUv = [0.25, 0.8125, 0.75, 1];
    batch.quad("endframe_eye", {}, [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], [0,1,0], light, topUv);
    batch.quad("endframe_eye", {}, [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [0,0,1], light, sideUv);
    batch.quad("endframe_eye", {}, [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [-1,0,0], light, sideUv);
    batch.quad("endframe_eye", {}, [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], [1,0,0], light, sideUv);
}

function addBed(batch, x, row, headOffset, light) {
    const headX = x + headOffset;
    const left = Math.min(x, headX);
    const bottom = -row - 1;
    const front = 0.501;
    const side = headOffset > 0 ? "west" : "east";
    const footSprite = `red_bed_foot_${side}`;
    const headSprite = `red_bed_head_${side}`;
    const uv = (x0, y0, width, height) => [
        x0 / 16, 1 - (y0 + height) / 16,
        (x0 + width) / 16, 1 - y0 / 16,
    ];
    const quad = (sprite, x0, y0, width, height, textureUv, planeZ = front) => {
        batch.quad(sprite, {}, [
            [x0, y0, planeZ], [x0 + width, y0, planeZ],
            [x0 + width, y0 + height, planeZ], [x0, y0 + height, planeZ],
        ], [0, 0, 1], light, textureUv);
    };

    // Mojang's bed model uses a 6px mattress and 3px feet per block half.
    const sideUv = uv(0, 7, 16, 6);
    const headSideUv = uv(16, 7, -16, 6);
    const mattressY = bottom + 3 / 16;
    const mattressHeight = 6 / 16;
    quad(footSprite, x, mattressY, 1, mattressHeight, sideUv);
    quad(headSprite, headX, mattressY, 1, mattressHeight, headSideUv);

    const footAtLeft = headOffset > 0;
    const footLegX = footAtLeft ? left : left + 2 - 3 / 16;
    const headLegX = footAtLeft ? left + 2 - 3 / 16 : left;
    const footLegUv = uv(headOffset > 0 ? 13 : 0, 13, 3, 3);
    const headLegUv = uv(headOffset > 0 ? 0 : 13, 13, 3, 3);
    for (const frameX of [left, left + 1]) {
        quad("bed_down", frameX, bottom, 1, 3 / 16,
            uv(0, 0, 16, 3), front + 0.0005);
    }
    quad(footSprite, footLegX, bottom, 3 / 16, 3 / 16, footLegUv, front + 0.001);
    quad(headSprite, headLegX, bottom, 3 / 16, 3 / 16, headLegUv, front + 0.001);
}

export class VoxelRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.mobilePerformanceMode = window.matchMedia?.("(pointer: coarse)").matches ?? false;
        this.supported = false;
        this.failed = false;
        this.initialized = false;
        this.sceneryChunks = new Map();
        this.foregroundWater = [];
        this.backgroundWater = [];
        this.sceneryWaterDirty = true;
        this.waterSources = null;
        this.waterHasContent = false;
        this.renderWidth = 0;
        this.renderHeight = 0;
        this.renderPixelRatio = 0;
        canvas?.addEventListener("webglcontextlost", (event) => {
            event.preventDefault(); this.supported = false;
        });
        canvas?.addEventListener("webglcontextrestored", () => {
            this.supported = true; this.terrainKey = null; this.sceneryKey = null;
        });
    }

    getDevicePixelRatio() {
        const maxPixelRatio = this.mobilePerformanceMode ? 1 : 2;
        return Math.max(1, Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    }

    initialize() {
        if (this.initialized || this.failed || !this.canvas) return this.supported;
        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: !this.mobilePerformanceMode,
                alpha: false,
            });
            this.renderPixelRatio = this.getDevicePixelRatio();
            this.renderer.setPixelRatio(this.renderPixelRatio);
            this.renderer.setSize(1920, 1080, false);
            this.renderWidth = 1920;
            this.renderHeight = 1080;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.15;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFShadowMap;
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 300);
            this.scene.fog = new THREE.Fog(0xb8cbd7, 100, 520);
            this.materials = new VoxelMaterials();
            this.entities = new VoxelEntities(this.scene);
            this.terrain = new THREE.Group();
            this.scenery = new THREE.Group();
            this.scene.add(this.terrain, this.scenery);
            this.sun = new THREE.DirectionalLight(0xffefd5, 3);
            this.sun.castShadow = true;
            const sunShadowMapSize = this.mobilePerformanceMode ? 1024 : 2048;
            this.sun.shadow.mapSize.set(sunShadowMapSize, sunShadowMapSize);
            Object.assign(this.sun.shadow.camera, {
                left: -27,
                right: 27,
                top: 27,
                bottom: -27,
                near: 1,
                far: 130,
            });
            this.sun.shadow.normalBias = 0.035;
            this.sun.shadow.bias = -0.00015;
            this.sun.shadow.radius = 2;
            this.ambient = new THREE.HemisphereLight(0xc2d7f2, 0x514535, 1.65);
            this.scene.add(this.sun, this.sun.target, this.ambient);
            this.lights = Array.from({ length: 3 }, () => {
                const light = new THREE.PointLight(0xffaa55, 0, 12, 1.4);
                light.castShadow = !this.mobilePerformanceMode;
                light.shadow.mapSize.set(256, 256);
                light.shadow.camera.near = 0.05;
                light.shadow.normalBias = 0.018;
                light.shadow.bias = -0.0006;
                this.scene.add(light); return light;
            });
            this.sky = new VolumetricSky();
            this.scene.background = this.sky.target.texture;
            if (!this.mobilePerformanceMode) {
                try {
                    this.composer = new EffectComposer(this.renderer);
                    this.composer.addPass(new RenderPass(this.scene, this.camera));
                    this.bloomPass = new UnrealBloomPass(
                        new THREE.Vector2(
                            Math.ceil(this.canvas.width / 2),
                            Math.ceil(this.canvas.height / 2),
                        ),
                        0.3,
                        0.35,
                        1.1,
                    );
                    this.composer.addPass(this.bloomPass);
                    this.composer.addPass(new OutputPass());
                    this.bloomPass.setSize(
                        Math.ceil(this.canvas.width / 2),
                        Math.ceil(this.canvas.height / 2),
                    );
                } catch (error) {
                    console.warn("Cinematic effects are unavailable; keeping 3D rendering.", error);
                    this.disposePostprocessing();
                }
            }
            this.initialized = this.supported = true;
        } catch (error) {
            console.warn("3D rendering unavailable; using the Classic renderer.", error);
            this.failed = true; this.supported = false;
            this.renderer?.dispose();
        }
        return this.supported;
    }

    disposePostprocessing() {
        this.composer?.passes.forEach((pass) => pass.dispose());
        this.composer?.dispose();
        this.composer = null;
        this.bloomPass = null;
    }

    updateCamera(camera, width, height) {
        syncSliceCamera(this.camera, camera, width, height, BLOCK_SIZE);
        const pixelRatio = this.getDevicePixelRatio();
        if (this.renderWidth !== width || this.renderHeight !== height ||
            this.renderPixelRatio !== pixelRatio) {
            this.renderWidth = width;
            this.renderHeight = height;
            this.renderPixelRatio = pixelRatio;
            this.renderer.setPixelRatio(pixelRatio);
            this.renderer.setSize(width, height, false);
            this.composer?.setSize(width, height);
            this.bloomPass?.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
        }
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
                    hash = Math.imul(hash ^ (block.metaData?.open ? 1 : 0), 16777619);
                    blocks.push({ block, def, x, y, wall });
                    if (block.lightSourceLevel > 2) this.sources.push({ x, y, wall, block, def });
                }
            }
        }
        const key = `${dimension}:${left}:${right}:${top}:${bottom}:${hash}:${lighting}`;
        if (this.terrainKey === key) return;
        this.terrainKey = key;
        const batch = new FaceBatch(this.materials);
        const water = [];
        for (const { block, def, x, y, wall } of blocks) {
            const h = Math.max(0.02, 1 - (block.cutoff || 0));
            const z = wall ? -1.5 : -0.5;
            const exposureBlock = wall
                ? world.getBlockAtWorldPosition(x * BLOCK_SIZE, y * BLOCK_SIZE, false)
                : block;
            const skyExposure = exposureBlock?.skyExposure ??
                (exposureBlock?.sunLight ? 1 : 0);
            const light = renderLightTint(block.lightLevel, skyExposure, lighting);
            const shade = wall ? light * 0.72 : light;
            const sprite = block.spriteName || def.sprite;
            if (!sprite) continue;
            if (wall) {
                // Wallpaper uses the block's texture in the background layer,
                // without its foreground shape or effects.
                const frontZ = z + 1.01;
                batch.quad(sprite, { plant: true }, [
                    [x, -y - 1, frontZ], [x + 1, -y - 1, frontZ],
                    [x + 1, -y, frontZ], [x, -y, frontZ],
                ], [0, 0, 1], shade);
                continue;
            }
            const ox = def.blockOffset?.x || 0, oy = def.blockOffset?.y || 0;
            if (def.specialType === SpecialType.Door) {
                const frontZ = z + 1.01;
                const { left, width } = getDoorPanelBounds(x, block.metaData);
                batch.quad(sprite, { plant: true }, [
                    [left, -y - 1, frontZ],
                    [left + width, -y - 1, frontZ],
                    [left + width, -y - 1 + h, frontZ],
                    [left, -y - 1 + h, frontZ],
                ], [0, 0, 1], shade);
                continue;
            }
            if (def.specialType === SpecialType.Bed) {
                if (def.extendedBlock?.length) {
                    addBed(batch, x, y, def.extendedBlock[0].offset.x, shade);
                }
                continue;
            }
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
            // Chests are non-colliding for gameplay, but still need block volume.
            if (!def.collision && def.transparent && !block.cutoff &&
                def.specialType !== SpecialType.SingleChest) {
                // Crossed cutout planes give grass and flowers a real footprint.
                const options = { plant: true, emissive: !!block.lightSourceLevel };
                batch.quad(sprite, options,
                    [[x+ox,-y-1-oy,z+0.65],[x+1+ox,-y-1-oy,z+0.65],[x+1+ox,-y-oy,z+0.65],[x+ox,-y-oy,z+0.65]], [0,0,1], light);
                if (!wall && !block.lightSourceLevel) batch.quad(sprite, options,
                    [[x+0.5,-y-1,z],[x+0.5,-y-1,z+1],[x+0.5,-y,z+1],[x+0.5,-y,z]], [-1,0,0], light);
                continue;
            }
            const neighbor = (dx, dy) => solid(world.getBlockAtWorldPosition((x + dx) * BLOCK_SIZE, (y + dy) * BLOCK_SIZE, wall));
            const frame = def.specialType === SpecialType.EndPortalFrame;
            batch.box(sprite, { plant: def.transparent, emissive: !!block.lightSourceLevel },
                x + ox, -y - 1 - oy, z, 1, frame ? h * 13 / 16 : h, 1, shade,
                { left: !neighbor(-1,0), right: !neighbor(1,0), top: frame || !neighbor(0,-1) || h < 1,
                    bottom: !neighbor(0,1), back: false }, def.faceSprites || {});
            if (frame && sprite === "endframe_eye") addEndFrameEye(batch, x + ox, -y - 1 - oy, z, shade);
        }
        batch.build(this.terrain, { castShadow: true, receiveShadow: true });
        this.foregroundWater = water;
    }

    updateScenery(world, dimension, lighting) {
        if (dimension !== Dimensions.Overworld || world.generator.specialWorldProps.void) {
            if (this.sceneryChunks.size || this.backgroundWater.length || this.backgroundWaterSurface) {
                this.clearScenery();
            }
            this.scenery.visible = false;
            return;
        }
        this.scenery.visible = true;
        const key = `${world.seed}:${dimension}:${!!world.generator.specialWorldProps.flat}:${world.generator.forceToBiome?.name}`;
        if (this.sceneryWorld !== world || this.sceneryKey !== key) {
            this.clearScenery();
            this.sceneryWorld = world;
            this.sceneryKey = key;
        }
        const center = Math.floor(this.camera.position.x / CHUNK_WIDTH);
        // Extend procedural scenery to the horizon while retaining explored
        // LOD panels that can still fall inside the camera's far plane.
        const halfWidth = (this.camera.position.z + SCENERY_DEPTH) *
            Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect;
        const sceneryRadius = Math.ceil(halfWidth / CHUNK_WIDTH) + 1;
        // LOD panels are projected onto the play plane, so only nearby
        // chunk columns can be visible there. The scenery carries the horizon.
        const lodHalfWidth = (this.camera.position.z - PLAY_PLANE_Z) *
            Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect;
        const lodRadius = Math.ceil(lodHalfWidth / CHUNK_WIDTH) + 1;
        const radius = Math.max(sceneryRadius, lodRadius);
        const chunks = getDimensionChunks(dimension);
        for (const [index, chunk] of this.sceneryChunks) {
            if (index < center - radius || index > center + radius) {
                chunk.group.traverse(child => child.geometry?.dispose());
                this.scenery.remove(chunk.group);
                this.sceneryChunks.delete(index);
                this.sceneryWaterDirty = true;
            }
        }
        // Keep cached panels aligned with the play plane as the camera moves.
        for (const chunk of this.sceneryChunks.values()) {
            if (chunk.lodGroup) this.positionDistantLod(chunk.lodGroup);
        }
        let built = 0;
        for (let offset = 0; offset <= radius && built < 2; offset++) {
            for (const index of offset ? [center - offset, center + offset] : [center]) {
                if (built >= 2) break;
                const distanceChunks = Math.abs(index - center);
                const sourceChunk = chunks.get(index * CHUNK_WIDTH * BLOCK_SIZE) || null;
                const includeScenery = dimension === Dimensions.Overworld &&
                    distanceChunks <= sceneryRadius;
                const includeLod = sourceChunk && distanceChunks > RENDER_DISTANCE &&
                    distanceChunks <= lodRadius;
                const kind = includeScenery && includeLod
                    ? "scenery+lod"
                    : includeScenery ? "scenery" : includeLod ? "lod" : null;
                const cachedSource = includeLod ? sourceChunk : null;
                const lodStep = includeLod
                    ? getDistantLodStep(distanceChunks, RENDER_DISTANCE)
                    : 1;
                const lodLighting = includeLod ? lighting : null;
                const sourceRevision = cachedSource?.revision;
                const existing = this.sceneryChunks.get(index);
                const sameSource = existing?.sourceChunk === cachedSource &&
                    existing?.sourceRevision === sourceRevision &&
                    existing?.kind === kind && existing?.lodStep === lodStep &&
                    existing?.lodLighting === lodLighting;

                if (sameSource) {
                    continue;
                }

                if (kind === null) {
                    if (existing) {
                        existing.group.traverse(child => child.geometry?.dispose());
                        this.scenery.remove(existing.group);
                        this.sceneryChunks.delete(index);
                        this.sceneryWaterDirty = true;
                    }
                    continue;
                }

                if (existing) {
                    existing.group.traverse(child => child.geometry?.dispose());
                    this.scenery.remove(existing.group);
                    this.sceneryChunks.delete(index);
                    this.sceneryWaterDirty = true;
                }

                const chunk = includeScenery
                    ? this.buildSceneryChunk(world, dimension, index)
                    : { group: new THREE.Group(), water: [] };
                if (includeLod) {
                    const lod = this.buildDistantChunkLod(
                        sourceChunk,
                        lodStep,
                        distanceChunks,
                        lighting,
                    );
                    chunk.lodGroup = lod.group;
                    this.positionDistantLod(lod.group);
                    chunk.group.add(lod.group);
                }
                chunk.sourceChunk = cachedSource;
                chunk.sourceRevision = sourceRevision;
                chunk.kind = kind;
                chunk.lodStep = lodStep;
                chunk.lodLighting = lodLighting;
                this.sceneryChunks.set(index, chunk);
                this.scenery.add(chunk.group);
                this.sceneryWaterDirty = true;
                built++;
            }
        }
        if (this.sceneryWaterDirty) {
            this.backgroundWater = [...this.sceneryChunks.values()].flatMap(chunk => chunk.water);
            this.sceneryWaterDirty = false;
        }
        this.backgroundWaterSurface = dimension === Dimensions.Overworld &&
            !world.generator.specialWorldProps.flat
            ? {
                left: (center - sceneryRadius) * CHUNK_WIDTH,
                right: (center + sceneryRadius + 1) * CHUNK_WIDTH,
                nearZ: -1.5,
                farZ: -(SCENERY_DEPTH - 0.5),
                y: seaLevelForVersion(world.generator.worldgenVersion) - CHUNK_HEIGHT + 0.9,
            }
            : null;
        this.sceneryRange = `${center}:${radius}`;
    }

    clearScenery() {
        for (const { group } of this.sceneryChunks.values()) {
            group.traverse(child => child.geometry?.dispose());
            this.scenery.remove(group);
        }
        this.sceneryChunks.clear();
        if (this.backgroundWater.length) this.backgroundWater = [];
        this.sceneryWaterDirty = true;
        this.backgroundWaterSurface = null;
        this.sceneryRange = null;
    }

    positionDistantLod(group) {
        const camera = this.camera.position;
        const scale = (camera.z - DISTANT_LOD_PLANE_Z) /
            (camera.z - PLAY_PLANE_Z);
        group.scale.set(scale, scale, 1);
        group.position.set(
            camera.x * (1 - scale),
            camera.y * (1 - scale),
            DISTANT_LOD_PLANE_Z - PLAY_PLANE_Z,
        );
    }

    buildDistantChunkLod(chunk, step, distanceChunks, lighting) {
        const group = new THREE.Group();
        const batch = new FaceBatch(this.materials);
        const frontZ = PLAY_PLANE_Z;
        const fade = clamp(0.82 - getDistantLodDepth(distanceChunks) / 900, 0.55, 0.82);

        for (let y = 0; y < chunk.height; y += step) {
            for (let x = 0; x < chunk.width; x += step) {
                const sample = sampleDistantLodCell(
                    chunk.blocks,
                    x,
                    y,
                    step,
                    block => getBlock(block.blockType).air,
                ) || sampleDistantLodCell(
                    chunk.walls,
                    x,
                    y,
                    step,
                    block => getBlock(block.blockType).air,
                );
                if (!sample) continue;

                const block = sample.block;
                const definition = getBlock(block.blockType);
                const x0 = chunk.x / BLOCK_SIZE + x;
                const x1 = x0 + sample.width;
                const y0 = y, y1 = y + sample.height;
                const skyExposure = block.sunLight === true ? 1 : 0;
                const light = renderLightTint(block.lightLevel, skyExposure, lighting) * fade;
                if (definition.specialType === SpecialType.Bed) {
                    if (definition.extendedBlock?.length) {
                        addBed(batch, chunk.x / BLOCK_SIZE + block.x, block.y,
                            definition.extendedBlock[0].offset.x, light);
                    }
                    continue;
                }

                const sprite = block.spriteName || definition.sprite;
                if (!sprite || definition.air) continue;
                batch.quad(sprite, {
                    plant: !definition.fluid && definition.transparent && !definition.collision,
                    fluid: definition.fluid,
                    emissive: !!block.lightSourceLevel,
                }, [
                    [x0, -y1, frontZ],
                    [x1, -y1, frontZ],
                    [x1, -y0, frontZ],
                    [x0, -y0, frontZ],
                ], [0, 0, 1], light);
            }
        }

        batch.build(group, { castShadow: false, receiveShadow: true });
        return { group, water: [] };
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
        const firstDepth = 2, lastDepth = SCENERY_DEPTH, floor = -CHUNK_HEIGHT;
        const seed = scenerySeed(world.seed);
        const heights = new Map();
        const heightAt = (x, depth) => {
            // Sample across mesh boundaries as well, including roots of trees
            // whose canopy overlaps the next chunk. Never cap a horizontal edge.
            if (depth < firstDepth || depth >= lastDepth) return floor;
            const heightKey = (x - firstX) * SCENERY_DEPTH + depth;
            if (heights.has(heightKey)) return heights.get(heightKey);
            const base = column(x).ground;
            const variation = world.generator.specialWorldProps.flat ? 0 :
                (noise(x, depth) - noise(x, 0)) * 12 * Math.min(1, depth / 10);
            const result = Math.floor(clamp(base + variation, floor + 1, -1));
            heights.set(heightKey, result);
            return result;
        };
        const water = [];
        for (let depth = firstDepth; depth < lastDepth; depth++) {
            for (let x = firstX; x < lastX; x++) {
                const { biome } = column(x);
                const y = heightAt(x, depth), z = -depth - 0.5;
                const waterY = world.generator.specialWorldProps.flat ? floor :
                    seaLevelForVersion(world.generator.worldgenVersion) +
                        biome.waterLevel - WATER_LEVEL - CHUNK_HEIGHT + 0.9;
                const submerged = y < waterY;
                const surfaceBlock = getBlock(submerged ? biome.waterSandType : biome.topLayer);
                const surface = surfaceBlock.faceSprites?.top || surfaceBlock.sprite;
                const surfaceSide = surfaceBlock.faceSprites?.side || surfaceBlock.sprite;
                const earth = getBlock(biome.secondLayer).sprite;
                const skyExposure = world.generator.specialWorldProps.flat
                    ? 1 : terrainSkyExposure(x, depth, heightAt);
                for (const face of terrainColumnFaces(x, depth, heightAt, floor)) {
                    const surfaceEdge = !face.top && face.corners[0][1] >= y - 1;
                    const material = face.top ? surface : surfaceEdge ? surfaceSide :
                        face.corners[0][1] < y - 3 ? getBlock(biome.baseBlock).sprite : earth;
                    const light = face.top ? skyExposure : Math.max(0.6,
                        skyExposure * 0.88 - (y - face.corners[0][1]) * 0.015);
                    batch.quad(material, {
                        top: face.top && !surfaceBlock.faceSprites?.top,
                    }, face.corners, face.normal, light);
                }
                if (submerged) {
                    batch.quad(getBlock(biome.fluidType).sprite, { fluid: true },
                        [[x,waterY,z+1],[x+1,waterY,z+1],[x+1,waterY,z],[x,waterY,z]], [0,1,0]);
                }
                const detail = random(x, depth + seed);
                if (!submerged && !world.generator.specialWorldProps.flat && depth < 30 && detail > 0.97 && biome.grassType.length) {
                    const plantType = biome.grassType[Math.floor(random(x + 149, depth + seed) * biome.grassType.length)];
                    const plant = getBlock(plantType);
                    const sparsePlant = plant.sprite === "deadbush" || plant.sprite.startsWith("flower_") || plant.sprite.startsWith("double_plant_");
                    if (!sparsePlant || random(x + 71, depth + seed) < 0.15) {
                        batch.quad(plant.sprite, { plant: true }, [[x,y,z],[x+0.85,y,z],[x+0.85,y+0.85,z],[x,y+0.85,z]], [0,0,1]);
                    }
                }
                if (submerged || world.generator.specialWorldProps.flat || depth <= 8 || !biome.treeType.length) continue;
                // Each patch gets a seeded, offset tree position. Use separate
                // draws for presence, species, and shape so all variants occur.
                const patchX = Math.floor(x / 11), patchDepth = Math.floor(depth / 7);
                const treeX = patchX * 11 + 3 + Math.floor(random(patchX + seed, patchDepth * 17) * 5);
                const treeDepth = patchDepth * 7 + 1 + Math.floor(random(patchX * 19, patchDepth + seed) * 5);
                if (depth === treeDepth && x === treeX && random(patchX + seed, patchDepth + 37) > 0.48) {
                    const tree = biome.treeType[Math.floor(random(x + seed, depth + 53) * biome.treeType.length)];
                    const shape = tree.variants[Math.floor(random(x + seed, depth + 97) * tree.variants.length)].blocks;
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
                            const neighbors = leaves ? [shape[row][col - 1], shape[row][col + 1]]
                                .filter(id => getBlock(id)?.sprite?.includes("leaves")).length : 0;
                            const crownDepth = leaves ? 1.5 + neighbors * 0.4 : 1;
                            batch.box(def.sprite, {}, origin + col, y + shape.length - row - 1,
                                z - (crownDepth - 1) / 2, 1, 1, crownDepth, 1, { back: true });
                        }
                    }
                }
            }
        }
        const group = new THREE.Group();
        batch.build(group, { castShadow: true, receiveShadow: true });
        return { group, water };
    }

    updateWater(foregroundCells, backgroundCells, backgroundSurface = null) {
        const surfaceKey = backgroundSurface
            ? `${backgroundSurface.left},${backgroundSurface.right},${backgroundSurface.y}`
            : "";
        // Terrain and scenery rebuilds replace these arrays, making identity an O(1) cache key.
        const sameSources = this.waterSources?.foregroundCells === foregroundCells &&
            this.waterSources?.backgroundCells === backgroundCells &&
            this.waterSources?.surfaceKey === surfaceKey;
        if (sameSources) {
            if (this.water) this.water.visible = this.waterHasContent;
            return;
        }
        this.waterSources = { foregroundCells, backgroundCells, surfaceKey };

        if (!foregroundCells.length && !backgroundCells.length && !backgroundSurface) {
            this.waterHasContent = false;
            if (this.water) this.water.visible = false;
            return;
        }
        const cells = [...foregroundCells, ...backgroundCells];
        const levels = new Map();
        for (const cell of cells) {
            const key = cell.y.toFixed(2);
            if (!levels.has(key)) levels.set(key, []);
            levels.get(key).push(cell);
        }
        const referenceLevel = backgroundSurface?.y ??
            [...levels.values()].sort((a,b) => b.length - a.length)[0][0].y;
        const positions = [], normals = [], uvs = [];
        for (const { x, y, z } of cells) {
            for (const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
                // Store each surface's height in local Z. Water rotates this
                // plane onto world XZ, so biome waterlines no longer leave gaps.
                positions.push(x + u, -z - 1 + v, y - referenceLevel);
                normals.push(0,0,1);
                uvs.push(u,v);
            }
        }
        if (backgroundSurface) {
            const x0 = backgroundSurface.left;
            const x1 = backgroundSurface.right;
            const y0 = -backgroundSurface.nearZ;
            const y1 = -backgroundSurface.farZ;
            const triangles = [
                [[x0, y0], [x1, y0], [x1, y1]],
                [[x0, y0], [x1, y1], [x0, y1]],
            ];
            for (const triangle of triangles) {
                for (const [x, depth] of triangle) {
                    positions.push(x, depth, 0);
                    normals.push(0, 0, 1);
                    uvs.push((x - x0) / (x1 - x0), (depth - y0) / (y1 - y0));
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        if (!this.water) {
            const size = 128;
            const data = new Uint8Array(size * size * 4);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x * Math.PI * 2 / size;
                    const v = y * Math.PI * 2 / size;
                    const nx = Math.sin(u * 2 + v * 3) * 0.08 +
                        Math.sin(u * 5 - v * 4 + 0.7) * 0.035 +
                        Math.sin(u * 11 + v * 7) * 0.012;
                    const ny = Math.cos(v * 3 - u) * 0.07 +
                        Math.sin(u * 4 + v * 7) * 0.032 +
                        Math.cos(u * 9 - v * 5) * 0.012;
                    const length = Math.hypot(nx, ny, 1);
                    const index = (y * size + x) * 4;
                    data[index] = (nx / length * 0.5 + 0.5) * 255;
                    data[index + 1] = (ny / length * 0.5 + 0.5) * 255;
                    data[index + 2] = (1 / length * 0.5 + 0.5) * 255;
                    data[index + 3] = 255;
                }
            }
            this.waterNormals = new THREE.DataTexture(data, size, size);
            this.waterNormals.wrapS = this.waterNormals.wrapT = THREE.RepeatWrapping;
            this.waterNormals.minFilter = this.waterNormals.magFilter = THREE.LinearFilter;
            this.waterNormals.needsUpdate = true;
            this.water = new Water(geometry, {
                textureWidth: 512,
                textureHeight: 512,
                waterNormals: this.waterNormals,
                waterColor: 0x087c9e,
                sunColor: 0xfff2d9,
                distortionScale: 0.32,
                alpha: 1,
                fog: true,
            });
            this.water.material.uniforms.size.value = 8;
            this.water.material.uniforms.waterLighting = { value: 1 };
            this.water.material.fragmentShader = this.water.material.fragmentShader
                .replace(
                    "uniform vec3 waterColor;",
                    "uniform vec3 waterColor;\nuniform float waterLighting;",
                )
                .replace(
                    "float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );",
                    "float reflectance = min( rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 ), 0.28 );",
                )
                .replace(
                    "vec3 outgoingLight = albedo;",
                    "vec3 outgoingLight = mix(albedo, waterColor * waterLighting, 0.38);",
                );
            this.water.rotation.x = -Math.PI / 2;
            this.scene.add(this.water);
        } else {
            this.water.geometry.dispose(); this.water.geometry=geometry;
        }
        this.water.position.y = referenceLevel + 0.015;
        this.water.visible=true;
        this.waterHasContent = true;
    }

    updateLighting(time, seconds, dimension, lighting, effects) {
        let day = daylightFactor(time);
        if (dimension !== Dimensions.Overworld || getDimension(dimension).alwaysDay || !lighting) day=1;
        this.renderer.toneMappingExposure = 1.15 + (1 - day);
        const x=this.camera.position.x, y=this.camera.position.y;
        const elevation=Math.max(0.2, Math.abs(Math.sin(time)));
        const dusk = 4 * day * (1 - day);
        this.sun.position.set(x-Math.cos(time)*35, y+elevation*42+12, 24);
        this.sun.target.position.set(x,y,-8);
        this.sun.color.set(0x90b3ed).lerp(DAY_SUN, day).lerp(DUSK_SUN, dusk * 0.55);
        this.sun.intensity = 0.55 + day * 2.41;
        this.sun.castShadow = effects;
        this.ambient.intensity=0.9+day*0.63;
        if (dimension === Dimensions.End) {
            this.sun.intensity=0.35; this.sun.color.set(0xaaa1c7);
            this.ambient.intensity=0.9; this.ambient.color.set(0x9a87b5);
        } else if (dimension !== Dimensions.Overworld) {
            this.sun.intensity=0.25; this.sun.color.set(0xfc7c42);
            this.ambient.intensity=0.75; this.ambient.color.set(0xbb6352);
        } else this.ambient.color.set(0x607dad).lerp(DAY_AMBIENT, day);
        this.scene.fog.color.set(dimension === Dimensions.End ? 0x15101f :
            dimension === Dimensions.Overworld ? NIGHT_FOG : 0x24151a);
        if (dimension === Dimensions.Overworld) {
            this.scene.fog.color.lerp(DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.4);
        }
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
            light.castShadow = effects && !this.mobilePerformanceMode;
        });
        if (this.water) {
            this.water.material.uniforms.time.value = seconds * 0.4;
            this.water.material.uniforms.sunDirection.value
                .copy(this.sun.position)
                .sub(this.sun.target.position)
                .normalize();
            this.water.material.uniforms.sunColor.value
                .copy(this.sun.color)
                .multiplyScalar(0.15 + day * 0.85);
            this.water.material.uniforms.waterLighting.value = 0.06 + day * 0.94;
        }
    }

    render(world, camera, { width, height, dimension, time, seconds, lighting, effects }) {
        if (!this.initialize() || !this.supported) return false;
        try {
            this.updateCamera(camera,width,height);
            this.updateTerrain(world,camera,width,height,dimension,lighting);
            this.updateScenery(world,dimension,lighting);
            this.updateWater(
                this.foregroundWater || [],
                this.backgroundWater || [],
                this.backgroundWaterSurface,
            );
            this.materials.update(seconds, effects);
            this.updateLighting(time,seconds,dimension,lighting,effects);
            this.entities.update(world.entities,dimension,this.camera,seconds,lighting);
            if (dimension === Dimensions.Overworld) {
                this.scene.background = this.sky.draw(this.renderer, {
                    width,
                    height,
                    time,
                    seconds,
                    cameraX: camera.x,
                    cameraY: camera.y,
                    surfaceY: (CHUNK_HEIGHT - seaLevelForVersion(world.generator.worldgenVersion) +
                        WATER_LEVEL) * BLOCK_SIZE,
                    fov: this.camera.fov,
                    mobilePerformanceMode: this.mobilePerformanceMode,
                });
            } else this.scene.background=new THREE.Color(
                dimension === Dimensions.End ? 0x15101f : 0x24151a);
            if (effects && this.composer) {
                try {
                    this.composer.render();
                } catch (error) {
                    console.warn("Cinematic bloom failed; keeping 3D rendering.", error);
                    this.disposePostprocessing();
                    this.renderer.render(this.scene,this.camera);
                }
            } else this.renderer.render(this.scene,this.camera);
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
        this.disposePostprocessing();
        this.renderer?.dispose();
    }
}
