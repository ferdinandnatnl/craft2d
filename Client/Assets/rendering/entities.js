import * as THREE from "three";
import { BLOCK_SIZE } from "../utils/globals.js";
import { ToolType } from "@2dcraft.com/shared/constants.js";
import { getSpriteUrl } from "../utils/texturePackLoader.js";
import { getItem, getItemSpritePath } from "@2dcraft.com/shared/item.js";
import { getBlock } from "../world/block.js";
import { getBoatPartPitch, getHeadPitch, getLimbPitch, getSwimPartPitch } from "./entityPose.js";
import { skinBox, skinLimbHalf } from "./entityGeometry.js";
import { createAlexCatfishRig, updateAlexCatfishRig } from "./alexsMobsCatfishRig.js";
import { createAlexCentipedeRig, updateAlexCentipedeRig } from "./alexsMobsCentipedeRig.js";
import { mutantPartParent, mutantPartPitch, mutantWalkBob } from "./mutantPose.js";
import { MUTANT_CREEPER_RIG } from "./mutantCreeperRig.js";
import { renderLightTint } from "./renderLight.js";
import ironGolemModel from "../sprites/entity/golem/iron_golem.geo.json" with { type: "json" };

// Keep movement side-on while revealing the front of cuboid faces and skins.
const FACING_YAW = Math.PI / 3;
const minionModelPosition = ([x, y, z]) => [x / 16, (24 - y) / 16, z / 16];

export class VoxelEntities {
    constructor(scene) {
        this.scene = scene;
        this.models = new Map();
        this.ironGolemResources = null;
        this.snowGolemResources = null;
        this.mutantResources = new Map();
        this.mutantTextures = new Map();
    }

    create(entity) {
        if (entity.isBoat) return this.createBoat(entity);
        const image = entity.body?.image ?? (entity.voxelSprite ? entity.img : null);
        const spriteName = entity.body?.sprite ?? entity.sprite ?? "";
        if (spriteName === "golem/iron_golem.svg") {
            return this.createIronGolem(image);
        }
        if (!image?.complete || !image.naturalWidth) return null;
        if (entity.isMinion) return this.createMinionModel(image);
        if (spriteName === "golem/snow_golem.svg") {
            return this.createSnowGolem(image);
        }
        if (entity.isCreeperEgg) return this.createCreeperEgg(image);
        if (entity.isMutant) return this.createMutantModel(entity, image);
        const group = new THREE.Group();
        const aquaticBodyPart = entity.isAquatic ? entity.body.parts.body : null;
        const textureImage = aquaticBodyPart?.getCroppedSprite(image) ?? image;
        const texture = new THREE.Texture(textureImage);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.needsUpdate = true;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, alphaTest: 0.1 });
        const pivots = {};
        const bends = {};
        let tailMaterial = null;
        const part = (name, dims, uv, pos, pivot = false, uvSize = dims, mirror = false) => {
            const mesh = new THREE.Mesh(skinBox(...dims, ...uv, image, mirror, uvSize), material);
            // One caster per mob reduces shadow-map draw calls as mobs gather.
            mesh.castShadow = name === "torso";
            mesh.receiveShadow = true;
            if (pivot) {
                const joint = new THREE.Group();
                joint.position.set(...pos);
                mesh.position.y = -dims[1] / 32;
                joint.add(mesh); group.add(joint); pivots[name] = joint;
            } else {
                mesh.position.set(...pos); group.add(mesh); pivots[name] = mesh;
            }
            return mesh;
        };
        const bentLimb = (name, width, depth, uv, pos) => {
            const shoulder = new THREE.Group();
            shoulder.position.set(...pos);
            const upper = new THREE.Mesh(skinLimbHalf(width, depth, ...uv, image), material);
            upper.position.y = -3 / 16;
            upper.receiveShadow = true;
            shoulder.add(upper);
            const elbow = new THREE.Group();
            elbow.position.y = -6 / 16;
            const lower = new THREE.Mesh(skinLimbHalf(width, depth, ...uv, image, true), material);
            lower.position.y = -3 / 16;
            lower.receiveShadow = true;
            elbow.add(lower);
            shoulder.add(elbow);
            group.add(shoulder);
            pivots[name] = shoulder;
            bends[name] = elbow;
        };
        const species = spriteName.split("/")[0];
        if (entity.isCatfish) {
            const record = {
                ...createAlexCatfishRig(image, entity.catfishSize),
                source: image.src,
            };
            this.scene.add(record.group);
            return record;
        }
        if (entity.isCentipede) {
            const record = {
                ...createAlexCentipedeRig(image, entity.segmentCount),
                source: image.src,
            };
            this.scene.add(record.group);
            return record;
        }
        const quadruped = ["cow", "pig", "sheep"].includes(species);
        const creeper = species === "creeper" || entity.isCreeperMinion;
        const bodylessSprite = !entity.body && entity.voxelSprite;
        const portraitSprite = spriteName.includes("-art/") || species === "golem" || entity.isAquatic || bodylessSprite;
        if (bodylessSprite) {
            material.side = THREE.DoubleSide;
            const width = entity.hitbox.x / BLOCK_SIZE;
            const height = entity.hitbox.y / BLOCK_SIZE;
            const sprite = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
            sprite.position.y = height / 2;
            sprite.castShadow = true;
            group.add(sprite);
        } else if (species === "dragon") {
            material.side = THREE.DoubleSide;
            const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), material);
            silhouette.position.set(0, 1, 0);
            group.add(silhouette);
        } else if (portraitSprite) {
            // Complete entity art stays on one camera-facing plane instead
            // of being sampled as a Minecraft skin atlas.
            material.side = THREE.DoubleSide;
            const width = entity.isAquatic
                ? entity.hitbox.x / BLOCK_SIZE
                : image.width / 16;
            const height = entity.isAquatic
                ? image.height / image.width * width
                : image.height / 16;
            const spriteCenterY = entity.isAquatic
                ? entity.hitbox.y / (2 * BLOCK_SIZE)
                : height / 2;
            const sprite = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
            sprite.position.y = spriteCenterY;
            sprite.castShadow = true;
            group.add(sprite);

            if (entity.isAquatic) {
                const tailPart = entity.body.parts.tail;
                if (tailPart?.ownSpriteMap) {
                    const tailTexture = new THREE.TextureLoader().load(
                        getSpriteUrl(`entity/${tailPart.ownSpriteMap}`),
                    );
                    tailTexture.colorSpace = THREE.SRGBColorSpace;
                    tailTexture.magFilter = THREE.NearestFilter;
                    tailTexture.minFilter = THREE.NearestMipmapLinearFilter;
                    tailMaterial = new THREE.MeshStandardMaterial({
                        map: tailTexture,
                        roughness: 0.95,
                        alphaTest: 0.1,
                        side: THREE.DoubleSide,
                    });
                    const tailAnchor = width *
                        Math.abs(tailPart.rotationOrigin.x) / BLOCK_SIZE;
                    const tailPivot = new THREE.Group();
                    tailPivot.position.set(-tailAnchor, spriteCenterY, -0.005);
                    const tail = new THREE.Mesh(
                        new THREE.PlaneGeometry(width, height),
                        tailMaterial,
                    );
                    tail.position.x = tailAnchor;
                    tail.castShadow = true;
                    tailPivot.add(tail);
                    group.add(tailPivot);
                    pivots.tail = tailPivot;
                }
            }
        } else if (species === "villager") {
            // Classic vanilla villager atlas and proportions: robe, long head,
            // nose, folded arms, and two walking legs.
            const head = part("head", [8, 10, 8], [0, 0], [0, 1.8125, 0]);
            const nose = new THREE.Mesh(skinBox(2, 4, 2, 24, 0, image), material);
            nose.position.set(0, -0.25, 0.3125);
            nose.castShadow = nose.receiveShadow = true;
            head.add(nose);
            part("torso", [8, 12, 6], [16, 20], [0, 1.125, 0]);
            // The robe uses the same 8x18x6 atlas region as vanilla, with
            // a half-pixel shell outside the torso and legs.
            part("robe", [9, 19, 7], [0, 38], [0, 0.9375, 0], false, [8, 18, 6]);
            const arms = new THREE.Group();
            arms.position.set(0, 1.375, 0.0625);
            arms.rotation.x = -0.75;
            for (const x of [-0.375, 0.375]) {
                const arm = new THREE.Mesh(skinBox(4, 8, 4, 44, 22, image), material);
                arm.position.set(x, -0.125, 0);
                arms.add(arm);
            }
            const foldedArms = new THREE.Mesh(skinBox(8, 4, 4, 40, 38, image), material);
            foldedArms.position.y = -0.25;
            arms.add(foldedArms);
            group.add(arms);
            part("leftLeg", [4, 12, 4], [0, 22], [-0.125, 0.75, 0], true);
            part("rightLeg", [4, 12, 4], [0, 22], [0.125, 0.75, 0], true);
            group.scale.setScalar(entity.hitbox.y / BLOCK_SIZE / 1.95);
        } else if (species === "enderman") {
            // Vanilla Endermen use 8x8 heads, an 8x12 torso, and 2x30 limbs.
            // Their model uses the 64x32 mob atlas, even when the source PNG
            // has extra rows below it.
            const limb = [2, 30, 2];
            part("head", [8, 8, 8], [0, 0], [0, 42 / 16, 0]);
            part("torso", [8, 12, 4], [32, 16], [0, 33 / 16, 0]);
            part("rightArm", limb, [56, 0], [-3 / 16, 39 / 16, 0], true);
            part("leftArm", limb, [56, 0], [5 / 16, 39 / 16, 0], true, limb, true);
            part("rightLeg", limb, [56, 0], [-2 / 16, 30 / 16, 0], true);
            part("leftLeg", limb, [56, 0], [2 / 16, 30 / 16, 0], true, limb, true);
            group.scale.setScalar(entity.hitbox.y / BLOCK_SIZE / (46 / 16));
        } else if (quadruped) {
            const cow = species === "cow", pig = species === "pig";
            const torso = part("torso", [cow ? 12 : 10, 16, 8], cow ? [18, 4] : [28, 8], [0, 0.78, 0]);
            torso.rotation.x = Math.PI / 2;
            if (species === "sheep" && !entity.sheared) {
                torso.material = new THREE.MeshStandardMaterial({ color: 0xe2dfd2, roughness: 1 });
            }
            part("head", [8, 8, cow ? 6 : 8], [0, 0], [0, 1.05, 0.62]);
            if (pig) part("snout", [4, 3, 1], [16, 16], [0, 0.98, 0.91]);
            for (const [name, x, z] of [["leftLeg", -0.23, 0.38], ["rightLeg", 0.23, 0.38], ["backLeg", -0.23, -0.38], ["farLeg", 0.23, -0.38]]) {
                part(name, [4, 8, 4], [0, 16], [x, 0.5, z], true);
            }
            group.scale.setScalar(entity.hitbox.y / BLOCK_SIZE / 1.3);
        } else {
            const skeleton = species.includes("skeleton");
            const bendable = species === "zombie" || skeleton;
            part("head", [8, 8, 8], [0, 0], [0, 1.75, 0]);
            part("torso", [8, 12, 4], [16, 16], [0, 1.125, 0]);
            if (creeper) {
                for (const [name, x, z] of [["leftLeg", -0.14, 0.14], ["rightLeg", 0.14, 0.14], ["backLeg", -0.14, -0.14], ["farLeg", 0.14, -0.14]]) {
                    part(name, [4, 6, 4], [0, 16], [x, 0.75, z], true);
                }
            } else {
                const modern = image.height >= image.width;
                const thin = skeleton ? 2 : entity.skinModel === "alex" ? 3 : 4;
                const armDepth = skeleton ? 2 : 4;
                const legWidth = skeleton ? 2 : 4;
                const limb = (name, width, depth, uv, pos) => bendable
                    ? bentLimb(name, width, depth, uv, pos)
                    : part(name, [width, 12, depth], uv, pos, true);
                limb("rightArm", thin, armDepth, [40, 16], [-0.25 - thin / 32, 1.5, 0]);
                limb("leftArm", thin, armDepth, modern ? [32, 48] : [40, 16], [0.25 + thin / 32, 1.5, 0]);
                limb("rightLeg", legWidth, legWidth, [0, 16], [-0.125, 0.75, 0]);
                limb("leftLeg", legWidth, legWidth, modern ? [16, 48] : [0, 16], [0.125, 0.75, 0]);
            }
            group.scale.setScalar(entity.hitbox.y / BLOCK_SIZE / 2);
        }
        // Rotate the swimming body around its center without moving its feet at rest.
        const pose = new THREE.Group();
        pose.position.y = 1;
        for (const child of [...group.children]) {
            child.position.y -= 1;
            pose.add(child);
        }
        group.add(pose);
        const record = { group, pose, texture, material, pivots, bends, source: image.src, quadruped, portraitSprite, bodylessSprite, enderman: species === "enderman", tailMaterial, heldKey: null };
        this.scene.add(group);
        return record;
    }

    createMinionModel(image) {
        const group = new THREE.Group();
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.needsUpdate = true;
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.95,
            alphaTest: 0.1,
        });
        const pivots = {};
        const addPart = ({
            name,
            size,
            uv,
            pivot,
            box,
            mirror = false,
            rotationX = 0,
        }) => {
            const [width, height, depth] = size;
            const mesh = new THREE.Mesh(
                skinBox(width, height, depth, ...uv, image, mirror),
                material,
            );
            mesh.name = name;
            mesh.castShadow = name === "torso" || name === "backpack";
            mesh.receiveShadow = true;
            const joint = new THREE.Group();
            joint.position.set(...minionModelPosition(pivot));
            joint.rotation.x = rotationX;
            mesh.position.set(
                (box[0] + width / 2) / 16,
                -(box[1] + height / 2) / 16,
                (box[2] + depth / 2) / 16,
            );
            joint.add(mesh);
            group.add(joint);
            pivots[name] = joint;
        };

        // Licensed ModelMinion boxes and atlas offsets, adapted for the side camera's depth axis.
        addPart({
            name: "head", size: [6, 5, 4], uv: [0, 0],
            // Align the head's box center with the torso's depth in the side view.
            pivot: [0, 12, 3], box: [-3, -6, -3],
        });
        addPart({
            name: "torso", size: [8, 8, 4], uv: [22, 0],
            pivot: [0, 14, 2], box: [-4, -3, -2],
        });
        addPart({
            name: "rightLeg", size: [2, 5, 3], uv: [0, 10],
            pivot: [-1, 12, 0.1], box: [-2, 7, 0],
        });
        addPart({
            name: "leftLeg", size: [2, 5, 3], uv: [0, 10],
            pivot: [1, 12, 0.1], box: [0, 7, 0], mirror: true,
        });
        addPart({
            name: "rightArm", size: [2, 7, 3], uv: [0, 19],
            pivot: [-5, 11, 0], box: [-1, 0, -1],
        });
        addPart({
            name: "leftArm", size: [2, 7, 3], uv: [0, 19],
            pivot: [5, 11, 0], box: [-1, 0, -1], mirror: true,
        });
        addPart({
            name: "backpack", size: [6, 7, 5], uv: [11, 13],
            // Positive Z faces the camera, so keep the backpack behind the torso.
            pivot: [0, 13, -4], box: [-3, -2, -2],
            // Minecraft model Y points down; the voxel rig uses Y up.
            rotationX: -0.7853982,
        });

        this.scene.add(group);
        return {
            group,
            texture,
            material,
            pivots,
            source: image.src,
            minionModel: true,
            heldKey: null,
        };
    }

    createMutantModel(entity, image) {
        if (entity.entityTypeName === "MutantCreeper") {
            return this.createMutantCreeper(entity, image);
        }
        const key = `${entity.entityTypeName}:${image.src}`;
        let resources = this.mutantResources.get(key);
        if (!resources) {
            resources = this.createMutantResources(entity, image);
            if (!resources) return null;
            this.mutantResources.set(key, resources);
        }

        const group = new THREE.Group();
        const geometry = resources.geometry.clone();
        geometry.getAttribute("position").setUsage(THREE.DynamicDrawUsage);
        geometry.getAttribute("normal").setUsage(THREE.DynamicDrawUsage);
        const mesh = new THREE.Mesh(geometry, resources.materials);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        this.scene.add(group);
        return {
            group,
            geometry,
            source: image.src,
            mutantModel: true,
            materials: resources.materials,
            mutantParts: resources.parts,
            mutantPartByName: resources.partByName,
            sharedGeometry: false,
            sharedMaterials: true,
        };
    }

    createMutantCreeper(entity, image) {
        let texture = this.mutantTextures.get(image.src);
        if (!texture) {
            texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestMipmapLinearFilter;
            texture.needsUpdate = true;
            this.mutantTextures.set(image.src, texture);
        }
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
        const group = new THREE.Group();
        const joints = new Map();
        for (const definition of MUTANT_CREEPER_RIG) {
            const part = entity.body.parts[definition.name];
            const { u, v, width, height, depth } = part.mutantCube;
            const joint = new THREE.Group();
            const [px, py, pz] = definition.pivot;
            joint.position.set(px / 16, -py / 16, -pz / 16);
            joint.rotation.order = "ZYX";
            const mesh = new THREE.Mesh(skinBox(width, height, depth, u, v, image), material);
            const [bx, by, bz] = definition.box;
            mesh.position.set(bx / 16, -by / 16, -bz / 16);
            mesh.castShadow = mesh.receiveShadow = true;
            joint.add(mesh);
            (joints.get(definition.parent) || group).add(joint);
            joints.set(definition.name, joint);
        }
        // The bent pose lifts the feet five pixels above their unrotated base.
        group.position.y = 25 / 16;
        this.scene.add(group);
        return { group, joints, material, source: image.src, creeperRig: true };
    }

    createCreeperEgg(image) {
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.needsUpdate = true;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
        const group = new THREE.Group();
        for (const [width, height, depth, y] of [
            [4, 1, 4, 0.04], [6, 4, 6, 0.2], [4, 2, 4, 0.38], [2, 1, 2, 0.47],
        ]) {
            const mesh = new THREE.Mesh(skinBox(width, height, depth, 0, 0, image), material);
            mesh.position.y = y;
            mesh.castShadow = mesh.receiveShadow = true;
            group.add(mesh);
        }
        this.scene.add(group);
        return { group, texture, material, source: image.src, eggModel: true };
    }

    createMutantResources(entity, image) {
        const sourceGroups = new Map();
        for (const [index, [name, part]] of Object.entries(entity.body.parts).entries()) {
            const source = part.loadSprite(image);
            if (!source?.complete || !source.naturalWidth) return null;
            const key = source.src;
            if (!sourceGroups.has(key)) sourceGroups.set(key, { source, parts: [] });
            sourceGroups.get(key).parts.push({ name, part, index });
        }

        const positions = [];
        const uvs = [];
        const normals = [];
        const indices = [];
        const groups = [];
        const materials = [];
        const partPoses = [];
        let vertexOffset = 0;

        for (const { source, parts } of sourceGroups.values()) {
            const materialIndex = materials.length;
            const firstIndex = indices.length;
            let texture = this.mutantTextures.get(source.src);
            // Textures are shared by the model resource instead of being
            // allocated once for every limb and every spawned creature.
            if (!texture) {
                texture = new THREE.Texture(source);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestMipmapLinearFilter;
                texture.needsUpdate = true;
                this.mutantTextures.set(source.src, texture);
            }

            const isGlow = source.src.includes("/glow");
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.95,
                alphaTest: 0.05,
                transparent: true,
                side: THREE.DoubleSide,
                emissive: isGlow ? 0xb9f7ff : 0,
                emissiveIntensity: isGlow ? 0.8 : 0,
            });
            material.userData.mutantGlow = isGlow;
            materials.push(material);

            for (const { name, part, index } of parts) {
                const { u, v, width, height, depth } = part.mutantCube;
                const centerX = part.offset.x / 8 - entity.hitbox.x / (2 * BLOCK_SIZE);
                const centerY = entity.hitbox.y / BLOCK_SIZE - part.offset.y / 8;
                const centerZ = part.zIndex * 0.002 + index * 0.00001;
                const cube = skinBox(width, height, depth, u, v, source);
                const cubePositions = cube.getAttribute("position");
                const cubeUvs = cube.getAttribute("uv");
                const cubeNormals = cube.getAttribute("normal");
                const vertexStart = vertexOffset;
                const base = [];
                const baseNormals = [];
                for (let vertex = 0; vertex < cubePositions.count; vertex++) {
                    const x = centerX + cubePositions.getX(vertex);
                    const y = centerY + cubePositions.getY(vertex);
                    const z = centerZ + cubePositions.getZ(vertex);
                    positions.push(x, y, z);
                    uvs.push(cubeUvs.getX(vertex), cubeUvs.getY(vertex));
                    const normal = [cubeNormals.getX(vertex), cubeNormals.getY(vertex), cubeNormals.getZ(vertex)];
                    normals.push(...normal);
                    base.push([x, y, z]);
                    baseNormals.push(normal);
                }
                for (let i = 0; i < cube.index.count; i++) {
                    indices.push(vertexOffset + cube.index.getX(i));
                }
                partPoses.push({
                    name,
                    vertexStart,
                    pivotY: centerY + (name === "head" ? -height : height) / 32,
                    pivotZ: centerZ,
                    parentName: mutantPartParent(name),
                    base,
                    baseNormals,
                });
                vertexOffset += cubePositions.count;
                cube.dispose();
            }

            groups.push({ firstIndex, indexCount: indices.length - firstIndex, materialIndex });
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setIndex(indices);
        for (const group of groups) {
            geometry.addGroup(group.firstIndex, group.indexCount, group.materialIndex);
        }
        return { geometry, materials, parts: partPoses,
            partByName: new Map(partPoses.map(part => [part.name, part])) };
    }

    createIronGolem(image) {
        const model = ironGolemModel["minecraft:geometry"][0];
        if (!this.ironGolemResources) {
            const texture = new THREE.TextureLoader().load(
                getSpriteUrl("entity/golem/iron_golem.png"),
            );
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestMipmapLinearFilter;
            this.ironGolemResources = { texture, geometries: new Map() };
        }
        const { texture, geometries } = this.ironGolemResources;

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.95,
            alphaTest: 0.1,
        });
        const group = new THREE.Group();
        const bones = new Map();
        const pivots = {};
        const textureSize = {
            width: model.description.texture_width,
            height: model.description.texture_height,
        };
        const point = ([x, y, z]) => [x / 16, y / 16, -z / 16];

        for (const bone of model.bones) {
            const boneGroup = new THREE.Group();
            const parent = bone.parent ? bones.get(bone.parent) : null;
            const pivot = point(bone.pivot);
            const parentPivot = parent?.pivot ?? [0, 0, 0];
            boneGroup.position.set(
                pivot[0] - parentPivot[0],
                pivot[1] - parentPivot[1],
                pivot[2] - parentPivot[2],
            );
            (parent?.group ?? group).add(boneGroup);
            bones.set(bone.name, { group: boneGroup, pivot });
            pivots[bone.name] = boneGroup;

            for (const cube of bone.cubes ?? []) {
                const inflate = cube.inflate ?? 0;
                const [width, height, depth] = cube.size.map(
                    (size) => size + inflate * 2,
                );
                const [u, v] = Array.isArray(cube.uv) ? cube.uv : cube.uv.north;
                let geometry = geometries.get(cube);
                if (!geometry) {
                    geometry = skinBox(
                        width,
                        height,
                        depth,
                        u,
                        v,
                        textureSize,
                        cube.mirror ?? bone.mirror ?? false,
                        cube.size,
                    );
                    geometries.set(cube, geometry);
                }
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = bone.name === "body" && cube === bone.cubes[0];
                mesh.receiveShadow = true;
                const center = point([
                    cube.origin[0] + cube.size[0] / 2,
                    cube.origin[1] + cube.size[1] / 2,
                    cube.origin[2] + cube.size[2] / 2,
                ]);
                mesh.position.set(
                    center[0] - pivot[0],
                    center[1] - pivot[1],
                    center[2] - pivot[2],
                );
                boneGroup.add(mesh);
            }
        }

        this.scene.add(group);
        return {
            group,
            material,
            pivots,
            source: image?.src ?? null,
            ironGolem: true,
            sharedGeometry: true,
            heldKey: null,
        };
    }

    createSnowGolem(image) {
        if (!this.snowGolemResources) {
            const loadTexture = (path) => {
                const texture = new THREE.TextureLoader().load(getSpriteUrl(path));
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestMipmapLinearFilter;
                return texture;
            };
            this.snowGolemResources = {
                snow: loadTexture("blocks/snow"),
                pumpkinSide: loadTexture("blocks/pumpkin_side"),
                pumpkinTop: loadTexture("blocks/pumpkin_top"),
                pumpkinFace: loadTexture("blocks/pumpkin_face_off"),
                stick: loadTexture("items/stick"),
            };
        }

        const resources = this.snowGolemResources;
        const snowMaterial = new THREE.MeshStandardMaterial({
            map: resources.snow,
            roughness: 1,
        });
        const pumpkinSideMaterial = new THREE.MeshStandardMaterial({
            map: resources.pumpkinSide,
            roughness: 1,
        });
        const pumpkinTopMaterial = new THREE.MeshStandardMaterial({
            map: resources.pumpkinTop,
            roughness: 1,
        });
        const pumpkinFaceMaterial = new THREE.MeshStandardMaterial({
            map: resources.pumpkinFace,
            roughness: 1,
        });
        const stickMaterial = new THREE.MeshStandardMaterial({
            map: resources.stick,
            alphaTest: 0.15,
            roughness: 1,
            side: THREE.DoubleSide,
        });
        const group = new THREE.Group();
        const addCube = (size, position, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
            mesh.position.set(...position);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            return mesh;
        };

        // Vanilla construction: two snow blocks with a carved pumpkin on top.
        addCube([0.76, 0.62, 0.64], [0, 0.34, 0], snowMaterial);
        addCube([0.68, 0.62, 0.60], [0, 0.96, 0], snowMaterial);
        addCube(
            [0.62, 0.62, 0.62],
            [0, 1.58, 0],
            [
                pumpkinSideMaterial,
                pumpkinSideMaterial,
                pumpkinTopMaterial,
                pumpkinTopMaterial,
                pumpkinFaceMaterial,
                pumpkinSideMaterial,
            ],
        );

        const armPivots = {};
        for (const side of [-1, 1]) {
            const arm = new THREE.Group();
            arm.position.set(side * 0.31, 1.02, 0);
            arm.rotation.z = -side * 0.2;
            const stick = new THREE.Mesh(
                new THREE.BoxGeometry(0.48, 0.07, 0.07),
                stickMaterial,
            );
            stick.position.set(side * 0.23, -0.03, 0);
            stick.castShadow = true;
            stick.receiveShadow = true;
            arm.add(stick);
            group.add(arm);
            armPivots[side < 0 ? "leftArm" : "rightArm"] = arm;
        }

        this.scene.add(group);
        return {
            group,
            material: snowMaterial,
            materials: [snowMaterial, pumpkinSideMaterial, pumpkinTopMaterial,
                pumpkinFaceMaterial, stickMaterial],
            pivots: armPivots,
            source: image.src,
            snowGolem: true,
            sharedTextures: true,
        };
    }

    createBoat(entity) {
        const group = new THREE.Group();
        const hullMaterial = new THREE.MeshStandardMaterial({
            color: 0x80502a,
            roughness: 1,
            side: THREE.DoubleSide,
        });
        const innerMaterial = new THREE.MeshStandardMaterial({
            color: 0x55351d,
            roughness: 1,
            side: THREE.DoubleSide,
        });
        const railMaterial = new THREE.MeshStandardMaterial({
            color: 0xb17b43,
            roughness: 1,
        });
        const seamMaterial = new THREE.MeshStandardMaterial({
            color: 0x4c2e19,
            roughness: 1,
        });
        const paddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x986333,
            roughness: 1,
        });
        const bladeMaterial = new THREE.MeshStandardMaterial({
            color: 0xb17b43,
            roughness: 1,
        });

        const addMesh = (geometry, material, parent = group) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            parent.add(mesh);
            return mesh;
        };
        const addBox = (size, position, material, parent = group) => {
            const mesh = addMesh(new THREE.BoxGeometry(...size), material, parent);
            mesh.position.set(...position);
            return mesh;
        };
        const addPolygon = (vertices, material) => {
            const positions = [];
            for (let i = 1; i < vertices.length - 1; i++) {
                positions.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(positions, 3),
            );
            geometry.computeVertexNormals();
            return addMesh(geometry, material);
        };
        const addQuad = (vertices, material) => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute([
                    ...vertices[0], ...vertices[1], ...vertices[2],
                    ...vertices[0], ...vertices[2], ...vertices[3],
                ], 3),
            );
            geometry.computeVertexNormals();
            return addMesh(geometry, material);
        };
        const addRail = (from, to) => {
            const dx = to[0] - from[0];
            const dz = to[2] - from[2];
            const length = Math.hypot(dx, dz);
            const rail = addBox(
                [length, 0.075, 0.075],
                [(from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2],
                railMaterial,
            );
            rail.rotation.y = -Math.atan2(dz, dx);
        };

        // The six-sided, tapered hull follows Minecraft's low open boat shape.
        const top = [
            [-0.82, 0.47, 0], [-0.61, 0.47, -0.38],
            [0.61, 0.47, -0.38], [0.82, 0.47, 0],
            [0.61, 0.47, 0.38], [-0.61, 0.47, 0.38],
        ];
        const bottom = [
            [-0.53, 0.08, 0], [-0.40, 0.08, -0.24],
            [0.40, 0.08, -0.24], [0.53, 0.08, 0],
            [0.40, 0.08, 0.24], [-0.40, 0.08, 0.24],
        ];
        for (let i = 0; i < top.length; i++) {
            const next = (i + 1) % top.length;
            addQuad([top[i], top[next], bottom[next], bottom[i]], hullMaterial);
            addRail(top[i], top[next]);
        }
        addPolygon(bottom, innerMaterial);

        // A dark floor, cross-seat, and plank lines make the interior visible.
        addBox([0.66, 0.035, 0.39], [0, 0.16, 0], innerMaterial);
        addBox([0.18, 0.075, 0.57], [0, 0.34, 0], railMaterial);
        for (const side of [-1, 1]) {
            for (const y of [0.20, 0.30]) {
                addBox([0.88, 0.018, 0.016], [0, y, side * 0.34], seamMaterial);
            }
        }

        const paddles = [];
        const createPaddle = (side, x) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.39, side * 0.33);
            group.add(pivot);
            addBox([0.035, 0.035, 0.68], [0, 0, side * 0.34], paddleMaterial, pivot);
            addBox([0.16, 0.045, 0.22], [0, 0, side * 0.69], bladeMaterial, pivot);
            paddles.push({ pivot, side });
        };
        createPaddle(1, -0.25);
        createPaddle(-1, 0.25);

        this.scene.add(group);
        return {
            group,
            isBoat: true,
            material: hullMaterial,
            paddles,
        };
    }

    updateHeld(record, entity, armName = "leftArm") {
        const item = entity.holdItem;
        const def = item?.blockId != null ? getBlock(item.blockId) : item?.itemId != null ? getItem(item.itemId) : null;
        const sprite = item?.blockId != null
            ? def?.sprite
            : item?.itemId != null
              ? getItemSpritePath(item.itemId)
              : null;
        const key = sprite ? `${item.blockId != null ? "blocks" : "items"}/${sprite}` : null;
        if (record.heldKey === key) return;
        if (record.held) {
            record.held.parent.remove(record.held);
            record.held.geometry.dispose(); record.held.material.map.dispose(); record.held.material.dispose();
            record.held = null;
        }
        record.heldKey = key;
        const arm = record.pivots[armName];
        if (!key || !arm) return;
        const map = new THREE.TextureLoader().load(getSpriteUrl(key));
        map.magFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), material);
        mesh.position.set(0, -0.5, 0.28); mesh.rotation.y = -Math.PI / 2;
        mesh.castShadow = true;
        (record.bends?.[armName] || arm).add(mesh); record.held = mesh;
        if (record.bends?.[armName]) mesh.position.y = -0.12;
    }

    update(entities, dimension, camera, seconds, lighting) {
        const visible = new Set();
        for (const entity of entities) {
            if (entity.dimension !== dimension ||
                (!entity.body && !entity.isBoat && !entity.voxelSprite) ||
                Math.abs(entity.position.x / BLOCK_SIZE - camera.position.x) > 30) continue;
            visible.add(entity);
            let record = this.models.get(entity);
            const image = entity.body?.image ?? (entity.voxelSprite ? entity.img : null);
            if (record && !record.isBoat && record.source !== image?.src) {
                this.remove(entity); record = null;
            }
            if (!record) {
                record = this.create(entity);
                if (!record) continue;
                this.models.set(entity, record);
            }
            if (record.isBoat) {
                const bob = Math.sin(entity.bobPhase || 0) * 0.025;
                record.group.position.set(
                    (entity.position.x + entity.hitbox.x / 2) / BLOCK_SIZE,
                    -(entity.position.y + entity.hitbox.y) / BLOCK_SIZE + bob,
                    0.32,
                );
                record.group.rotation.z = Math.sin(entity.bobPhase || 0) * 0.025;
                for (const { pivot, side } of record.paddles) {
                    const phase = (entity.paddlePhase || 0) + (side < 0 ? Math.PI : 0);
                    pivot.rotation.x = side * (0.12 + Math.sin(phase) * 0.32);
                }
                continue;
            }
            const light = renderLightTint(
                entity.getLightLevel?.(), entity.getSkyExposure?.() ?? entity.getSunLight?.(), lighting,
            );
            const aquaticPhase = entity.swimPhase || 0;
            const aquaticBob = entity.isAquatic ? Math.sin(aquaticPhase * 2) * 0.015 : 0;
            record.group.position.set((entity.position.x + entity.hitbox.x / 2) / BLOCK_SIZE,
                -(entity.position.y + entity.hitbox.y) / BLOCK_SIZE + aquaticBob, 0.05);
            if (record.catfishRig) {
                updateAlexCatfishRig(record, entity, seconds);
                record.material.color.setRGB(light, light, light);
                record.material.emissive.set(entity.body.flashingColor || 0);
                record.material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
                continue;
            }
            if (record.centipedeRig) {
                updateAlexCentipedeRig(record, entity, seconds);
                for (const material of record.materials) {
                    material.color.setRGB(light, light, light);
                    material.emissive.set(entity.body.flashingColor || 0);
                    material.emissiveIntensity = entity.body.flashingColor ? 0.65 :
                        (material === record.eyeMaterial ? 0.12 : 0);
                }
                continue;
            }
            if (record.eggModel) {
                record.material.color.setRGB(light, light, light);
                continue;
            }
            if (record.creeperRig) {
                record.group.position.y += 25 / 16;
                record.group.rotation.y = entity.direction < 0 ? -FACING_YAW : FACING_YAW;
                const duration = entity.attackPoseDuration || 0.4;
                const remaining = (entity.attackPoseUntil || 0) - seconds;
                const progress = remaining > 0 ? 1 - remaining / duration : 0;
                const attack = progress > 0 ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
                const walk = (entity.body.mutantWalkAmount || 0) * (1 - attack);
                const phase = entity.body.mutantWalkPhase || 0;
                record.group.position.y += mutantWalkBob("MutantCreeper", phase, walk);
                for (const definition of MUTANT_CREEPER_RIG) {
                    const joint = record.joints.get(definition.name);
                    joint.rotation.x = mutantPartPitch("MutantCreeper", definition.name,
                        phase, walk, attack, seconds);
                    joint.rotation.y = -(definition.yaw || 0);
                }
                record.material.color.setRGB(light, light, light);
                record.material.emissive.set(entity.body.flashingColor ||
                    (entity.powered ? 0x368cca : 0));
                record.material.emissiveIntensity = entity.body.flashingColor
                    ? 0.65 : entity.powered ? 0.25 : 0;
                continue;
            }
            if (record.mutantModel) {
                record.group.rotation.y = entity.direction < 0 ? -FACING_YAW : FACING_YAW;
                const walkPhase = entity.body.mutantWalkPhase || 0;
                const stride = entity.body.mutantWalkAmount || 0;

                const attackDuration = entity.attackPoseDuration || 0.4;
                const attackRemaining = (entity.attackPoseUntil || 0) - seconds;
                const attackProgress = attackRemaining > 0
                    ? 1 - attackRemaining / attackDuration
                    : 0;
                const attackSwing = attackProgress > 0
                    ? Math.sin(Math.min(1, attackProgress) * Math.PI)
                    : 0;
                const walkAmount = stride * (1 - attackSwing);
                record.group.position.y += mutantWalkBob(
                    entity.entityTypeName, walkPhase, walkAmount,
                );
                const angles = new Map(record.mutantParts.map(part => [part.name,
                    mutantPartPitch(entity.entityTypeName, part.name,
                        walkPhase, walkAmount, attackSwing, seconds)]));
                const positions = record.geometry.getAttribute("position");
                const normals = record.geometry.getAttribute("normal");
                for (const part of record.mutantParts) {
                    const angle = angles.get(part.name);
                    const cos = Math.cos(angle), sin = Math.sin(angle);
                    const parent = record.mutantPartByName.get(part.parentName);
                    const parentAngle = parent ? angles.get(parent.name) : 0;
                    const parentCos = Math.cos(parentAngle), parentSin = Math.sin(parentAngle);
                    const totalCos = Math.cos(angle + parentAngle);
                    const totalSin = Math.sin(angle + parentAngle);
                    for (let vertex = 0; vertex < part.base.length; vertex++) {
                        const [x, y, z] = part.base[vertex];
                        const dy = y - part.pivotY, dz = z - part.pivotZ;
                        let rotatedY = part.pivotY + dy * cos - dz * sin;
                        let rotatedZ = part.pivotZ + dy * sin + dz * cos;
                        if (parent) {
                            const parentY = rotatedY - parent.pivotY;
                            const parentZ = rotatedZ - parent.pivotZ;
                            rotatedY = parent.pivotY + parentY * parentCos - parentZ * parentSin;
                            rotatedZ = parent.pivotZ + parentY * parentSin + parentZ * parentCos;
                        }
                        positions.setXYZ(
                            part.vertexStart + vertex,
                            x,
                            rotatedY,
                            rotatedZ,
                        );
                        const [nx, ny, nz] = part.baseNormals[vertex];
                        normals.setXYZ(
                            part.vertexStart + vertex,
                            nx,
                            ny * totalCos - nz * totalSin,
                            ny * totalSin + nz * totalCos,
                        );
                    }
                }
                positions.needsUpdate = true;
                normals.needsUpdate = true;
                for (const material of record.materials) {
                    material.color.setRGB(light, light, light);
                    if (!material.userData.mutantGlow) {
                        material.emissive.set(entity.body.flashingColor || 0);
                        material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
                    }
                }
                continue;
            }
            if (record.ironGolem) {
                const stride = Math.abs(entity.velocity?.x ?? 0) > 5
                    ? Math.sin(seconds * 7) * 0.35
                    : 0;
                record.pivots.leg0.rotation.x = stride;
                record.pivots.leg1.rotation.x = -stride;
                record.pivots.arm0.rotation.x = -stride * 0.12;
                record.pivots.arm1.rotation.x = stride * 0.12;
                record.group.rotation.y = entity.direction < 0
                    ? -FACING_YAW
                    : FACING_YAW;
                record.material.color.setRGB(light, light, light);
                record.material.emissive.set(entity.body.flashingColor || 0);
                record.material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
                continue;
            }
            if (record.snowGolem) {
                const stride = Math.abs(entity.velocity?.x ?? 0) > 5
                    ? Math.sin(seconds * 7) * 0.08
                    : 0;
                record.group.rotation.y = entity.direction < 0
                    ? -FACING_YAW
                    : FACING_YAW;
                record.pivots.leftArm.rotation.z = 0.2 + stride;
                record.pivots.rightArm.rotation.z = -0.2 + stride;
                for (const material of record.materials) {
                    material.color.setRGB(light, light, light);
                    material.emissive.set(entity.body.flashingColor || 0);
                    material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
                }
                continue;
            }
            if (record.bodylessSprite) {
                record.group.rotation.y = 0;
                record.group.scale.x = entity.direction < 0 ? -1 : 1;
                record.material.color.setRGB(light, light, light);
                continue;
            }
            if (record.minionModel) {
                record.group.rotation.y = entity.direction < 0
                    ? -FACING_YAW
                    : FACING_YAW;
                const walkAmount = entity.walkAnimationAmount || 0;
                const limbPhase = (entity.walkAnimationPhase || 0) * 0.6662;
                const working = Boolean(entity.miningKey) && entity.miningTimer > 0;
                const swing = working
                    ? Math.max(0, Math.min(1, entity.workSwingProgress || 0))
                    : 0;
                const bodyYaw = swing > 0
                    ? Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2
                    : 0;
                const ageInTicks = seconds * 20;
                const headPitch = getHeadPitch(entity.lookDirection);
                const idleArmSway = Math.cos(ageInTicks * 0.09) * 0.05 + 0.05;
                const idleArmPitch = Math.sin(ageInTicks * 0.067) * 0.05;
                record.pivots.torso.rotation.y = bodyYaw;
                record.pivots.rightArm.position.set(
                    ...minionModelPosition([
                        -Math.cos(bodyYaw) * 5,
                        11,
                        Math.sin(bodyYaw) * 5,
                    ]),
                );
                record.pivots.leftArm.position.set(
                    ...minionModelPosition([
                        Math.cos(bodyYaw) * 5,
                        11,
                        -Math.sin(bodyYaw) * 5,
                    ]),
                );
                record.material.color.setRGB(light, light, light);
                record.material.emissive.set(entity.body.flashingColor || 0);
                record.material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
                const carrying = Boolean(entity.carriedEntityUUID);
                record.pivots.rightLeg.rotation.x =
                    -Math.cos(limbPhase) * 1.4 * walkAmount;
                record.pivots.leftLeg.rotation.x =
                    -Math.cos(limbPhase + Math.PI) * 1.4 * walkAmount;
                let rightArmPitch =
                    Math.cos(limbPhase + Math.PI) * walkAmount + idleArmPitch;
                const leftArmPitch =
                    Math.cos(limbPhase) * walkAmount - idleArmPitch + bodyYaw;
                record.pivots.rightArm.rotation.y = bodyYaw * 3;
                record.pivots.leftArm.rotation.y = bodyYaw;
                record.pivots.rightArm.rotation.z =
                    -idleArmSway + Math.sin(swing * Math.PI) * 0.4;
                record.pivots.leftArm.rotation.z = idleArmSway;
                if (swing > 0) {
                    const easedSwing = 1 - (1 - swing) ** 4;
                    const strike = Math.sin(easedSwing * Math.PI) * 1.2 +
                        Math.sin(swing * Math.PI) * -(headPitch - 0.7) * 0.75;
                    rightArmPitch -= strike;
                }
                record.pivots.rightArm.rotation.x = -rightArmPitch;
                record.pivots.leftArm.rotation.x = -leftArmPitch;
                if (carrying) {
                    record.pivots.leftArm.rotation.x = Math.PI;
                    record.pivots.rightArm.rotation.x = Math.PI;
                }
                record.pivots.head.rotation.x = headPitch;
                this.updateHeld(record, entity, "rightArm");
                if (record.held) {
                    const heldItem = entity.holdItem?.itemId != null
                        ? getItem(entity.holdItem.itemId)
                        : null;
                    const heldTool = heldItem?.toolType !== undefined &&
                        heldItem.toolType !== ToolType.Nothing;
                    record.held.rotation.y = entity.direction < 0
                        ? Math.PI / 2
                        : -Math.PI / 2;
                    record.held.rotation.z = Math.PI / (heldTool ? -1.35 : 2);
                    record.held.scale.x = heldTool
                        ? -entity.direction
                        : entity.direction;
                }
                continue;
            }
            record.group.rotation.y = entity.body.sprite.startsWith("dragon/") || record.portraitSprite
                ? 0 : entity.body.sprite.startsWith("villager/")
                    ? (entity.direction < 0 ? -Math.PI / 4 : Math.PI / 4)
                    : entity.direction < 0 ? -FACING_YAW : FACING_YAW;
            if (entity.body.sprite.startsWith("dragon/"))
                record.group.scale.x = entity.direction < 0 ? -1 : 1;
            else if (record.portraitSprite)
                record.group.scale.x = entity.direction < 0 ? -1 : 1;
            record.group.rotation.z = entity.isAquatic
                ? Math.sin(aquaticPhase) * 0.025
                : 0;
            const swimAmount = entity.body.swimAmount || 0;
            const boatAmount = entity.body.boatAmount || 0;
            const bendPose = entity.body.bendPose;
            record.pose.rotation.x = swimAmount * Math.PI / 2 + (bendPose?.lean || 0);
            if (bendPose) record.group.position.y += bendPose.bob;
            record.material.color.setRGB(light, light, light);
            record.material.emissive.set(entity.body.flashingColor || 0);
            record.material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
            if (record.enderman) {
                const moving = Math.abs(entity.velocity?.x ?? 0) > 5;
                const stride = moving ? Math.sin(seconds * 8) * 0.4 : 0;
                record.pivots.head.rotation.x = getHeadPitch(entity.lookDirection);
                record.pivots.rightArm.rotation.x = -stride * 0.5;
                record.pivots.leftArm.rotation.x = stride * 0.5;
                record.pivots.rightLeg.rotation.x = -stride;
                record.pivots.leftLeg.rotation.x = stride;
                continue;
            }
            if (record.tailMaterial) {
                record.tailMaterial.color.setRGB(light, light, light);
                record.tailMaterial.emissive.set(entity.body.flashingColor || 0);
                record.tailMaterial.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
            }
            for (const [name, joint] of Object.entries(record.pivots)) {
                if (entity.isAquatic && name === "tail") {
                    joint.rotation.z = entity.body.parts.tail.rotation *
                        Math.PI / 180;
                    continue;
                }
                if (["torso", "snout", "robe"].includes(name)) continue;
                if (name === "head") {
                    joint.rotation.x = getHeadPitch(entity.lookDirection);
                } else {
                    const part = entity.body.parts[name];
                    joint.rotation.x = part ? getLimbPitch(part, entity.direction) :
                        Math.sin(seconds * 8 + (name === "leftLeg" || name === "farLeg" ? 0 : Math.PI)) * Math.min(0.65, Math.abs(entity.velocity?.x || 0) / 200);
                }
                if (bendPose?.pitch[name] != null) {
                    joint.rotation.x = bendPose.pitch[name];
                    record.bends[name].rotation.x = bendPose.bend[name] || 0;
                    continue;
                }
                if (swimAmount > 0 && !entity.body.parts[name]?.isSwinging) {
                    joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x,
                        getSwimPartPitch(name, entity.body.swimPhase), swimAmount);
                }
                if (boatAmount > 0 && !entity.body.parts[name]?.isSwinging) {
                    const side = entity.body.parts[name]?.zIndex < 0 ? -1 : 1;
                    const facing = entity.direction < 0 ? -1 : 1;
                    joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x,
                        getBoatPartPitch(name, entity.body.boatPhase) * facing * side,
                        boatAmount);
                }
            }
            this.updateHeld(record, entity);
        }
        for (const entity of this.models.keys()) if (!visible.has(entity)) this.remove(entity);
    }

    remove(entity) {
        const record = this.models.get(entity);
        if (!record) return;
        const disposedMaterials = new Set();
        record.group.traverse((mesh) => {
            if (mesh.geometry && !record.sharedGeometry) mesh.geometry.dispose();
            if (!record.sharedMaterials) {
                const materials = Array.isArray(mesh.material)
                    ? mesh.material
                    : [mesh.material];
                for (const material of materials) {
                    if (!material || material === record.material ||
                        disposedMaterials.has(material)) continue;
                    if (!record.sharedTextures) material.map?.dispose();
                    material.dispose();
                    disposedMaterials.add(material);
                }
            }
        });
        record.texture?.dispose();
        record.material?.dispose();
        this.scene.remove(record.group); this.models.delete(entity);
    }

    dispose() {
        for (const entity of this.models.keys()) this.remove(entity);
        if (this.ironGolemResources) {
            this.ironGolemResources.texture.dispose();
            for (const geometry of this.ironGolemResources.geometries.values()) {
                geometry.dispose();
            }
            this.ironGolemResources = null;
        }
        if (this.snowGolemResources) {
            for (const texture of Object.values(this.snowGolemResources)) {
                texture.dispose();
            }
            this.snowGolemResources = null;
        }
        for (const resources of this.mutantResources.values()) {
            resources.geometry.dispose();
            for (const material of resources.materials) material.dispose();
        }
        for (const texture of this.mutantTextures.values()) texture.dispose();
        this.mutantResources.clear();
        this.mutantTextures.clear();
    }
}
