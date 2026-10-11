import * as THREE from "three";
import { BLOCK_SIZE } from "../utils/globals.js";
import { getSpriteUrl } from "../utils/texturePackLoader.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { getBlock } from "../world/block.js";
import { getHeadPitch, getLimbPitch, getSwimPartPitch } from "./entityPose.js";
import { skinBox } from "./entityGeometry.js";

export class VoxelEntities {
    constructor(scene) {
        this.scene = scene;
        this.models = new Map();
    }

    create(entity) {
        const image = entity.body?.image;
        if (!image?.complete || !image.naturalWidth) return null;
        const group = new THREE.Group();
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.needsUpdate = true;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, alphaTest: 0.1 });
        const pivots = {};
        const part = (name, dims, uv, pos, pivot = false) => {
            const mesh = new THREE.Mesh(skinBox(...dims, ...uv, image), material);
            mesh.castShadow = mesh.receiveShadow = true;
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
        const species = entity.body.sprite.split("/")[0];
        const quadruped = ["cow", "pig", "sheep"].includes(species);
        const creeper = species === "creeper";
        if (species === "dragon") {
            material.side = THREE.DoubleSide;
            const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), material);
            silhouette.position.set(0, 1, 0);
            group.add(silhouette);
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
            part("head", [8, 8, 8], [0, 0], [0, 1.75, 0]);
            part("torso", [8, 12, 4], [16, 16], [0, 1.125, 0]);
            if (creeper) {
                for (const [name, x, z] of [["leftLeg", -0.14, 0.14], ["rightLeg", 0.14, 0.14], ["backLeg", -0.14, -0.14], ["farLeg", 0.14, -0.14]]) {
                    part(name, [4, 6, 4], [0, 16], [x, 0.75, z], true);
                }
            } else {
                const modern = image.height >= image.width;
                const thin = skeleton ? 2 : entity.skinModel === "alex" ? 3 : 4;
                part("rightArm", [thin, 12, skeleton ? 2 : 4], [40, 16], [-0.25 - thin / 32, 1.5, 0], true);
                part("leftArm", [thin, 12, skeleton ? 2 : 4], modern ? [32, 48] : [40, 16], [0.25 + thin / 32, 1.5, 0], true);
                part("rightLeg", [skeleton ? 2 : 4, 12, skeleton ? 2 : 4], [0, 16], [-0.125, 0.75, 0], true);
                part("leftLeg", [skeleton ? 2 : 4, 12, skeleton ? 2 : 4], modern ? [16, 48] : [0, 16], [0.125, 0.75, 0], true);
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
        const record = { group, pose, texture, material, pivots, source: image.src, quadruped, heldKey: null };
        this.scene.add(group);
        return record;
    }

    updateHeld(record, entity) {
        const item = entity.holdItem;
        const def = item?.blockId != null ? getBlock(item.blockId) : item?.itemId != null ? getItem(item.itemId) : null;
        const key = def?.sprite ? `${item.blockId != null ? "blocks" : "items"}/${def.sprite}` : null;
        if (record.heldKey === key) return;
        if (record.held) {
            record.held.parent.remove(record.held);
            record.held.geometry.dispose(); record.held.material.map.dispose(); record.held.material.dispose();
            record.held = null;
        }
        record.heldKey = key;
        if (!key || !record.pivots.leftArm) return;
        const map = new THREE.TextureLoader().load(getSpriteUrl(key));
        map.magFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), material);
        mesh.position.set(0, -0.7, 0.28); mesh.rotation.y = Math.PI / 2;
        mesh.castShadow = true;
        record.pivots.leftArm.add(mesh); record.held = mesh;
    }

    update(entities, dimension, camera, seconds, lighting) {
        const visible = new Set();
        for (const entity of entities) {
            if (entity.dimension !== dimension || !entity.body || Math.abs(entity.position.x / BLOCK_SIZE - camera.position.x) > 30) continue;
            visible.add(entity);
            let record = this.models.get(entity);
            if (record && record.source !== entity.body.image.src) {
                this.remove(entity); record = null;
            }
            if (!record) {
                record = this.create(entity);
                if (!record) continue;
                this.models.set(entity, record);
            }
            record.group.position.set((entity.position.x + entity.hitbox.x / 2) / BLOCK_SIZE,
                -(entity.position.y + entity.hitbox.y) / BLOCK_SIZE, 0.05);
            record.group.rotation.y = entity.body.sprite.startsWith("dragon/")
                ? 0 : entity.direction < 0 ? -Math.PI / 2 + 0.18 : Math.PI / 2 - 0.18;
            if (entity.body.sprite.startsWith("dragon/"))
                record.group.scale.x = entity.direction < 0 ? -1 : 1;
            const swimAmount = entity.body.swimAmount || 0;
            record.pose.rotation.x = swimAmount * Math.PI / 2;
            const light = lighting ? Math.max(0.08, Math.min(1, (entity.getLightLevel?.() ?? 15) / 15)) : 1;
            record.material.color.setRGB(light, light, light);
            record.material.emissive.set(entity.body.flashingColor || 0);
            record.material.emissiveIntensity = entity.body.flashingColor ? 0.65 : 0;
            for (const [name, joint] of Object.entries(record.pivots)) {
                if (name === "torso" || name === "snout") continue;
                if (name === "head") {
                    joint.rotation.x = getHeadPitch(entity.lookDirection);
                } else {
                    const part = entity.body.parts[name];
                    joint.rotation.x = part ? getLimbPitch(part, entity.direction) :
                        Math.sin(seconds * 8 + (name === "leftLeg" || name === "farLeg" ? 0 : Math.PI)) * Math.min(0.65, Math.abs(entity.velocity?.x || 0) / 200);
                }
                if (swimAmount > 0 && !entity.body.parts[name]?.isSwinging) {
                    joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x,
                        getSwimPartPitch(name, entity.body.swimPhase), swimAmount);
                }
            }
            this.updateHeld(record, entity);
        }
        for (const entity of this.models.keys()) if (!visible.has(entity)) this.remove(entity);
    }

    remove(entity) {
        const record = this.models.get(entity);
        if (!record) return;
        record.group.traverse((mesh) => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material && mesh.material !== record.material) {
                mesh.material.map?.dispose(); mesh.material.dispose();
            }
        });
        record.texture.dispose(); record.material.dispose();
        this.scene.remove(record.group); this.models.delete(entity);
    }

    dispose() {
        for (const entity of this.models.keys()) this.remove(entity);
    }
}
