import * as THREE from "three";
import { skinBox } from "./entityGeometry.js";

const SOURCE_SCALE = 0.4;

/** Three.js translation of Alex's Mobs 1.22.9 ModelCaiman geometry. */
export function createAlexCaimanRig(image) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.95,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.name = "alexsmobs-caiman";
    const model = new THREE.Group();
    model.name = "caiman-model-root";
    model.scale.setScalar(SOURCE_SCALE);
    group.add(model);

    const pivots = {};
    const part = (parent, name, [x, y, z]) => {
        const joint = new THREE.Group();
        joint.name = name;
        joint.position.set(x / 16, -y / 16, z / 16);
        parent.add(joint);
        pivots[name] = joint;
        return joint;
    };
    const box = (parent, name, { x, y, z, w, h, d, u, v, mirror = false }) => {
        const geometry = skinBox(
            Math.max(w, 0.025),
            Math.max(h, 0.025),
            Math.max(d, 0.025),
            u,
            v,
            image,
            mirror,
            [w, h, d],
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(
            (x + w / 2) / 16,
            -(y + h / 2) / 16,
            (z + d / 2) / 16,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };

    const body = part(model, "body", [0, -4, 0]);
    box(body, "body-box", { x: -4, y: -3, z: -8, w: 8, h: 6, d: 16, u: 0, v: 0 });

    const leftLeg = part(body, "leftLeg", [4, 1, 6]);
    box(leftLeg, "left-leg", { x: -1, y: -1, z: -4, w: 3, h: 4, d: 5, u: 56, v: 13 });
    const leftFoot = part(leftLeg, "leftFoot", [1, 3, -3]);
    box(leftFoot, "left-foot", { x: -2, y: -0.01, z: -4, w: 5, h: 0, d: 5, u: 26, v: 55 });

    const rightLeg = part(body, "rightLeg", [-4, 1, 6]);
    box(rightLeg, "right-leg", { x: -2, y: -1, z: -4, w: 3, h: 4, d: 5, u: 56, v: 13, mirror: true });
    const rightFoot = part(rightLeg, "rightFoot", [-1, 3, -3]);
    box(rightFoot, "right-foot", { x: -3, y: -0.01, z: -4, w: 5, h: 0, d: 5, u: 26, v: 55, mirror: true });

    const leftArm = part(body, "leftArm", [4.2, 0.2, -5.5]);
    box(leftArm, "left-arm", { x: -1.2, y: -1.2, z: -1.5, w: 3, h: 5, d: 3, u: 0, v: 0 });
    const leftHand = part(leftArm, "leftHand", [0.3, 3.8, -0.5]);
    box(leftHand, "left-hand", { x: -2.5, y: -0.01, z: -4, w: 5, h: 0, d: 5, u: 55, v: 39 });

    const rightArm = part(body, "rightArm", [-4.2, 0.2, -5.5]);
    box(rightArm, "right-arm", { x: -1.8, y: -1.2, z: -1.5, w: 3, h: 5, d: 3, u: 0, v: 0, mirror: true });
    const rightHand = part(rightArm, "rightHand", [-0.3, 3.8, -0.5]);
    box(rightHand, "right-hand", { x: -2.5, y: -0.01, z: -4, w: 5, h: 0, d: 5, u: 55, v: 39, mirror: true });

    const tail1 = part(body, "tail1", [0, 0, 7]);
    box(tail1, "tail-base", { x: -3, y: -2, z: 1, w: 6, h: 5, d: 11, u: 0, v: 23 });
    box(tail1, "tail-base-ridge", { x: -2, y: -3, z: 7, w: 4, h: 1, d: 5, u: 24, v: 23 });
    box(tail1, "tail-base-fin", { x: -4, y: -2, z: 1, w: 8, h: 0, d: 6, u: 50, v: 28 });
    const tail2 = part(tail1, "tail2", [0, 1, 12]);
    box(tail2, "tail-mid", { x: -1.5, y: -2, z: 0, w: 3, h: 4, d: 10, u: 39, v: 13 });
    box(tail2, "tail-mid-ridge", { x: -1.5, y: -4, z: 0, w: 3, h: 2, d: 10, u: 43, v: 45 });
    const tail3 = part(tail2, "tail3", [0, 0, 10]);
    box(tail3, "tail-tip-fin", { x: 0, y: -3, z: 0, w: 0, h: 5, d: 10, u: 15, v: 55 });

    const head = part(body, "head", [0, 0, -10]);
    box(head, "head", { x: -3.5, y: -5, z: -3, w: 7, h: 7, d: 5, u: 0, v: 52 });
    box(head, "head-ridge", { x: -2.5, y: -6, z: -3, w: 5, h: 1, d: 3, u: 58, v: 0 });
    const bottomJaw = part(head, "bottomJaw", [0, -3, -2]);
    box(bottomJaw, "lower-jaw", { x: -3, y: 0, z: -10, w: 6, h: 2, d: 9, u: 0, v: 40 });
    box(bottomJaw, "lower-jaw-lip", { x: -3, y: -1, z: -10, w: 6, h: 1, d: 9, u: 22, v: 44 });
    const topJaw = part(head, "topJaw", [0, -4, -3]);
    box(topJaw, "upper-jaw", { x: -3.5, y: -1, z: -10, w: 7, h: 2, d: 10, u: 33, v: 0 });
    box(topJaw, "upper-jaw-side", { x: -3.5, y: 1, z: -10, w: 7, h: 3, d: 10, u: 25, v: 30 });

    return {
        group,
        model,
        pivots,
        material,
        materials: [material],
        texture,
        bodyBasePosition: body.position.clone(),
        source: image.src,
    };
}

export function updateAlexCaimanRig(rig, entity, seconds) {
    const { pivots, model } = rig;
    const phase = entity.swimPhase || seconds * 5;
    const swimming = entity.swimming ? 1 : 0;
    const moving = Math.min(1, Math.abs(entity.velocity?.x || 0) / 90);
    const active = swimming || moving;

    model.rotation.y = entity.direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    model.position.y = 0;
    model.scale.setScalar(SOURCE_SCALE * (entity.isBaby ? 0.25 : 1));
    pivots.head.scale.setScalar(entity.isBaby ? 1.25 : 1);
    pivots.body.position.copy(rig.bodyBasePosition);
    pivots.body.rotation.set(0, 0, 0);
    pivots.head.rotation.set(0, 0, 0);
    pivots.bottomJaw.rotation.set(0, 0, 0);
    pivots.topJaw.rotation.set(0, 0, 0);

    for (const name of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
        const phaseOffset = name.startsWith("left") ? 0 : Math.PI;
        pivots[name].rotation.set(
            Math.sin(phase + phaseOffset) * (0.08 + moving * 0.28 + swimming * 0.18),
            0,
            swimming ? (name.startsWith("left") ? -0.25 : 0.25) : 0,
        );
    }
    for (const [index, name] of ["tail1", "tail2", "tail3"].entries()) {
        const offset = phase - index * 0.55;
        pivots[name].rotation.y = Math.sin(offset) * (0.08 + active * 0.34);
        pivots[name].rotation.x = Math.sin(offset) * (0.04 + swimming * 0.11);
    }
    pivots.body.position.y += Math.sin(phase * 2) * (0.02 + swimming * 0.025);
    pivots.head.rotation.x = Math.sin(seconds * 0.8) * 0.025;

    const sitting = entity.tamed && entity.command === 2;
    const jawOpen = entity.bellowing ? 0.5 : entity.grabbedTargetUUID ? 0.25 : 0;
    pivots.bottomJaw.rotation.x = jawOpen + (sitting ? 0.03 : 0);
    pivots.topJaw.rotation.x = -jawOpen * 0.45;
    if (sitting) {
        pivots.body.rotation.z = 0.08;
        pivots.head.rotation.x += 0.18;
        pivots.tail1.rotation.y += 0.45;
        pivots.tail2.rotation.y += 0.35;
        pivots.tail3.rotation.y += 0.25;
    }

    if (entity.action === "attack") {
        pivots.head.rotation.x += 0.18;
        pivots.bottomJaw.rotation.x = 0.45;
    }
}
