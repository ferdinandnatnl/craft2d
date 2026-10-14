import * as THREE from "three";
import { skinBox } from "./entityGeometry.js";

const SOURCE_SCALE = 0.9;

/**
 * Three.js translation of Alex's Mobs 1.22.9 ModelCrocodile geometry.
 * The original model is authored along Minecraft's Z axis. The entity
 * renderer turns that axis into the side-scrolling world direction.
 */
export function createAlexCrocodileRig(image, crownImage) {
    const texture = createTexture(image);
    const crownTexture = createTexture(crownImage);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.95,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
    });
    const crownMaterial = new THREE.MeshStandardMaterial({
        map: crownTexture,
        roughness: 0.95,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.name = "alexsmobs-crocodile";
    const model = new THREE.Group();
    model.name = "crocodile-model-root";
    model.scale.setScalar(SOURCE_SCALE);
    group.add(model);

    const pivots = {};
    const part = (parent, name, [x, y, z], parentPosition = true) => {
        const joint = new THREE.Group();
        joint.name = name;
        if (parentPosition) joint.position.set(x / 16, -y / 16, z / 16);
        parent.add(joint);
        pivots[name] = joint;
        return joint;
    };
    const box = (parent, { x, y, z, w, h, d, u, v, mirror = false }, mat = material) => {
        const geometryWidth = Math.max(w, 0.025);
        const geometryHeight = Math.max(h, 0.025);
        const geometryDepth = Math.max(d, 0.025);
        const geometry = skinBox(
            geometryWidth,
            geometryHeight,
            geometryDepth,
            u,
            v,
            image,
            mirror,
            [w, h, d],
        );
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(
            (x + w / 2) / 16,
            -(y + h / 2) / 16,
            (z + d / 2) / 16,
        );
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };

    // Source ModelCrocodile: body, head, jaw, four articulated legs, and
    // three connected tail sections. The texture coordinates come from the
    // same 256x256 source model atlas.
    const body = part(model, "body", [0, -9, 0]);
    box(body, { x: -8, y: -7, z: -13, w: 16, h: 12, d: 27, u: 0, v: 0 });

    const leftLeg = part(body, "leftLeg", [8, 3, 10]);
    box(leftLeg, { x: -2, y: -2, z: -5, w: 5, h: 8, d: 8, u: 0, v: 0 });
    const leftFoot = part(leftLeg, "leftFoot", [2, 6, -3]);
    box(leftFoot, { x: -2, y: -0.01, z: -5, w: 5, h: 0, d: 6, u: 45, v: 42 });

    const rightLeg = part(body, "rightLeg", [-8, 3, 10]);
    box(rightLeg, { x: -3, y: -2, z: -5, w: 5, h: 8, d: 8, u: 0, v: 0, mirror: true });
    const rightFoot = part(rightLeg, "rightFoot", [-2, 6, -3]);
    box(rightFoot, { x: -3, y: -0.01, z: -5, w: 5, h: 0, d: 6, u: 45, v: 42, mirror: true });

    const leftArm = part(body, "leftArm", [9, 1, -9]);
    box(leftArm, { x: -2, y: -2, z: -2, w: 4, h: 10, d: 4, u: 0, v: 40 });
    const leftHand = part(leftArm, "leftHand", [0, 8, 1]);
    box(leftHand, { x: -2, y: -0.01, z: -7, w: 6, h: 0, d: 7, u: 0, v: 17 });

    const rightArm = part(body, "rightArm", [-9, 1, -9]);
    box(rightArm, { x: -2, y: -2, z: -2, w: 4, h: 10, d: 4, u: 0, v: 40, mirror: true });
    const rightHand = part(rightArm, "rightHand", [0, 8, 1]);
    box(rightHand, { x: -4, y: -0.01, z: -7, w: 6, h: 0, d: 7, u: 0, v: 17, mirror: true });

    const tail1 = part(body, "tail1", [0, 0, 16]);
    box(tail1, { x: -5, y: -5, z: -2, w: 10, h: 10, d: 24, u: 0, v: 40 });
    box(tail1, { x: -5, y: -7, z: -2, w: 10, h: 2, d: 24, u: 45, v: 51 });
    const tail2 = part(tail1, "tail2", [0, 1, 24]);
    box(tail2, { x: -3, y: -3, z: -2, w: 6, h: 7, d: 25, u: 62, v: 15 });
    box(tail2, { x: -2, y: -5, z: -2, w: 4, h: 2, d: 20, u: 43, v: 78 });
    const tail3 = part(tail2, "tail3", [0, 0, 18]);
    box(tail3, { x: 0, y: -6, z: 0, w: 0, h: 10, d: 21, u: 0, v: 75 });

    const neck = part(body, "neck", [0, 0, -15]);
    box(neck, { x: -6, y: -5, z: -10, w: 12, h: 10, d: 12, u: 80, v: 89 });
    box(neck, { x: -4, y: -6, z: -10, w: 8, h: 1, d: 12, u: 60, v: 0 });
    const head = part(neck, "head", [0, 1, -11]);
    box(head, { x: -5, y: -4, z: -5, w: 10, h: 4, d: 6, u: 72, v: 78 });
    box(head, { x: -4, y: -5, z: -5, w: 8, h: 1, d: 5, u: 60, v: 14 });
    box(head, { x: -3, y: -4, z: -17, w: 6, h: 4, d: 12, u: 22, v: 78 });

    const crown = part(head, "crown", [0, -5, -2]);
    box(crown, { x: -1.5, y: -5, z: -2, w: 3, h: 5, d: 3, u: 49, v: 54 }, crownMaterial);
    crown.visible = false;

    const leftUpperTeeth = part(head, "leftUpperTeeth", [0, 0, -17]);
    leftUpperTeeth.rotation.z = 0.0873;
    box(leftUpperTeeth, { x: 0, y: 0, z: -0.025, w: 3, h: 2, d: 11, u: 104, v: 23 });
    const rightUpperTeeth = part(head, "rightUpperTeeth", [0, 0, -17]);
    rightUpperTeeth.rotation.z = -0.0873;
    box(rightUpperTeeth, { x: -3, y: 0, z: -0.025, w: 3, h: 2, d: 11, u: 104, v: 23, mirror: true });

    const jaw = part(head, "jaw", [0, 0, 0]);
    box(jaw, { x: -5.5, y: -2, z: -6, w: 11, h: 5, d: 7, u: 100, v: 7 });
    box(jaw, { x: -3, y: 0, z: -17, w: 6, h: 3, d: 11, u: 90, v: 48 });
    const leftLowerTeeth = part(jaw, "leftLowerTeeth", [0, 0, -17]);
    leftLowerTeeth.rotation.z = -0.0873;
    box(leftLowerTeeth, { x: 0, y: -2, z: -0.025, w: 3, h: 2, d: 11, u: 105, v: 67 });
    const rightLowerTeeth = part(jaw, "rightLowerTeeth", [0, 0, -17]);
    rightLowerTeeth.rotation.z = 0.0873;
    box(rightLowerTeeth, { x: -3, y: -2, z: -0.025, w: 3, h: 2, d: 11, u: 105, v: 67, mirror: true });

    return {
        group,
        model,
        pivots,
        materials: [material, crownMaterial],
        textures: [texture, crownTexture],
        texture,
        material,
        crown,
        bodyBasePosition: body.position.clone(),
    };
}

export function updateAlexCrocodileRig(rig, entity, seconds) {
    const { pivots } = rig;
    const moving = Math.min(1, Math.abs(entity.velocity?.x || 0) / 180);
    const phase = entity.swimPhase || seconds * 5;
    const swimming = entity.swimming ? 1 : 0;
    const basking = !entity.tamed && entity.baskingTimer > 0 ? 1 : 0;
    const walkPhase = phase * (swimming ? 1 : 0.65);

    rig.model.rotation.y = entity.direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    rig.model.rotation.x = 0;
    pivots.body.position.copy(rig.bodyBasePosition);
    pivots.body.rotation.set(0, 0, 0);
    pivots.neck.rotation.set(0, 0, 0);
    pivots.head.rotation.set(0, 0, 0);
    pivots.jaw.rotation.set(0, 0, 0);
    pivots.tail1.rotation.set(0, 0, 0);
    pivots.tail2.rotation.set(0, 0, 0);
    pivots.tail3.rotation.set(0, 0, 0);

    for (const name of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
        const offset = name.startsWith("left") ? 0 : Math.PI;
        pivots[name].rotation.x = Math.sin(walkPhase + offset) * (0.32 * moving + 0.12 * swimming);
    }

    // In a side view, the source model's horizontal tail yaw becomes depth
    // motion. Add the matching in-plane flex so the articulated tail remains
    // legible while preserving the source's three-joint swim cycle.
    const tailAmount = 0.18 + 0.3 * swimming + 0.08 * moving;
    pivots.tail1.rotation.y = Math.sin(walkPhase) * tailAmount;
    pivots.tail2.rotation.y = Math.sin(walkPhase - 0.45) * tailAmount;
    pivots.tail3.rotation.y = Math.sin(walkPhase - 0.9) * tailAmount;
    pivots.tail1.rotation.x = Math.sin(walkPhase) * (0.06 + 0.1 * swimming);
    pivots.tail2.rotation.x = Math.sin(walkPhase - 0.45) * (0.08 + 0.12 * swimming);
    pivots.tail3.rotation.x = Math.sin(walkPhase - 0.9) * (0.1 + 0.14 * swimming);
    pivots.body.rotation.y = Math.sin(walkPhase) * 0.08 * (swimming + moving);
    pivots.neck.rotation.x = Math.sin(seconds * 0.7) * 0.025;

    if (basking) {
        pivots.body.rotation.z = 0.08;
        pivots.neck.rotation.x = -0.12;
        pivots.head.rotation.x = 0.45;
        pivots.jaw.rotation.x = -0.45;
        pivots.tail1.rotation.y += 0.28;
        pivots.tail2.rotation.y += 0.18;
        pivots.tail3.rotation.y += 0.1;
        for (const name of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
            pivots[name].rotation.z = name.startsWith("left") ? -0.3 : 0.3;
        }
    }

    if (entity.action === "lunge") {
        const tick = Math.max(0, entity.actionTicks || 0);
        const keyframe = interpolateLungePose(tick);
        pivots.body.position.z += keyframe.bodyZ / 16;
        pivots.head.rotation.x = keyframe.headX;
        pivots.jaw.rotation.x = keyframe.jawX;
        for (const name of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
            pivots[name].rotation.x += keyframe.limbX;
        }
    } else if (entity.action === "death_roll") {
        const progress = Math.min(1, Math.max(0, (entity.actionTicks || 0) / 40));
        pivots.body.rotation.z = -Math.PI * 6 * progress;
        pivots.neck.rotation.z = -Math.PI * 6 * progress * 0.12;
    }

    rig.crown.visible = Boolean(entity.crowned);
}

function createTexture(image) {
    if (image?.isTexture) return image;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

function interpolateLungePose(tick) {
    const frames = [
        { tick: 0, bodyZ: 0, headX: 0, jawX: 0, limbX: 0 },
        { tick: 2, bodyZ: 2, headX: 0.96, jawX: -1.05, limbX: 0 },
        { tick: 3, bodyZ: 2, headX: 0.96, jawX: -1.05, limbX: 0 },
        { tick: 8, bodyZ: -12, headX: 0.26, jawX: -0.35, limbX: 0.78 },
        { tick: 13, bodyZ: -9, headX: 0.17, jawX: -0.26, limbX: 0.78 },
        { tick: 23, bodyZ: 0, headX: 0, jawX: 0, limbX: 0 },
    ];
    const end = frames.findIndex((frame) => frame.tick >= tick);
    if (end <= 0) return frames[0];
    const left = frames[end - 1];
    const right = frames[end];
    const progress = THREE.MathUtils.clamp((tick - left.tick) / (right.tick - left.tick), 0, 1);
    return {
        bodyZ: THREE.MathUtils.lerp(left.bodyZ, right.bodyZ, progress),
        headX: THREE.MathUtils.lerp(left.headX, right.headX, progress),
        jawX: THREE.MathUtils.lerp(left.jawX, right.jawX, progress),
        limbX: THREE.MathUtils.lerp(left.limbX, right.limbX, progress),
    };
}
